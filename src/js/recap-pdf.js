// ── RÉCAP ─────────────────────────────────────────────────────────
function cancelEndgame(){
  document.getElementById('endgame-modal').classList.add('hidden');
  const eg=window._pendingEndgame;
  if(eg&&eg._cancel) eg._cancel();
  window._pendingEndgame=null;
  renderGame(); saveGame();
}
function confirmEndgame(){
  document.getElementById('endgame-modal').classList.add('hidden');
  const eg=window._pendingEndgame; if(!eg) return;
  window._pendingEndgame=null;

  if(eg.type==='singleWinner'){
    const p=players[eg.winnerIdx];
    const losers=players.filter(pl=>!pl.eliminated&&!pl.winner);
    losers.forEach(loser=>{
      loser.finalScore=(loser.rawScore!==undefined)?loser.rawScore:loser.score;
      rankCounter++;loser.eliminated=true;loser.elimRank=rankCounter;
    });
    renderGame(); saveGame();
    window._afterWinAnim=function(){
      document.getElementById('winner-name').textContent=t('winner');
      document.getElementById('winner-sub').textContent=(p.playerName||'')+(p.playerName?' · ':'')+fmtNum(p.finalScore||p.rawScore||p.score)+' pts';
      showWinnerModal(true);
      store.del('save');
      window._afterWinAnim=null;
    };
    if(window.playWinAnim) playWinAnim(eg.winnerIdx);
  }

  if(eg.type==='lastLoser'){
    const p=players[eg.winnerIdx];
    const loser=players[eg.loserIdx];
    loser.finalScore=(loser.rawScore!==undefined)?loser.rawScore:loser.score;
    rankCounter++;loser.eliminated=true;loser.elimRank=rankCounter;
    renderGame(); saveGame();
    if(window.playWinAnim) playWinAnim(eg.winnerIdx);
    // Après l'anim finisher (ou win si champion), lancer l'élim
    const afterWin=function(){
      window._afterWinAnim=null; window._afterFinAnim=null;
      if(window.playElimAnim) playElimAnim(eg.loserIdx);
      window._afterElimAnim=function(){
        const loserName=loser.playerName||(t('player')+' '+(eg.loserIdx+1));
        document.getElementById('winner-icon').textContent='💀';
        document.getElementById('winner-name').textContent=loserName;
        document.getElementById('winner-sub').textContent=fmtNum(loser.finalScore||loser.rawScore||loser.score)+' pts';
        document.getElementById('winner-modal').classList.remove('hidden');
        store.del('save');
        window._afterElimAnim=null;
      };
    };
    window._afterWinAnim=afterWin;
    window._afterFinAnim=afterWin;
  }
}

function showWinnerModal(isChampion){
  document.getElementById('winner-icon').textContent=isChampion?'🏆':'🏁';
  document.getElementById('winner-modal').classList.remove('hidden');
}
function showRecap(){
  history.forEach(h=>{h.open=false;});
  Object.values(groupTimers).forEach(clearTimeout);groupTimers={};

  // i18n panneau PDF
  document.getElementById('pdf-panel-title').textContent='⬇ '+(t('pdfBtnDl')||'Export PDF');
  if(!IS_PRO){const pp=document.querySelector('.pdf-panel');if(pp)_lk(pp);}
  document.getElementById('pdf-game-name').placeholder=t('pdfNamePlaceholder')||'Nom de la partie (optionnel)';
  document.getElementById('pdf-game-name').setAttribute('aria-label',t('pdfNamePlaceholder')||'Nom de la partie (optionnel)');
  document.getElementById('pdf-lbl-scores').textContent=t('pdfLblScores')||'Scores finaux';
  document.getElementById('pdf-lbl-history').textContent=t('pdfLblHistory')||'Historique des actions';
  document.getElementById('pdf-lbl-info').textContent=t('pdfLblInfo')||'Infos partie (preset, date)';
  document.getElementById('btn-pdf-dl').textContent='📄 '+(t('pdfBtnDl')||'Télécharger PDF');

  let html='';
  players.forEach((p,pi)=>{
    if(!IS_PRO&&!p.winner)return;
    const groups=history.filter(h=>h.playerIdx===pi).sort((a,b)=>a.rank-b.rank);
    if(!groups.length&&!p.eliminated&&!p.winner)return;
    const total=groups.reduce((s,g)=>s+g.entries.reduce((ss,e)=>ss+e.delta,0),0);
    const modeUniqueWinnerRecap = !!(singleWinner || lastLoser || (elimPoints!==null));
    const multiWin=players.filter(pl=>pl.winner).length>1;
    const isFinisherMode = multiWin || !modeUniqueWinnerRecap;
    let statusBadge='';
    if(p.winner){
      const icon=isFinisherMode?'🏁':'🏆';
      const label=isFinisherMode?(t('finisher')||'Finisher'):(t('winner')||'Winner');
      const rankStr=(multiWin||isFinisherMode)?' #'+esc(p.winRank):'';
      statusBadge=`<div class="recap-status win"><span aria-hidden="true">${icon}</span> ${label}${rankStr}</div>`;
    }
    else if(p.eliminated){
      const showRank=players.length>2 && !lastLoser && !singleWinner;
      const ordinal = p.elimRank===1?t('elimFirst1'):(esc(p.elimRank)+t('elimFirstN'));
      statusBadge=`<div class="recap-status elim"><span aria-hidden="true">💀</span> ${t('eliminated')}${showRank?' · '+ordinal:''}</div>`;
    }
    html+=`<div class="recap-player"><div class="recap-player-header"><span class="recap-shape" aria-hidden="true" style="color:${pColor(pi)};text-shadow:0 0 6px ${pColor(pi)}">${pShape(pi)}</span><div class="recap-player-name">${esc(p.playerName||(t('player')+' '+(pi+1)))}</div>${statusBadge}</div>`;
    groups.forEach(g=>{
      const sum=g.entries.reduce((s,e)=>s+e.delta,0);
      const cls=sum>0?'pos':'neg';const sign=sum>0?'▲ +':sum<0?'▼ ':'';
      html+=`<div class="recap-entry"><div class="recap-entry-rank">${t('recapRound')} ${esc(g.rank)}</div><div class="recap-delta ${cls}">${sign}${fmtNum(sum)}</div></div>`;
    });
    const displayScore=p.finalScore!==undefined?p.finalScore:p.score;
    html+=`<div class="recap-total"><div class="recap-total-val">${fmtNum(displayScore)}</div></div></div>`;
  });
  if(!html)html=`<div style="color:var(--muted2);text-align:center;margin-top:48px;font-family:Share Tech Mono,monospace;font-size:14px;">${t('recapEmpty')}</div>`;
  document.getElementById('recap-body').innerHTML=html;
  document.getElementById('recap-close-btn').onclick=()=>document.getElementById('recap').classList.add('hidden');
  document.getElementById('recap').classList.remove('hidden');
}

