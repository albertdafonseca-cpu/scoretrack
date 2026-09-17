// Journal d'erreurs local — capte window.onerror / unhandledrejection dans localStorage.
// Aucune transmission réseau : les entrées restent sur l'appareil (clé `scoretrack_errors`, bornée).

export const ERRORS_KEY = 'scoretrack_errors';
const MAX_ENTRIES = 20;
const MAX_TEXT = 500;

const trunc = (s) => (typeof s === 'string' ? s.slice(0, MAX_TEXT) : '');
const listeners = new Set();

/** Lit le journal (tableau, éventuellement vide). */
export function readErrorJournal() {
  try {
    const list = JSON.parse(localStorage.getItem(ERRORS_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Alias explicite de `readErrorJournal`. */
export const getErrorJournal = readErrorJournal;

/** Efface le journal. */
export function clearErrorJournal() {
  try {
    localStorage.removeItem(ERRORS_KEY);
  } catch {
    /* stockage indisponible : rien à effacer */
  }
}

/**
 * Abonne un observateur aux erreurs non gérées capturées (`cb(entry)`), pour une bannière discrète.
 * Renvoie la fonction de désabonnement. Les erreurs internes de stockage (`storage.*`) ne sont pas notifiées.
 */
export function onError(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Ajoute une entrée { ts, type, message, source, line, col, stack } ; garde les MAX_ENTRIES dernières. */
export function logError(err, context = 'error') {
  const entry = {
    ts: Date.now(),
    type: context,
    message: trunc(err && err.message !== undefined ? String(err.message) : String(err)),
    source: trunc(err && err.filename ? err.filename : ''),
    line: err && Number.isInteger(err.lineno) ? err.lineno : 0,
    col: err && Number.isInteger(err.colno) ? err.colno : 0,
    stack: trunc(err && err.stack ? String(err.stack) : ''),
  };
  try {
    const list = readErrorJournal();
    list.push(entry);
    localStorage.setItem(ERRORS_KEY, JSON.stringify(list.slice(-MAX_ENTRIES)));
  } catch {
    /* quota dépassé ou stockage indisponible : on abandonne silencieusement */
  }
  if (context === 'error' || context === 'unhandledrejection') {
    listeners.forEach((cb) => {
      try {
        cb(entry);
      } catch {
        /* un observateur défaillant ne doit pas masquer l'erreur d'origine */
      }
    });
  }
  return entry;
}

/** Installe les capteurs globaux (idempotent). */
export function installErrorJournal(target = window) {
  if (target.__scoretrackErrorsInstalled) return;
  target.__scoretrackErrorsInstalled = true;
  target.addEventListener('error', (e) => {
    const err = e.error || {};
    logError(
      {
        message: e.message || err.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        stack: err.stack,
      },
      'error',
    );
  });
  target.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    logError(r instanceof Error ? r : { message: String(r) }, 'unhandledrejection');
  });
}

const fmtBytes = (n) =>
  typeof n === 'number' && Number.isFinite(n) ? `${(n / 1024).toFixed(1)} Kio` : 'inconnu';

/**
 * Texte de diagnostic à copier/partager (aucun envoi automatique) : version de l'application et du SW,
 * navigateur, stockage (quota, usage, persistance) et journal d'erreurs.
 */
export async function exportDiagnostics() {
  const [{ getStorageEstimate }, { getServiceWorkerVersion }] = await Promise.all([
    import('./storage.js'),
    import('./sw-client.js'),
  ]);
  const [estimate, swVersion] = await Promise.all([
    getStorageEstimate(),
    getServiceWorkerVersion(),
  ]);
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const lines = [
    'ScoreTrack — diagnostic',
    `Date : ${new Date().toISOString()}`,
    `Service worker : ${swVersion || 'non actif'}`,
    `Navigateur : ${nav.userAgent || 'inconnu'}`,
    `Langue : ${nav.language || 'inconnue'} · En ligne : ${nav.onLine === undefined ? 'inconnu' : nav.onLine}`,
    `Écran : ${typeof screen !== 'undefined' ? `${screen.width}×${screen.height} @${window.devicePixelRatio || 1}` : 'inconnu'}`,
    `Stockage : usage ${fmtBytes(estimate.usage)} / quota ${fmtBytes(estimate.quota)} · persistant : ${
      estimate.persisted === null ? 'inconnu' : estimate.persisted
    } · localStorage ${fmtBytes(estimate.localStorageBytes)}`,
    '',
    'Journal des erreurs :',
  ];
  const journal = readErrorJournal();
  if (!journal.length) lines.push('(vide)');
  journal.forEach((e) => {
    const where = e.source ? ` @ ${e.source}:${e.line}:${e.col}` : '';
    lines.push(`- ${new Date(e.ts).toISOString()} [${e.type}] ${e.message}${where}`);
    if (e.stack) lines.push(`  ${e.stack.split('\n').slice(0, 3).join(' | ')}`);
  });
  return lines.join('\n');
}
