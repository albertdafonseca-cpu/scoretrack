// Amorçage plateforme : verrou d'orientation, menu contextuel et pinch-zoom désactivés (D7).
// Module à effets de bord, importé en premier par main.js.

if (screen.orientation?.lock) screen.orientation.lock('portrait').catch(() => {});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false },
);
