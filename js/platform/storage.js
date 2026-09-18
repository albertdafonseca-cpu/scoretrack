// Accès sûr à localStorage : JSON, try/catch systématique, détection de quota.
// Sauvegarde de partie (KEYS.save) : écriture atomique (clé `.tmp` puis bascule), conservation de la dernière
// sauvegarde valide (`.prev`), quarantaine d'une sauvegarde illisible (`.corrupt`, jamais effacée en silence),
// écritures coalescées (une par trame au plus, vidées sur pagehide / passage en arrière-plan).
import { KEYS, parseGame, parseGameOrNull } from '../core/save-schema.js';
import { logError } from './errors.js';

/** Clés annexes de la sauvegarde de partie. */
export const SAVE_TMP_KEY = `${KEYS.save}.tmp`;
export const SAVE_PREV_KEY = `${KEYS.save}.prev`;
export const SAVE_CORRUPT_KEY = `${KEYS.save}.corrupt`;
/** Événement window émis après chaque écriture/suppression : `detail = { key }`. */
export const STORAGE_EVENT = 'scoretrack:storage';

const failureListeners = new Set();
/** Clés déjà signalées comme non écrites (une alerte par clé et par session, pas un flot de messages). */
const reportedFailures = new Set();

/**
 * Abonne `cb({ key, reason: 'quota'|'unavailable'|'error' })` à l'échec d'une écriture persistante :
 * la partie continue en mémoire, mais l'utilisateur doit l'apprendre. Renvoie la fonction de désabonnement.
 */
export function onStorageFailure(cb) {
  failureListeners.add(cb);
  return () => failureListeners.delete(cb);
}

function notifyFailure(key, reason) {
  const seen = `${key}:${reason}`;
  if (reportedFailures.has(seen)) return;
  reportedFailures.add(seen);
  failureListeners.forEach((cb) => {
    try {
      cb({ key, reason });
    } catch {
      /* un observateur défaillant ne doit pas masquer l'échec d'écriture */
    }
  });
}

const hasWindow = typeof window !== 'undefined';

function ls() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isQuotaError(e) {
  return (
    e &&
    (e.name === 'QuotaExceededError' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.code === 22 ||
      e.code === 1014)
  );
}

function notify(key) {
  if (!hasWindow) return;
  try {
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: { key } }));
  } catch {
    /* environnement sans CustomEvent */
  }
}

function getRaw(key) {
  const s = ls();
  try {
    return s ? s.getItem(key) : null;
  } catch {
    return null;
  }
}

function setRaw(key, raw) {
  const s = ls();
  if (!s) {
    notifyFailure(key, 'unavailable');
    return false;
  }
  try {
    s.setItem(key, raw);
    return true;
  } catch (e) {
    const quota = isQuotaError(e);
    logError(e, quota ? `storage.quota:${key}` : `storage.write:${key}`);
    notifyFailure(key, quota ? 'quota' : 'error');
    return false;
  }
}

function removeRaw(key) {
  const s = ls();
  if (!s) return;
  try {
    s.removeItem(key);
  } catch (e) {
    logError(e, `storage.remove:${key}`);
  }
}

/** Vrai si `raw` est une sauvegarde de partie exploitable (JSON valide + schéma accepté). */
function isValidSave(raw) {
  if (typeof raw !== 'string') return false;
  try {
    return parseGame(raw).ok === true;
  } catch {
    return false;
  }
}

// ── Intégrité de la sauvegarde ─────────────────────────────────────

let saveChecked = false;

/**
 * Vérifie une fois par session la sauvegarde de partie : une écriture interrompue est finalisée depuis `.tmp`,
 * une sauvegarde illisible est mise en quarantaine dans `.corrupt` (jamais supprimée sans décision de l'utilisateur).
 */
function ensureSaveChecked() {
  if (saveChecked || !ls()) return;
  saveChecked = true;
  const tmp = getRaw(SAVE_TMP_KEY);
  let raw = getRaw(KEYS.save);
  if (raw === null && isValidSave(tmp)) {
    // Écriture interrompue après `.tmp` : on la finalise.
    if (setRaw(KEYS.save, tmp)) raw = tmp;
  }
  if (tmp !== null) removeRaw(SAVE_TMP_KEY);
  if (raw !== null && !isValidSave(raw)) {
    logError(new Error('Sauvegarde illisible mise en quarantaine'), 'storage.corrupt');
    setRaw(SAVE_CORRUPT_KEY, raw);
    removeRaw(KEYS.save);
    notify(KEYS.save);
  }
}

/**
 * État de récupération de la partie sauvegardée, pour la bannière de reprise :
 * `{ status: 'ok' | 'corrupt' | 'none', prevAvailable, prev, prevTs }` — `prev` = état plat normalisé
 * (`parseGameOrNull`) de la dernière sauvegarde valide, ou null ; `prevTs` = sa date (ms), pour l'aperçu.
 */
export function getRecoveryState() {
  ensureSaveChecked();
  flushWrites();
  const main = getRaw(KEYS.save);
  const prevRaw = getRaw(SAVE_PREV_KEY);
  const prevAvailable = isValidSave(prevRaw);
  let status = 'none';
  if (isValidSave(main)) status = 'ok';
  else if (getRaw(SAVE_CORRUPT_KEY) !== null) status = 'corrupt';
  let prev = null;
  let prevTs = 0;
  if (prevAvailable) {
    prev = parseGameOrNull(prevRaw);
    prevTs = prev && Number.isFinite(prev.ts) ? prev.ts : 0;
  }
  return { status, prevAvailable, prev, prevTs };
}

