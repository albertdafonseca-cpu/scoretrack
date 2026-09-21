import { jsPDF } from 'jspdf';
import { t } from './i18n';
import { fmtNum, history, lastGameConfig, players } from './game';
import { $ } from './dom';
import type { GameConfig, HistoryGroup, Player } from './types';

// ── EXPORT PDF RÉCAPITULATIF ──────────────────────────────────────
// jsPDF est une dépendance npm bundlée par esbuild (voir docs/audit/DECISIONS-E.md,
// §1) : plus de chargement CDN (cdnjs), l'export fonctionne hors ligne dès le
// premier lancement. Import statique et volontaire, pas paresseux : voir
// docs/audit/BRIEF.md §7 (D24) pour l'arbitrage — un chargement différé par
// script séparé casserait la garantie testée d'export PDF hors ligne dès la
// toute première visite (e2e/pdf-export-offline.spec.ts), avant même
// l'activation du service worker.
export function exportRecapPDF(){
  const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});

  const inclScores   = $<HTMLInputElement>('pdf-chk-scores').checked;
  const inclHistory  = $<HTMLInputElement>('pdf-chk-history').checked;
  const inclInfo     = $<HTMLInputElement>('pdf-chk-info').checked;
  const gameName     = $<HTMLInputElement>('pdf-game-name').value.trim();

  const pageW = 210, margin = 16, contentW = pageW - margin*2;
  let y = 18;

  // ── Couleurs daltonien-safe ──
  // Tuples explicites : setTextColor/setFillColor/setDrawColor de jsPDF sont
  // surchargées en (r,g,b[,a]), pas en (...rgb: number[]) — un spread d'un
  // number[] non figé ne type-check pas (TS2556).
  type RGB = readonly [number, number, number];
  const C_TITLE:  RGB = [10,  10,  10];
  const C_SUB:    RGB = [80,  80,  80];
  const C_POS:    RGB = [0,   100, 180]; // bleu
  const C_NEG:    RGB = [200, 80,  20];  // orange
  const C_BORDER: RGB = [200, 200, 200];
  const C_BG_HDR: RGB = [240, 240, 240];
  const C_WIN:    RGB = [30,  120, 40];
  const C_ELIM:   RGB = [150, 150, 150];
  // Fond de page (blanc) : sert à « creuser » les détails des icônes
  // vectorielles ci-dessous (orbites du crâne, trou de serrure) par recouvrement
  // — aucune ligne du tableau des scores n'a de remplissage propre, ce blanc
  // correspond donc toujours au fond réellement visible derrière l'icône.
  const C_PAGE_BG: RGB = [255, 255, 255];

  // ── Icônes vectorielles (remplace les émojis trophée/crâne, P1 #7 — voir docs/audit/DECISIONS-H.md §4) ──
  // Un émoji système n'a pas de rendu fiable dans un PDF (police absente du
  // lecteur, tofu, ou glyphe couleur non supporté par certains moteurs) : on
  // dessine ici une version vectorielle minimaliste des mêmes silhouettes que
  // les icônes SVG de l'interface (`src/ui-icons.ts`), pour rester cohérent
  // et rester identifiable par la FORME seule (D-CLAUDE-2/D-PREF-1), pas par
  // la couleur — testé en niveaux de gris, voir DECISIONS-H.md §3.
  /** Trophée : coupe (triangle inversé) + anses (traits) + socle à deux étages. */
  function drawTrophyIcon(x: number, yBaseline: number, size: number, color: RGB){
    const top=yBaseline-size, w=size, h=size*0.62;
    doc.setFillColor(...color);
    doc.triangle(x, top, x+w, top, x+w/2, top+h, 'F');
    doc.setDrawColor(...color);
    doc.setLineWidth(0.15);
    doc.line(x-0.3, top+h*0.12, x-0.9, top+h*0.5);
    doc.line(x+w+0.3, top+h*0.12, x+w+0.9, top+h*0.5);
    doc.rect(x+w/2-0.3, top+h, 0.6, size*0.16, 'F');
    doc.rect(x+w/2-size*0.26, top+h+size*0.16, size*0.52, size*0.12, 'F');
  }
  // Pas d'icône « drapeau à damier » ici : le récap PDF n'a jamais distingué
  // champion/finisher (toujours le même statut « winner », voir plus bas) —
  // seuls les émojis trophée (victoire) et tête de mort (élimination)
  // apparaissaient dans ce fichier avant cet élément (inventaire initial,
  // docs/audit/DECISIONS-H.md §1) ; ajouter une distinction visuelle inédite
  // ici sortirait du périmètre de ce chantier (remplacer des émojis
  // existants, pas changer le contenu du PDF).
  /** Crâne : disque + mâchoire pleins, orbites et nez « creusés » en blanc. */
  function drawSkullIcon(x: number, yBaseline: number, size: number, color: RGB){
    const r=size/2, cx=x+r, cy=yBaseline-r;
    doc.setFillColor(...color);
    doc.circle(cx, cy, r, 'F');
    doc.rect(x, cy, size, r*0.8, 'F');
    doc.setFillColor(...C_PAGE_BG);
    doc.circle(cx-r*0.42, cy-r*0.05, r*0.26, 'F');
    doc.circle(cx+r*0.42, cy-r*0.05, r*0.26, 'F');
    doc.triangle(cx-r*0.13, cy+r*0.12, cx+r*0.13, cy+r*0.12, cx, cy+r*0.5, 'F');
  }
  const STATUS_ICON_W=4.4; // décalage du texte de statut pour laisser la place à l'icône

  // ── En-tête ──
  doc.setFont('helvetica','bold');
  doc.setFontSize(18);
  doc.setTextColor(...C_TITLE);
  doc.text('ScoreTrack', margin, y);
  y += 7;

  if(gameName){
    doc.setFontSize(13);
    doc.setFont('helvetica','bold');
    doc.setTextColor(...C_TITLE);
    doc.text(gameName, margin, y);
    y += 6;
  }

  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.setTextColor(...C_SUB);
  doc.text(t('recapTitle'), margin, y);
  y += 3;

  // Ligne séparatrice
  doc.setDrawColor(...C_BORDER);
  doc.line(margin, y, pageW-margin, y);
  y += 6;

  // ── Infos partie ──
  if(inclInfo && lastGameConfig){
    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.setTextColor(...C_SUB);
    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined,{day:'2-digit',month:'2-digit',year:'numeric'})
                  + ' ' + now.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
    const cfg = lastGameConfig as GameConfig; // `lastGameConfig` (game.ts) pas encore typé
    const infoLines = [
      'Date : ' + dateStr,
      t('labelPlayers') + ' : ' + cfg.numPlayers,
      t('labelStart') + ' : ' + cfg.startPoints,
    ];
    if(cfg.objectifMode==='win' && cfg.objectifVal!=null)
      infoLines.push(t('btnWin')+' : '+cfg.objectifVal);
    if(cfg.objectifMode==='win' && cfg.singleWinner)
      infoLines.push(t('labelSingleWinner')||'Fin dès la première victoire');
    if(cfg.objectifMode==='win' && cfg.lastLoser && !cfg.singleWinner)
      infoLines.push(t('labelLastLoser')||'Dernier joueur perdant');
    if(cfg.objectifMode==='elim' && cfg.objectifVal!=null)
      infoLines.push(t('btnElim')+' : '+cfg.objectifVal);

    infoLines.forEach(line=>{
      doc.setFontSize(8.5);
      doc.setFont('helvetica','normal');
      doc.text(line, margin, y);
      y += 4.5;
    });
    y += 2;
    doc.setDrawColor(...C_BORDER);
    doc.line(margin, y, pageW-margin, y);
    y += 6;
  }

  // ── Scores finaux ──
  if(inclScores){
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.setTextColor(...C_TITLE);
    doc.text(t('recapTitle') + ' — Scores', margin, y);
    y += 5;

    // Tableau header
    const colName=margin, colStatus=margin+80, colScore=margin+145;
    doc.setFillColor(...C_BG_HDR);
    doc.rect(margin, y-4, contentW, 7, 'F');
    doc.setFontSize(8);
    doc.setTextColor(...C_SUB);
    doc.text(t('namesTitle')||'Joueur', colName+1, y);
    doc.text('Statut', colStatus+1, y);
    doc.text('Score', colScore+1, y);
    y += 4;
    doc.setDrawColor(...C_BORDER);
    doc.line(margin, y, pageW-margin, y);
    y += 4;

    // Trier : gagnants d'abord, puis éliminés par rang, puis actifs
    const sorted = (players as Player[]).map((p,i)=>({p,i})).sort((a,b)=>{
      if(a.p.winner&&!b.p.winner)return -1;
      if(!a.p.winner&&b.p.winner)return 1;
      if(a.p.winner&&b.p.winner)return (a.p.winRank||99)-(b.p.winRank||99);
      if(a.p.eliminated&&!b.p.eliminated)return 1;
      if(!a.p.eliminated&&b.p.eliminated)return -1;
      return 0;
    });

    sorted.forEach(({p,i})=>{
      const name = p.playerName||(t('player')+' '+(i+1));
      const score = p.finalScore!==undefined?p.finalScore:p.score;
      let status='';
      if(p.winner)status=t('winner')+(players.length>2?' #'+(p.winRank||1):'');
      else if(p.eliminated)status=(players.length>2?'#'+(p.elimRank||''):''+t('btnEliminate'));

      doc.setFont('helvetica','bold');
      doc.setFontSize(9);
      doc.setTextColor(...C_TITLE);
      doc.text(name.substring(0,28), colName+1, y);

      doc.setFont('helvetica','normal');
      doc.setFontSize(8);
      let statusX=colStatus+1;
      if(p.winner){doc.setTextColor(...C_WIN); drawTrophyIcon(colStatus+1, y-0.3, 2.6, C_WIN); statusX+=STATUS_ICON_W;}
      else if(p.eliminated){doc.setTextColor(...C_ELIM); drawSkullIcon(colStatus+1, y-0.3, 2.6, C_ELIM); statusX+=STATUS_ICON_W;}
      else doc.setTextColor(...C_SUB);
      doc.text(status, statusX, y);

      doc.setFont('helvetica','bold');
      doc.setFontSize(10);
      doc.setTextColor(...(score>=0?C_POS:C_NEG));
      doc.text(fmtNum(score), colScore+1, y);

      y += 6;
      if(y>270){doc.addPage();y=16;}
    });
    y += 4;
    doc.setDrawColor(...C_BORDER);
    doc.line(margin, y, pageW-margin, y);
    y += 6;
  }

  // ── Historique ──
  if(inclHistory){
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.setTextColor(...C_TITLE);
    doc.text(t('recapTitle') + ' — '+t('btnRecap'), margin, y);
    y += 6;

    (players as Player[]).forEach((p,pi)=>{
      const groups=(history as HistoryGroup[]).filter(h=>h.playerIdx===pi).sort((a,b)=>a.rank-b.rank);
      if(!groups.length)return;

      // Nom du joueur
      if(y>265){doc.addPage();y=16;}
      doc.setFillColor(...C_BG_HDR);
      doc.rect(margin, y-4, contentW, 6.5, 'F');
      doc.setFont('helvetica','bold');
      doc.setFontSize(9);
      doc.setTextColor(...C_TITLE);
      doc.text((p.playerName||(t('player')+' '+(pi+1))).substring(0,35), margin+2, y);
      y += 4;

      groups.forEach(g=>{
        const sum=g.entries.reduce((s,e)=>s+e.delta,0);
        const sign=sum>0?'+':'';
        if(y>273){doc.addPage();y=16;}
        doc.setFont('helvetica','normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...C_SUB);
        doc.text('#'+g.rank, margin+4, y);
        doc.setFont('helvetica','bold');
        doc.setTextColor(...(sum>=0?C_POS:C_NEG));
        doc.text(sign+fmtNum(sum), margin+18, y);
        y += 5;
      });

      const displayScore=p.finalScore!==undefined?p.finalScore:p.score;
      doc.setFont('helvetica','bold');
      doc.setFontSize(9);
      doc.setTextColor(...C_TITLE);
      doc.text('Total : '+fmtNum(displayScore), margin+4, y);
      y += 7;
    });
  }

  // ── Pied de page ──
  const totalPages = doc.getNumberOfPages();
  for(let pg=1;pg<=totalPages;pg++){
    doc.setPage(pg);
    doc.setFont('helvetica','normal');
    doc.setFontSize(7);
    doc.setTextColor(...C_SUB);
    doc.text('ScoreTrack — scoretrack.app', margin, 292);
    doc.text(pg+'/'+totalPages, pageW-margin, 292, {align:'right'});
  }

  const filename = (gameName?gameName.replace(/[^a-zA-Z0-9_\- ]/g,'_'):'ScoreTrack')+'_recap.pdf';
  doc.save(filename);
}


