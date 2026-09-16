// Journal d'erreurs local — capte window.onerror / unhandledrejection dans localStorage.
// Aucune transmission réseau : les entrées restent sur l'appareil (clé `scoretrack_errors`, bornée).

export const ERRORS_KEY = 'scoretrack_errors';
const MAX_ENTRIES = 20;
const MAX_TEXT = 500;

const trunc = (s) => (typeof s === 'string' ? s.slice(0, MAX_TEXT) : '');

/** Lit le journal (tableau, éventuellement vide). */
export function readErrorJournal() {
  try {
    const list = JSON.parse(localStorage.getItem(ERRORS_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Efface le journal. */
export function clearErrorJournal() {
  try {
    localStorage.removeItem(ERRORS_KEY);
  } catch {
    /* stockage indisponible : rien à effacer */
  }
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
