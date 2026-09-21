// Réglages du navigateur au chargement et enregistrement du service worker.
// Le worker est un vrai fichier (dist/sw.js, compilé depuis src/sw-worker.ts) :
// un worker servi depuis une URL blob: est refusé par les navigateurs, ce qui
// rendait l'ancien mode hors ligne inopérant.
import { t } from './i18n';

if(screen.orientation?.lock)screen.orientation.lock('portrait').catch(()=>{});
document.addEventListener('contextmenu',e=>e.preventDefault());
// Zoom pinch autorisé — pas de preventDefault sur multi-touch

// Service Worker — fonctionnement hors ligne + mise à jour automatique
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{/* absent hors de dist/ (dev) ou file:// */});
  // Reçoit la notification de mise à jour du SW
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'SW_UPDATED') {
      // Bannière discrète en bas — tap pour recharger
      const b = document.createElement('div');
      b.id = 'update-banner'; // style posé par la règle #update-banner (css/app.css) — simplification, ex `.style.cssText=`
      b.textContent = t('updateBanner');
      b.addEventListener('click', () => location.reload());
      document.body.appendChild(b);
    }
  });
}
