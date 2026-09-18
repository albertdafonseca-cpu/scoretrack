// Raccourcis du manifeste (D14) : `?action=new` et `?action=resume` doivent produire un état différent
// d'une ouverture normale, sans quoi ils ne seraient qu'une promesse non tenue de l'écran d'accueil.
import { restoreGame } from '../ui/game.js';
import { setRestoreBannerVisible } from '../ui/setup.js';
import { showToast } from '../ui/toast.js';
import { getRecoveryState } from './storage.js';

/** Valeurs acceptées pour le paramètre `action` (identiques aux `shortcuts` du manifeste). */
export const ACTIONS = ['new', 'resume'];

/** Action demandée par l'URL, ou null (paramètre absent ou inconnu). */
export function readLaunchAction(search = location.search) {
  const raw = new URLSearchParams(search).get('action');
  return ACTIONS.includes(raw) ? raw : null;
}

/** Retire le paramètre de l'URL : un rechargement ne doit pas rejouer le raccourci. */
function cleanUrl() {
  try {
    const url = new URL(location.href);
    if (!url.searchParams.has('action')) return;
    url.searchParams.delete('action');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch {
    /* history indisponible : l'URL reste telle quelle, sans conséquence fonctionnelle */
  }
}

/**
 * Applique le raccourci demandé et renvoie ce qui a été fait :
 * 'resumed' (écran de jeu ouvert), 'no-save' (rien à reprendre, message affiché),
 * 'new' (accueil sans bannière de reprise) ou null (aucun raccourci).
 * À appeler en fin d'initialisation, une fois la bannière de reprise posée.
 */
export function applyLaunchAction(action = readLaunchAction()) {
  if (!action) return null;
  cleanUrl();
  if (action === 'new') {
    // Nouvelle partie : la sauvegarde est conservée, mais l'accueil ne propose pas de la reprendre.
    setRestoreBannerVisible(false);
    return 'new';
  }
  if (getRecoveryState().status === 'ok' && restoreGame()) return 'resumed';
  showToast('Aucune partie à reprendre.');
  return 'no-save';
}
