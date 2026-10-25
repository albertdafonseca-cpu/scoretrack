// ── NOUVELLE PARTIE — mêmes noms et réglages, direct au compteur ──
function startNewGameSameSetup(){
  const savedNames = players.map(p => p.playerName || '');
  const cfg = lastGameConfig || settings.lastGameConfig;

  ['reset-modal','winner-modal','recap','score-modal','elim-modal','endgame-modal']
    .forEach(id => document.getElementById(id).classList.add('hidden'));

  store.del('save');

  // Restaurer les réglages de la partie précédente
  if(cfg){
    numPlayers   = cfg.numPlayers;
    startPoints  = cfg.startPoints;
    bloquerMode  = cfg.bloquerMode || 'none';
    allowNeg     = cfg.allowNeg || false;
    objectifMode = cfg.objectifMode || 'none';
    elimPoints   = cfg.objectifMode === 'elim' ? (cfg.objectifVal ?? null) : null;
    winPoints    = cfg.objectifMode === 'win'  ? (cfg.objectifVal ?? null) : null;
    maxPoints    = (cfg.objectifMode === 'win' && cfg.objectifVal != null && cfg.objectifVal > (cfg.startPoints||0)) ? cfg.objectifVal : Infinity;
  }

  // Réinitialiser l'état de jeu, garder les noms et la rotation des cartes
  rankCounter = 0; undoStack = []; history = []; actionCounter = 0;
  groupTimers = {}; elimPending = -1;
  players = Array.from({length: numPlayers}, (_, i) => ({
    playerName : savedNames[i] || '',
    score      : startPoints,
    eliminated : false,
    winner     : false,
    rot        : 'rot-0'
  }));
  seatOrder = players.map((_, i) => i);

  document.getElementById('game-screen').style.display = 'flex';
  
  renderGame();
  saveGame();
}

// ── RESET ─────────────────────────────────────────────────────────
function confirmReset(){
  ['reset-modal','winner-modal','recap','score-modal','elim-modal','endgame-modal'].forEach(id=>document.getElementById(id).classList.add('hidden'));
  document.getElementById('game-screen').style.display='none';
  document.getElementById('restore-banner').classList.add('hidden');
  window._pendingEndgame=null;
  store.del('save');
  numPlayers=0;startPoints=0;maxPoints=Infinity;allowNeg=false;elimPending=-1;
  elimPoints=null;winPoints=null;objectifMode='none';
  bloquerMode='none';rankCounter=0;
  selectObjectif('none');
  document.getElementById('objectif-custom').value='';
  document.querySelectorAll('#players-grid .player-chip').forEach(c=>c.classList.remove('on'));
  document.querySelectorAll('#start-presets .points-chip').forEach(c=>{c.classList.remove('on');c.classList.remove('disabled');});
  document.getElementById('points-custom').value='';
  document.querySelectorAll('.preset-card').forEach(c=>c.classList.remove('on'));
  document.getElementById('go-btn').disabled=true;document.getElementById('go-btn').textContent=t('btnNext');
  // Restaurer les réglages de la dernière partie, ou LDM par défaut
  if(settings.lastGameConfig){
    const c=settings.lastGameConfig;
    selectPlayer(c.numPlayers);
    selectStartPreset(c.startPoints);
    allowNeg=c.allowNeg||false;
    singleWinner=c.singleWinner||false;
    lastLoser=c.lastLoser||false;
    setObjectifFromPreset(c.objectifMode||'none',c.objectifVal??null);
    highlightMatchingPreset();
  } else {
    const ldmIdx=GAME_PRESETS.findIndex(p=>p.nameKey==='presetLdm');
    applyPreset(ldmIdx>=0?ldmIdx:0);
  }
  renderPresets();
  showPage('setup-page');
}

// ── BAR DRAWER ────────────────────────────────────────────────────
(function initBarDrawer(){
  const bar     = document.getElementById('bar');
  const handle  = document.getElementById('bar-handle-zone');
  const buttons = document.getElementById('bar-buttons');
  let startY=0, dragging=false, startH=0;
  let _openH=0;

  function getOpenH(){
    if(_openH) return _openH;
    buttons.style.transition='none';
    buttons.style.maxHeight='200px';
    void buttons.offsetHeight;
    _openH = buttons.scrollHeight;
    buttons.style.maxHeight = bar.classList.contains('open') ? _openH+'px' : '0';
    void buttons.offsetHeight;
    buttons.style.transition='';
    return _openH;
  }

  function animateFit(){
    const t0 = performance.now();
    const wrap = document.getElementById('players-wrap');
    function loop(now){
      void wrap.offsetHeight; fixLateral(); _fitCache={}; fitTexts();
      if(now - t0 < 350) requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  function snapOpen(){
    bar.classList.add('open');
    buttons.style.transition='max-height 0.22s cubic-bezier(0.32,0.72,0,1),opacity 0.2s ease';
    buttons.style.maxHeight = getOpenH()+'px';
    buttons.style.opacity='1';
    animateFit();
    resetBarTimer();
  }
  function snapClose(){
    bar.classList.remove('open');
    buttons.style.transition='max-height 0.22s cubic-bezier(0.32,0.72,0,1),opacity 0.15s ease';
    buttons.style.maxHeight='0';
    buttons.style.opacity='0';
    animateFit();
    clearTimeout(_barTimer);
  }
  function toggleBar(){ bar.classList.contains('open') ? snapClose() : snapOpen(); }

  // Auto-fermeture après 3s d'inactivité
  let _barTimer=null;
  function resetBarTimer(){
    clearTimeout(_barTimer);
    if(bar.classList.contains('open')){
      _barTimer=setTimeout(()=>snapClose(), 3000);
    }
  }
  // Redémarrer le timer à chaque interaction avec la barre
  buttons.addEventListener('touchstart', ()=>resetBarTimer(), {passive:true});
  buttons.addEventListener('click', ()=>resetBarTimer());

  handle.addEventListener('touchstart', e => {
    if(e.touches.length>1) return;
    e.stopPropagation();
    startY = e.touches[0].clientY;
    startH = bar.classList.contains('open') ? getOpenH() : 0;
    dragging = true;
    buttons.style.transition = 'none';
  }, { passive:true });

  handle.addEventListener('touchmove', e => {
    if(!dragging) return;
    const dy = startY - e.touches[0].clientY;
    const h = Math.max(0, Math.min(startH + dy, getOpenH()));
    buttons.style.maxHeight = h+'px';
    buttons.style.opacity = String(+(h / getOpenH()).toFixed(3));
    void document.getElementById('players-wrap').offsetHeight;
    fixLateral(); _fitCache={}; fitTexts();
  }, { passive:true });

  handle.addEventListener('touchend', e => {
    if(!dragging) return; dragging=false;
    const dy = startY - e.changedTouches[0].clientY;
    const h = Math.max(0, startH + dy);
    if(h > getOpenH() / 2) snapOpen(); else snapClose();
    e.stopPropagation();
  }, { passive:true });

  handle.addEventListener('click', e => { toggleBar(); e.stopPropagation(); });
  document.addEventListener('touchstart', e => {
    if (e.touches.length > 1) { window._isZooming = true; }
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (e.touches.length === 0) { setTimeout(() => { window._isZooming = false; }, 200); }
  }, { passive: true });

  window._barInit = function(){ _fitCache={}; fitTexts(); };
  let _barResizeTimer=null;
  window.addEventListener('resize', () => { clearTimeout(_barResizeTimer); _barResizeTimer=setTimeout(()=>{ _openH=0; _fitCache={}; fitTexts(); },150); });
})();

