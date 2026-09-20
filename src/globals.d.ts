// Déclarations globales : crochets inter-modules posés sur window, jsPDF chargé
// par CDN, propriétés non standard des navigateurs.

import type { Player } from './types';

/** Fin de partie en attente de confirmation (vainqueur unique / dernier perdant). */
export type PendingEndgame =
  | { type: 'singleWinner'; winnerIdx: number; /** annule la fin de partie et restaure l'état du joueur */ _cancel: () => void }
  | { type: 'lastLoser'; winnerIdx: number; loserIdx: number; _cancel: () => void };

/** État d'un joueur avant la dernière modification (pour annuler une fin de partie). */
export interface LastAdjustPrev {
  playerIdx: number;
  score: number;
  rawScore: number | undefined;
}

declare global {
  interface Window {
    /** recalcul des tailles de texte après ouverture du tiroir de la barre */
    _barInit?: () => void;
    _lastAdjustPrev?: LastAdjustPrev;
    _pendingEndgame?: PendingEndgame | null;
    /** callbacks de fin d'animation (posés par game.ts, consommés par animations.ts) */
    _afterFinAnim?: (() => void) | null;
    _afterElimAnim?: (() => void) | null;
    _afterWinAnim?: (() => void) | null;
    _stopElimAnim?: () => void;
    _stopWinAnim?: () => void;
    _winAnimDelayTID?: number | null;
    /** un pincement (zoom) est en cours : ignorer les touchers sur le pavé */
    _isZooming?: boolean;
    /** le modal de score vient de se fermer : ignorer le clic qui suit */
    _modalJustClosed?: boolean;
    /** modules exposés pour les tests et le débogage (voir main.ts) */
    ScoreTrack?: Record<string, unknown>;
  }
  interface Navigator {
    /** ancien IE ; conservé pour la détection de langue */
    userLanguage?: string;
  }
}

export type { Player };
