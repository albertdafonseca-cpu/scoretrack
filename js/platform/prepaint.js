// Amorçage de plateforme, avant le premier rendu, pour que rien ne bouge ni ne clignote ensuite :
// thème mémorisé et présence d'une partie reprenable. Module minuscule, sans import, chargé en
// `blocking="render"` : il pose deux attributs sur <html>, que les feuilles de style consomment.
// Toute décision plus lourde appartient à main.js.
//
// Dépendance assumée : `blocking="render"` n'est pas honoré par tous les moteurs. Là où il ne
// l'est pas, ce module s'exécute après le premier rendu ; réserver la boîte à ce moment-là
// produirait le décalage qu'on cherche à éviter. Le garde-fou ci-dessous le détecte directement
// (un rendu déjà effectué a laissé une entrée « paint ») plutôt que via `readyState`, qui vaut
// déjà « interactive » quand un module s'exécute, même en rendu bloqué.
const BEFORE_FIRST_PAINT =
  typeof performance.getEntriesByType === 'function'
    ? performance.getEntriesByType('paint').length === 0
    : document.readyState === 'loading';

/** Identifiant de thème plausible : le contrôle fin appartient à js/ui/settings.js. */
function safeThemeId(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(value) ? value : null;
}

/**
 * Vrai si la sauvegarde a des chances d'être reprise : mêmes préconditions minimales que
 * `parseGame` (objet JSON avec au moins un joueur). Réserver la place d'une bannière qui ne
 * s'affichera pas ferait s'effondrer la boîte ensuite — décalage de 0,18 mesuré.
 */
function hasResumableSave() {
  let raw;
  try {
    raw = localStorage.getItem('scoretrack_save');
  } catch {
    return false; // stockage refusé : aucune partie à reprendre
  }
  if (typeof raw !== 'string' || raw.trim() === '' || raw.trim()[0] !== '{') return false;
  try {
    const data = JSON.parse(raw);
    return Boolean(data) && Array.isArray(data.players) && data.players.length > 0;
  } catch {
    return false; // sauvegarde tronquée ou corrompue
  }
}

/** Le raccourci « Nouvelle partie » du manifeste masque la bannière : ne rien réserver. */
function wantsNewGame() {
  try {
    return new URLSearchParams(window.location.search).get('action') === 'new';
  } catch {
    return false;
  }
}

try {
  const raw = localStorage.getItem('scoretrack_settings');
  const theme = raw ? safeThemeId(JSON.parse(raw).theme) : null;
  if (theme && theme !== 'cyber') document.documentElement.setAttribute('data-theme', theme);
} catch {
  // Réglages illisibles ou stockage refusé : le thème par défaut s'applique.
}

if (BEFORE_FIRST_PAINT && !wantsNewGame() && hasResumableSave()) {
  document.documentElement.setAttribute('data-has-save', '');
}
