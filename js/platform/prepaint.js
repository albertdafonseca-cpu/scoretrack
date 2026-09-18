// Amorçage de plateforme, avant le premier rendu, pour que rien ne bouge ni ne clignote ensuite :
// thème mémorisé et présence d'une partie sauvegardée. Module minuscule, sans import, chargé en
// `blocking="render"` : il pose deux attributs sur <html>, que les feuilles de style consomment.
// Toute décision plus lourde appartient à main.js.

try {
  const raw = localStorage.getItem('scoretrack_settings');
  const theme = raw ? JSON.parse(raw).theme : null;
  if (typeof theme === 'string' && theme && theme !== 'cyber') {
    document.documentElement.setAttribute('data-theme', theme);
  }
} catch {
  // Stockage illisible ou refusé : le thème par défaut s'applique.
}

try {
  // La bannière de reprise occupe sa place dès le premier rendu quand une partie existe :
  // révélée après coup, elle décalerait toute la page (0,19 mesuré).
  if (localStorage.getItem('scoretrack_save') !== null) {
    document.documentElement.setAttribute('data-has-save', '');
  }
} catch {
  // Sans stockage, aucune partie à reprendre.
}
