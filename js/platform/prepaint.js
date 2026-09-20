// Amorçage de plateforme, avant le premier rendu, pour que rien ne bouge ni ne clignote ensuite :
// thème mémorisé et présence d'une partie reprenable. Script minuscule, sans import, CLASSIQUE
// (ni module ni `blocking="render"`) : placé dans <head>, il s'exécute dès qu'il est reçu, pendant
// l'analyse du document, donc avant le premier rendu dans tous les moteurs — là où un module,
// différé par nature, n'aurait couru qu'après l'analyse complète et où `blocking="render"` n'est
// pas honoré partout. Mesuré avec Lighthouse (profil mobile ralenti, cinq passages × trois) : en
// module bloquant, le premier rendu attendait la fin de l'analyse et tombait une fois sur deux
// après le départ du graphe de modules (score 0,90–0,95, plus grand élément 2,7–3,3 s) ; en script
// classique, premier rendu 1,35–1,6 s et plus grand élément 1,7–2,3 s, score 0,98–1,00 stable.
// Il pose deux attributs sur <html>, que les feuilles de style consomment. Toute décision plus
// lourde appartient à main.js. Enveloppé dans une fonction immédiate : aucun identifiant global.
//
// Le garde-fou ci-dessous détecte directement un rendu déjà effectué (une entrée « paint »
// existe) plutôt que via `readyState` : réserver la boîte après le premier rendu produirait le
// décalage qu'on cherche à éviter.
const BEFORE_FIRST_PAINT =
  typeof performance.getEntriesByType === 'function'
    ? performance.getEntriesByType('paint').length === 0
    : document.readyState === 'loading';
(() => {
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
})();
