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

/**
 * Retire tout paramètre `action` de l'URL (quelle que soit sa casse ou sa valeur, même inconnue) :
 * un rechargement ne doit pas rejouer le raccourci, et une valeur non reconnue ne doit pas rester
 * affichée dans la barre d'adresse.
 */
function cleanUrl() {
  try {
    const url = new URL(location.href);
    const keys = [...url.searchParams.keys()].filter((k) => k.toLowerCase() === 'action');
    if (!keys.length) return;
    keys.forEach((k) => url.searchParams.delete(k));
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
  cleanUrl();
  if (!action) return null;
  if (action === 'new') {
    // Nouvelle partie : la sauvegarde est conservée, mais l'accueil ne propose pas de la reprendre.
    setRestoreBannerVisible(false);
    return 'new';
  }
  if (getRecoveryState().status === 'ok' && restoreGame()) return 'resumed';
  showToast('Aucune partie à reprendre.');
  return 'no-save';
}
