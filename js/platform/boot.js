// Amorçage plateforme : verrou d'orientation, menu contextuel et pinch-zoom désactivés (D7).
// Module à effets de bord, importé en premier par main.js. Les champs de saisie sont exemptés
// (coller un prénom, sélectionner du texte).

/** Vrai si l'événement vise un champ où l'édition native (menu coller, sélection) doit rester possible. */
function isEditable(target) {
  return Boolean(target && target.closest && target.closest('input, textarea, [contenteditable]'));
}

if (screen.orientation?.lock) screen.orientation.lock('portrait').catch(() => {});

document.addEventListener('contextmenu', (e) => {
  if (!isEditable(e.target)) e.preventDefault();
});

document.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length > 1 && !isEditable(e.target)) e.preventDefault();
  },
  { passive: false },
);
