// Sauvegarde / restauration utilisateur : export JSON téléchargeable, import validé strictement,
// écriture tout-ou-rien (aucun écrasement partiel). Aucune donnée ne quitte l'appareil.
import {
  KEYS,
  parseGame,
  parseProfiles,
  parseSettings,
  serializeGame,
  serializeProfiles,
  serializeSettings,
} from '../core/save-schema.js';
import { flushWrites, readJSON, remove, writeJSON } from './storage.js';

export const EXPORT_APP = 'scoretrack';
export const EXPORT_VERSION = 2;
/** Taille maximale acceptée à l'import (octets), très au-delà d'une utilisation réelle (~ quelques Kio). */
export const MAX_IMPORT_BYTES = 1024 * 1024;
const MAX_PROFILES = 30;
const MAX_NAME_LENGTH = 40;
const MAX_PLAYERS = 12;
const MAX_HISTORY_ENTRIES = 5000;

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** Contenu JSON (chaîne) de l'export : réglages, partie en cours, prénoms mémorisés. */
export function exportData(now = new Date()) {
  flushWrites();
  return JSON.stringify(
    {
      app: EXPORT_APP,
      v: EXPORT_VERSION,
      exportedAt: now.toISOString(),
      settings: readJSON(KEYS.settings, null),
      save: readJSON(KEYS.save, null),
      profiles: readJSON(KEYS.profiles, null),
    },
    null,
    2,
  );
}

/** Nom de fichier `scoretrack-AAAA-MM-JJ.json`. */
export function exportFilename(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `scoretrack-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

function fail(error) {
  return { ok: false, error };
}

function validateSettings(raw) {
  if (raw === null || raw === undefined) return { value: null };
  if (!isObj(raw)) return { error: 'Réglages : objet attendu.' };
  if (raw.theme !== undefined && typeof raw.theme !== 'string') {
    return { error: 'Réglages : thème invalide.' };
  }
  // Liste blanche stricte : seules les clés du schéma sont conservées (aucune clé inconnue du fichier
  // importé n'est persistée, `constructor`/`__proto__` compris).
  return { value: serializeSettings(parseSettings(raw)) };
}

function validateSave(raw) {
  if (raw === null || raw === undefined) return { value: null };
  if (!isObj(raw) || !Array.isArray(raw.players)) return { error: 'Partie : structure invalide.' };
  if (raw.players.length > MAX_PLAYERS)
    return { error: `Partie : plus de ${MAX_PLAYERS} joueurs.` };
  if (
    raw.players.some(
      (p) => isObj(p) && typeof p.playerName === 'string' && p.playerName.length > MAX_NAME_LENGTH,
    )
  ) {
    return { error: 'Partie : prénom trop long.' };
  }
  if (Array.isArray(raw.history) && raw.history.length > MAX_HISTORY_ENTRIES) {
    return { error: 'Partie : historique trop volumineux.' };
  }
  const res = parseGame(raw);
  if (!res.ok) return { error: 'Partie : sauvegarde inexploitable.' };
  // Ré-sérialisée dans le schéma courant (somme de contrôle recalculée), à la date d'origine.
  return { value: serializeGame(res.game, Number.isFinite(raw.ts) ? raw.ts : Date.now()) };
}

function validateProfiles(raw) {
  if (raw === null || raw === undefined) return { value: null };
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.names) ? raw.names : null;
  if (!list) return { error: 'Prénoms : liste attendue.' };
  if (list.length > MAX_PROFILES) return { error: `Prénoms : plus de ${MAX_PROFILES} entrées.` };
  if (list.some((n) => typeof n !== 'string' || n.length === 0 || n.length > MAX_NAME_LENGTH)) {
    return { error: 'Prénoms : entrée invalide.' };
  }
  return { value: serializeProfiles(parseProfiles(list)) };
}

/** Résumé lisible : « 12 prénoms, 1 partie en cours, réglages ». */
export function summarize({ settings, save, profiles }) {
  const parts = [];
  const names = profiles ? parseProfiles(profiles).length : 0;
  parts.push(names === 0 ? 'aucun prénom' : names === 1 ? '1 prénom' : `${names} prénoms`);
  parts.push(save ? '1 partie en cours' : 'aucune partie en cours');
  parts.push(settings ? 'réglages' : 'aucun réglage');
  return parts.join(', ');
}

/**
 * Valide un export sans rien écrire : `{ ok: true, data: { settings, save, profiles }, summary }`
 * ou `{ ok: false, error }`.
 */
export function validateImport(text) {
  if (typeof text !== 'string') return fail('Fichier illisible.');
  if (text.length > MAX_IMPORT_BYTES) return fail('Fichier trop volumineux.');
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return fail('Ce fichier n’est pas un JSON valide.');
  }
  if (!isObj(doc) || doc.app !== EXPORT_APP)
    return fail('Ce fichier n’est pas un export ScoreTrack.');
  if (!Number.isInteger(doc.v) || doc.v < 1 || doc.v > EXPORT_VERSION) {
    return fail(`Version d’export non prise en charge (${String(doc.v)}).`);
  }
  const settings = validateSettings(doc.settings);
  if (settings.error) return fail(settings.error);
  const save = validateSave(doc.save);
  if (save.error) return fail(save.error);
  const profiles = validateProfiles(doc.profiles);
  if (profiles.error) return fail(profiles.error);
  if (settings.value === null && save.value === null && profiles.value === null) {
    return fail('Export vide : rien à importer.');
  }
  const data = { settings: settings.value, save: save.value, profiles: profiles.value };
  return { ok: true, data, summary: summarize(data) };
}

/**
 * Importe un export : validation stricte puis écriture tout-ou-rien (en cas d'échec d'écriture,
 * les valeurs précédentes sont rétablies). Renvoie `{ ok: true, summary } | { ok: false, error }`.
 */
export function importData(text) {
  const checked = validateImport(text);
  if (!checked.ok) return checked;
  flushWrites();
  const plan = [
    [KEYS.settings, checked.data.settings],
    [KEYS.save, checked.data.save],
    [KEYS.profiles, checked.data.profiles],
  ];
  const previous = plan.map(([key]) => [key, readJSON(key, null)]);
  const written = [];
  for (const [key, value] of plan) {
    if (value === null) continue;
    if (!writeJSON(key, value)) {
      for (const [k, v] of previous.filter(([k]) => written.includes(k))) {
        if (v === null) remove(k);
        else writeJSON(k, v);
      }
      return fail('Écriture impossible (stockage plein ou indisponible) : rien n’a été modifié.');
    }
    written.push(key);
  }
  return { ok: true, summary: checked.summary };
}

/** Déclenche le téléchargement de l'export (Blob + <a download>). Renvoie le nom de fichier. */
export function downloadExport(now = new Date()) {
  const name = exportFilename(now);
  const blob = new Blob([exportData(now)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

/** Ouvre le sélecteur de fichier puis importe ; résout `{ ok, summary | error }` (ou `{ ok: false, error: 'annulé' }`). */
export function pickAndImport() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    const done = (result) => {
      input.remove();
      resolve(result);
    };
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return done(fail('annulé'));
      if (file.size > MAX_IMPORT_BYTES) return done(fail('Fichier trop volumineux.'));
      file
        .text()
        .then((text) => done(importData(text)))
        .catch(() => done(fail('Fichier illisible.')));
    });
    input.addEventListener('cancel', () => done(fail('annulé')));
    document.body.appendChild(input);
    input.click();
  });
}