// ── EXPORT PDF RÉCAPITULATIF ──────────────────────────────────────
// Chargement de script à la demande (auto-hébergé, aucune requête tierce)
const _scriptPromises={};
function loadScript(src){
  if(_scriptPromises[src])return _scriptPromises[src];
  return _scriptPromises[src]=new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src=src;s.async=true;
    s.onload=()=>resolve();
    s.onerror=()=>{delete _scriptPromises[src];s.remove();reject(new Error('Chargement impossible : '+src));};
    document.head.appendChild(s);
  });
}
async function exportRecapPDF(){
  if(!IS_PRO){_spop();return;}
  if(!window.jspdf){
    try{await loadScript('vendor/jspdf.umd.min.js');}catch(e){console.warn(e);}
    if(!window.jspdf){alert(t('pdfLoadError'));return;}
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});

  const inclScores   = document.getElementById('pdf-chk-scores').checked;
  const inclHistory  = document.getElementById('pdf-chk-history').checked;
  const inclInfo     = document.getElementById('pdf-chk-info').checked;
  const gameName     = document.getElementById('pdf-game-name').value.trim();

  const pageW = 210, margin = 16, contentW = pageW - margin*2;
  let y = 18;

  // ── Couleurs daltonien-safe ──
  const C_TITLE  = [10,  10,  10];
  const C_SUB    = [80,  80,  80];
  const C_POS    = [0,   100, 180]; // bleu
  const C_NEG    = [200, 80,  20];  // orange
  const C_BORDER = [200, 200, 200];
  const C_BG_HDR = [240, 240, 240];
  const C_WIN    = [30,  120, 40];
  const C_ELIM   = [150, 150, 150];

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
    const cfg = lastGameConfig;
    const infoLines = [
      t('pdfDate') + ' : ' + dateStr,
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
    doc.text(t('recapTitle') + ' — ' + t('pdfLblScores'), margin, y);
    y += 5;

    // Tableau header
    const colName=margin, colStatus=margin+80, colScore=margin+145;
    doc.setFillColor(...C_BG_HDR);
    doc.rect(margin, y-4, contentW, 7, 'F');
    doc.setFontSize(8);
    doc.setTextColor(...C_SUB);
    doc.text(t('namesTitle')||'Joueur', colName+1, y);
    doc.text(t('pdfColStatus'), colStatus+1, y);
    doc.text(t('Score'), colScore+1, y);
    y += 4;
    doc.setDrawColor(...C_BORDER);
    doc.line(margin, y, pageW-margin, y);
    y += 4;

    // Trier : gagnants d'abord, puis éliminés par rang, puis actifs
    const sorted = players.map((p,i)=>({p,i})).sort((a,b)=>{
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
      if(p.winner)status='🏆 '+t('winner')+(players.length>2?' #'+(p.winRank||1):'');
      else if(p.eliminated)status='💀 '+(players.length>2?'#'+(p.elimRank||''):''+t('btnEliminate'));

      doc.setFont('helvetica','bold');
      doc.setFontSize(9);
      doc.setTextColor(...C_TITLE);
      doc.text(name.substring(0,28), colName+1, y);

      doc.setFont('helvetica','normal');
      doc.setFontSize(8);
      if(p.winner)doc.setTextColor(...C_WIN);
      else if(p.eliminated)doc.setTextColor(...C_ELIM);
      else doc.setTextColor(...C_SUB);
      doc.text(status, colStatus+1, y);

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

    players.forEach((p,pi)=>{
      const groups=history.filter(h=>h.playerIdx===pi).sort((a,b)=>a.rank-b.rank);
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
      doc.text(t('pdfTotal')+' : '+fmtNum(displayScore), margin+4, y);
      y += 7;
    });
  }

  // ── Pied de page ──
  const totalPages = doc.internal.getNumberOfPages();
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