/** Remet la dernière sauvegarde valide (`.prev`) en place de la sauvegarde principale ; true si réussi. */
export function restorePrev() {
  ensureSaveChecked();
  const prevRaw = getRaw(SAVE_PREV_KEY);
  if (!isValidSave(prevRaw) || !setRaw(KEYS.save, prevRaw)) return false;
  removeRaw(SAVE_CORRUPT_KEY);
  notify(KEYS.save);
  return true;
}

/** Abandonne la sauvegarde en quarantaine (décision explicite de l'utilisateur). */
export function dismissCorruptSave() {
  removeRaw(SAVE_CORRUPT_KEY);
  removeRaw(SAVE_PREV_KEY);
  notify(KEYS.save);
}

// ── Écritures coalescées ───────────────────────────────────────────

const pending = new Map();
let frame = 0;

/** Écrit immédiatement toutes les écritures en attente ; renvoie true si toutes ont réussi. */
export function flushWrites() {
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  if (!pending.size) return true;
  const batch = [...pending];
  pending.clear();
  let ok = true;
  for (const [key, value] of batch) ok = writeJSON(key, value) && ok;
  return ok;
}

/**
 * Écriture différée et coalescée : la dernière valeur d'une clé est écrite au plus une fois par trame
 * (immédiatement si la page est en arrière-plan). `readJSON`/`has` voient la valeur en attente.
 */
export function scheduleWrite(key, value) {
  pending.set(key, value);
  if (!hasWindow || document.hidden || typeof requestAnimationFrame !== 'function') {
    flushWrites();
    return;
  }
  if (!frame) frame = requestAnimationFrame(flushWrites);
}

if (hasWindow) {
  window.addEventListener('pagehide', flushWrites);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushWrites();
  });
}

// ── Persistance et quota ───────────────────────────────────────────

let persistRequested = false;

/** Demande au navigateur de protéger le stockage de l'éviction (une fois par session) ; renvoie une promesse. */
export function requestPersistentStorage() {
  if (persistRequested) return Promise.resolve(null);
  persistRequested = true;
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist)
      return Promise.resolve(null);
    return navigator.storage.persist().catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

/** Taille approximative (octets, UTF-16) occupée par les clés du site dans localStorage. */
export function localStorageBytes() {
  const s = ls();
  if (!s) return 0;
  let total = 0;
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      total += (k.length + (s.getItem(k) || '').length) * 2;
    }
  } catch {
    /* stockage indisponible */
  }
  return total;
}

/** Estimation `{ usage, quota, persisted, localStorageBytes }` pour le journal de diagnostic. */
export async function getStorageEstimate() {
  const out = { usage: null, quota: null, persisted: null, localStorageBytes: localStorageBytes() };
  try {
    if (typeof navigator !== 'undefined' && navigator.storage) {
      if (navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        out.usage = est.usage ?? null;
        out.quota = est.quota ?? null;
      }
      if (navigator.storage.persisted) out.persisted = await navigator.storage.persisted();
    }
  } catch {
    /* API indisponible */
  }
  return out;
}

// ── API générique ──────────────────────────────────────────────────

/** Vrai si une clé existe (valeur en attente comprise ; sauvegarde illisible exclue). */
export function has(key) {
  if (key === KEYS.save) ensureSaveChecked();
  if (pending.has(key)) return true;
  return getRaw(key) !== null;
}

/** Valeur JSON parsée, ou `fallback` si absente, illisible ou stockage indisponible. */
export function readJSON(key, fallback = null) {
  if (key === KEYS.save) ensureSaveChecked();
  if (pending.has(key)) return JSON.parse(JSON.stringify(pending.get(key)));
  const raw = getRaw(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    logError(e, `storage.read:${key}`);
    return fallback;
  }
}

/** Écriture atomique de la sauvegarde de partie : `.tmp`, copie de l'ancienne valeur valide dans `.prev`, bascule. */
function writeSave(raw) {
  ensureSaveChecked();
  if (!setRaw(SAVE_TMP_KEY, raw)) return false;
  const current = getRaw(KEYS.save);
  if (current !== null && current !== raw && isValidSave(current)) setRaw(SAVE_PREV_KEY, current);
  const ok = setRaw(KEYS.save, raw);
  removeRaw(SAVE_TMP_KEY);
  if (ok) requestPersistentStorage();
  return ok;
}

/** Écrit une valeur JSON (synchrone) ; renvoie true si l'écriture a réussi. */
export function writeJSON(key, value) {
  pending.delete(key);
  if (!ls()) {
    notifyFailure(key, 'unavailable');
    return false;
  }
  let raw;
  try {
    raw = JSON.stringify(value);
  } catch (e) {
    logError(e, `storage.serialize:${key}`);
    return false;
  }
  const ok = key === KEYS.save ? writeSave(raw) : setRaw(key, raw);
  if (ok) notify(key);
  return ok;
}

/** Supprime une clé (et, pour la sauvegarde de partie, ses clés annexes `.tmp`/`.prev`). */
export function remove(key) {
  pending.delete(key);
  removeRaw(key);
  if (key === KEYS.save) {
    removeRaw(SAVE_TMP_KEY);
    removeRaw(SAVE_PREV_KEY);
  }
  notify(key);
}

/** Vide tout le stockage local du site. */
export function clearAll() {
  pending.clear();
  const s = ls();
  if (!s) return;
  try {
    s.clear();
  } catch (e) {
    logError(e, 'storage.clear');
  }
  notify(null);
}
