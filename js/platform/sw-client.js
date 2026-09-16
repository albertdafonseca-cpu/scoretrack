// Enregistrement du service worker (fonctionnement hors ligne). Le nom `sw-st.js` est figé (D3).

/** Enregistre le SW si disponible ; renvoie la promesse d'enregistrement (ou null). */
export function registerServiceWorker(url = './sw-st.js') {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register(url).catch(() => null);
}
