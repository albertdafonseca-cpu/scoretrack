// Accès sûr à localStorage : JSON, try/catch systématique, détection de quota.
import { logError } from './errors.js';

function ls() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Vrai si une clé existe (même avec un contenu invalide). */
export function has(key) {
  const s = ls();
  try {
    return s !== null && s.getItem(key) !== null;
  } catch {
    return false;
  }
}

/** Valeur JSON parsée, ou `fallback` si absente, illisible ou stockage indisponible. */
export function readJSON(key, fallback = null) {
  const s = ls();
  if (!s) return fallback;
  try {
    const raw = s.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (e) {
    logError(e, `storage.read:${key}`);
    return fallback;
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

/** Écrit une valeur JSON ; renvoie true si l'écriture a réussi. */
export function writeJSON(key, value) {
  const s = ls();
  if (!s) return false;
  try {
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    logError(e, isQuotaError(e) ? `storage.quota:${key}` : `storage.write:${key}`);
    return false;
  }
}

/** Supprime une clé (silencieux si indisponible). */
export function remove(key) {
  const s = ls();
  if (!s) return;
  try {
    s.removeItem(key);
  } catch (e) {
    logError(e, `storage.remove:${key}`);
  }
}

/** Vide tout le stockage local du site. */
export function clearAll() {
  const s = ls();
  if (!s) return;
  try {
    s.clear();
  } catch (e) {
    logError(e, 'storage.clear');
  }
}
