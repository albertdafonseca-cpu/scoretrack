// ── MODAL SCORE MANUEL ────────────────────────────────────────────
function openScoreModal(pi, forceRot){
  if(window._modalJustClosed) return;
  const p=players[pi];if(!p||p.eliminated||p.winner)return;
  // Toujours fermer le groupe ouvert pour cet index
  const openGroup=history.find(h=>h.playerIdx===pi&&h.open);
  if(openGroup){openGroup.open=false;if(groupTimers[pi]){clearTimeout(groupTimers[pi]);delete groupTimers[pi];}}
  modalPlayerIdx=pi;modalValue='0';modalSign=bloquerMode==='max'?-1:1;
  document.getElementById('score-modal-player').textContent=(p.playerName||`${t('player')} ${pi+1}`)+' — '+fmtNum(p.score);
  updateModalDisplay();
  setSign(modalSign);
  // Orienter : forcé par le swipe, ou rotation de la carte pour l'appui long
  const rot=forceRot||(p.rot||'rot-0');
  const overlay=document.getElementById('score-modal');
  const rotEl=document.getElementById('modal-content-rotatable');
  const box=overlay.querySelector('.modal-box');
  // Réinitialiser tout
  overlay.removeAttribute('style');
  overlay.classList.remove('rot-180');
  if(rotEl)rotEl.removeAttribute('style');
  if(box)box.removeAttribute('style');
  // Facteur d'échelle basé sur la petite dimension — identique pour tous les modaux
  const _side = Math.min(window.innerWidth, window.innerHeight, 320);
  const _p = _side / 390;
  if(rot==='rot-180'){
    if(box) box.style.borderRadius=`0 0 ${Math.round(16*_p)}px ${Math.round(16*_p)}px`;
  } else {
    if(box) box.style.borderRadius=`${Math.round(16*_p)}px ${Math.round(16*_p)}px 0 0`;
  }
  const _scoreDisp = overlay.querySelector('.modal-score-display');
  const _player    = overlay.querySelector('.modal-player');
  const _title     = overlay.querySelector('.modal-title');
  const _handle    = overlay.querySelector('.modal-handle');
  if(_scoreDisp){ _scoreDisp.style.fontSize=`${Math.round(44*_p)}px`; _scoreDisp.style.minHeight=`${Math.round(52*_p)}px`; }
  if(_player)    _player.style.fontSize=`${Math.round(22*_p)}px`;
  if(_title)     _title.style.fontSize=`${Math.round(14*_p)}px`;
  if(_handle)    _handle.style.padding=`${Math.round(4*_p)}px ${Math.round(40*_p)}px`;
  overlay.querySelectorAll('.key-btn').forEach(k=>{ k.style.padding=`${Math.round(5*_p)}px ${Math.round(3*_p)}px`; k.style.fontSize=`${Math.round(24*_p)}px`; });
  overlay.querySelectorAll('.sign-btn').forEach(b=>{ b.style.padding=`${Math.round(4*_p)}px`; b.style.fontSize=`${Math.round(16*_p)}px`; });
  overlay.querySelectorAll('.modal-btn').forEach(b=>{ b.style.padding=`${Math.round(10*_p)}px`; b.style.fontSize=`${Math.round(14*_p)}px`; });

  if(rot==='rot-180'){
    overlay.classList.add('rot-180');
    overlay.style.alignItems='flex-start';
    rotEl.style.transform='rotate(180deg)';
    {
      const side=Math.min(window.innerWidth,window.innerHeight,320), p=side/390;
      if(box){box.style.width=side+'px';box.style.maxWidth=side+'px';box.style.maxHeight=side+'px';box.style.overflowY='auto';box.style.display='';box.style.flexDirection='';box.style.height='';box.style.transform='';box.style.transformOrigin='';box.style.position='';}
      rotEl.style.padding=`${Math.round(6*p)}px ${Math.round(12*p)}px ${Math.round(12*p)}px`;rotEl.style.display='';rotEl.style.flexDirection='';rotEl.style.flex='';rotEl.style.minHeight='';rotEl.style.overflow='';
      const ttl=overlay.querySelector('.modal-title'),plr=overlay.querySelector('.modal-player'),scd=overlay.querySelector('.modal-score-display'),hdl=overlay.querySelector('.modal-handle'),sgr=overlay.querySelector('.modal-sign-row');
      if(hdl){hdl.style.padding=`${Math.round(4*p)}px 40px`;hdl.style.marginBottom=`${Math.round(4*p)}px`;}
      if(ttl)ttl.style.marginBottom=`${Math.round(2*p)}px`;if(plr)plr.style.marginBottom=`${Math.round(4*p)}px`;
      if(scd){scd.style.fontSize=`${Math.round(44*p)}px`;scd.style.marginBottom=`${Math.round(6*p)}px`;scd.style.minHeight=`${Math.round(52*p)}px`;}
      if(sgr)sgr.style.marginBottom=`${Math.round(6*p)}px`;
      overlay.querySelectorAll('.key-btn').forEach(k=>{k.style.padding=`${Math.round(5*p)}px ${Math.round(3*p)}px`;k.style.fontSize=`${Math.round(24*p)}px`;k.style.minHeight='';k.style.height='';});
      overlay.querySelectorAll('.modal-btn').forEach(b=>{b.style.padding=`${Math.round(10*p)}px`;b.style.fontSize=`${Math.round(14*p)}px`;});
      overlay.querySelectorAll('.sign-btn').forEach(b=>{b.style.padding=`${Math.round(4*p)}px`;b.style.fontSize=`${Math.round(16*p)}px`;});
      const kp=overlay.querySelector('.modal-keypad');if(kp){kp.style.marginBottom='6px';kp.style.flex='';kp.style.height='';kp.style.minHeight='';kp.style.overflow='';kp.style.gridTemplateRows='';kp.style.gap='';}
    }
  } else if(rot==='rot-0'){
    {
      const side=Math.min(window.innerWidth,window.innerHeight,320), p=side/390;
      if(box){box.style.width=side+'px';box.style.maxWidth=side+'px';box.style.maxHeight=side+'px';box.style.overflowY='auto';box.style.display='';box.style.flexDirection='';box.style.height='';box.style.transform='';box.style.transformOrigin='';box.style.position='';}
      rotEl.style.padding=`${Math.round(6*p)}px ${Math.round(12*p)}px ${Math.round(12*p)}px`;rotEl.style.display='';rotEl.style.flexDirection='';rotEl.style.flex='';rotEl.style.minHeight='';rotEl.style.overflow='';
      const ttl=overlay.querySelector('.modal-title'),plr=overlay.querySelector('.modal-player'),scd=overlay.querySelector('.modal-score-display'),hdl=overlay.querySelector('.modal-handle'),sgr=overlay.querySelector('.modal-sign-row');
      if(hdl){hdl.style.padding=`${Math.round(4*p)}px 40px`;hdl.style.marginBottom=`${Math.round(4*p)}px`;}
      if(ttl)ttl.style.marginBottom=`${Math.round(2*p)}px`;if(plr)plr.style.marginBottom=`${Math.round(4*p)}px`;
      if(scd){scd.style.fontSize=`${Math.round(44*p)}px`;scd.style.marginBottom=`${Math.round(6*p)}px`;scd.style.minHeight=`${Math.round(52*p)}px`;}
      if(sgr)sgr.style.marginBottom=`${Math.round(6*p)}px`;
      overlay.querySelectorAll('.key-btn').forEach(k=>{k.style.padding=`${Math.round(5*p)}px ${Math.round(3*p)}px`;k.style.fontSize=`${Math.round(24*p)}px`;k.style.minHeight='';k.style.height='';});
      overlay.querySelectorAll('.modal-btn').forEach(b=>{b.style.padding=`${Math.round(10*p)}px`;b.style.fontSize=`${Math.round(14*p)}px`;});
      overlay.querySelectorAll('.sign-btn').forEach(b=>{b.style.padding=`${Math.round(4*p)}px`;b.style.fontSize=`${Math.round(16*p)}px`;});
      const kp=overlay.querySelector('.modal-keypad');if(kp){kp.style.marginBottom='6px';kp.style.flex='';kp.style.height='';kp.style.minHeight='';kp.style.overflow='';kp.style.gridTemplateRows='';kp.style.gap='';}
    }
  } else if(rot==='rot-l'||rot==='rot-r'){
    const vw=window.innerWidth,vh=window.innerHeight;
    const isLeft=rot==='rot-l';
    const deg=isLeft?90:-90;

    // Lire les safe-areas via élément sentinelle
    const _sa=document.createElement('div');
    _sa.style.cssText='position:fixed;top:env(safe-area-inset-top,0px);left:env(safe-area-inset-left,0px);right:env(safe-area-inset-right,0px);bottom:env(safe-area-inset-bottom,0px);pointer-events:none;';
    document.body.appendChild(_sa);
    const _sar=_sa.getBoundingClientRect();
    const safeL=_sar.left, safeR=vw-_sar.right, safeT=_sar.top, safeB=vh-_sar.bottom;
    document.body.removeChild(_sa);

    // En mode paysage PWA, la safe-area du côté physique du modal réduit la largeur disponible
    // isLeft → bord droit physique = safe-area-right ; isRight → bord gauche = safe-area-left
    const safeEdge = isLeft ? safeR : safeL;
    const safeOpp  = isLeft ? safeL : safeR;

    // Largeur disponible physique après safe-areas = vw - safeL - safeR
    const physW = vw - safeL - safeR;
    // Hauteur disponible physique = vh - safeT - safeB  
    const physH = vh - safeT - safeB;

    const side=Math.min(physW, physH, 320);
    const p=side/390;

    // Rotation de l'overlay — dimensions croisées pour couvrir l'écran après rotation 90°
    overlay.style.position='fixed';
    overlay.style.right='auto';
    overlay.style.bottom='auto';
    const w=vh, h=vw;
    overlay.style.width=w+'px';
    overlay.style.height=h+'px';
    overlay.style.top=`${(vh-h)/2}px`;
    overlay.style.left=`${(vw-w)/2}px`;
    overlay.style.transform=`rotate(${deg}deg)`;
    overlay.style.transformOrigin='center center';
    overlay.style.alignItems='flex-end';
    overlay.style.justifyContent='center';
    // Padding côté bord physique uniquement si safe-area réelle (PWA)
    overlay.style.paddingBottom=safeEdge>0?`${safeEdge}px`:'0';

    if(box){
      box.style.width=side+'px';
      box.style.maxWidth=side+'px';
      box.style.maxHeight=side+'px';
      box.style.overflowY='auto';
      box.style.display='';
      box.style.flexDirection='';
      box.style.height='';
      box.style.transform='';
      box.style.transformOrigin='';
      box.style.position='';
    }
    // Réduire le padding et les tailles pour tenir dans la largeur de l'écran
    rotEl.style.padding=`${Math.round(6*p)}px ${Math.round(12*p)}px ${Math.round(12*p)}px`;
    rotEl.style.display='';
    rotEl.style.flexDirection='';
    rotEl.style.flex='';
    rotEl.style.minHeight='';
    rotEl.style.overflow='';
    const title=overlay.querySelector('.modal-title');
    const player=overlay.querySelector('.modal-player');
    const scoreDisp=overlay.querySelector('.modal-score-display');
    const handle=overlay.querySelector('.modal-handle');
    const signRow=overlay.querySelector('.modal-sign-row');
    
    if(handle){ handle.style.padding=`${Math.round(4*p)}px 40px`; handle.style.marginBottom=`${Math.round(4*p)}px`; }
    if(title){ title.style.marginBottom=`${Math.round(2*p)}px`; } if(player){ player.style.fontSize=`${Math.round(22*p)}px`; player.style.marginBottom=`${Math.round(4*p)}px`; }
    if(scoreDisp){ scoreDisp.style.fontSize=`${Math.round(44*p)}px`; scoreDisp.style.marginBottom=`${Math.round(6*p)}px`; scoreDisp.style.minHeight=`${Math.round(52*p)}px`; }
    if(signRow){ signRow.style.marginBottom=`${Math.round(6*p)}px`; }
    overlay.querySelectorAll('.key-btn').forEach(k=>{ k.style.padding=`${Math.round(5*p)}px ${Math.round(3*p)}px`; k.style.fontSize=`${Math.round(24*p)}px`; k.style.minHeight=''; k.style.height=''; });
    overlay.querySelectorAll('.modal-btn').forEach(b=>{ b.style.padding=`${Math.round(10*p)}px`; b.style.fontSize=`${Math.round(14*p)}px`; });
    overlay.querySelectorAll('.sign-btn').forEach(b=>{ b.style.padding=`${Math.round(4*p)}px`; b.style.fontSize=`${Math.round(16*p)}px`; });
    const keypad=overlay.querySelector('.modal-keypad');
    if(keypad){ keypad.style.marginBottom='6px'; keypad.style.flex=''; keypad.style.height=''; keypad.style.minHeight=''; keypad.style.overflow=''; keypad.style.gridTemplateRows=''; keypad.style.gap=''; }
  }
  // (rot top/bottom non utilisé)
  // Afficher backdrop et modal
  const bd=document.getElementById('modal-backdrop');
  if(bd){ bd.classList.remove('hidden'); bd.style.background='rgba(20,14,8,0.88)'; }
  overlay._modalRot = rot;
  overlay.classList.remove('hidden');
}
function closeScoreModal(){
  const overlay=document.getElementById('score-modal');
  const backdrop=document.getElementById('modal-backdrop');
  overlay._dragging=false;
  window._modalJustClosed=true;
  setTimeout(()=>{ window._modalJustClosed=false; }, 350);
  overlay.classList.add('hidden');
  if(backdrop){ backdrop.classList.add('hidden'); backdrop.style.background=''; }
  // Reset complet pour la prochaine ouverture
  overlay.removeAttribute('style');
  overlay.classList.remove('rot-180');
  const rotEl=document.getElementById('modal-content-rotatable');
  if(rotEl)rotEl.removeAttribute('style');
  const box=overlay.querySelector('.modal-box');
  if(box)box.removeAttribute('style');
  overlay.querySelectorAll('.key-btn,.modal-btn,.sign-btn').forEach(el=>el.removeAttribute('style'));
  const els=['.modal-title','.modal-player','.modal-score-display','.modal-handle','.modal-sign-row','.modal-keypad','.modal-confirm-row'];
  els.forEach(sel=>{const el=overlay.querySelector(sel);if(el)el.removeAttribute('style');});
}

// ── Drag-to-close modal ─────────────────────────────────────────
(function initModalDrag(){
  const overlay = document.getElementById('score-modal');
  const mBox    = overlay.querySelector('.modal-box');
  const mHandle = overlay.querySelector('.modal-handle');
  if(!mBox || !mHandle) return;

  let _active=false, _sx=0, _sy=0, _lastD=0, _lastT=0, _vel=0;
  let _origTop='', _origLeft='';

  const backdrop=document.getElementById('modal-backdrop');
  if(backdrop){
    backdrop.addEventListener('touchstart',e=>{
      if(!overlay.classList.contains('hidden')){e.preventDefault();closeScoreModal();}
    },{passive:false});
    backdrop.addEventListener('click',()=>{
      if(!overlay.classList.contains('hidden'))closeScoreModal();
    });
  }

  function getRot(){ return overlay._modalRot||'rot-0'; }

  function getD(touches){
    const dx=touches[0].clientX-_sx, dy=touches[0].clientY-_sy;
    const r=getRot();
    if(r==='rot-0')   return dy;
    if(r==='rot-180') return -dy;
    if(r==='rot-l')   return -dx;
    if(r==='rot-r')   return dx;
    return dy;
  }

  function apply(d){
    const clamped=Math.max(0,d);
    const r=getRot();
    if(r==='rot-0'){
      const box=overlay.querySelector('.modal-box');
      if(box) box.style.transform=`translateY(${clamped}px)`;
    } else if(r==='rot-180')
      overlay.style.top=`calc(${_origTop} - ${clamped}px)`;
    else if(r==='rot-l')
      overlay.style.left=`calc(${_origLeft} - ${clamped}px)`;
    else if(r==='rot-r')
      overlay.style.left=`calc(${_origLeft} + ${clamped}px)`;
    const fade=Math.min(clamped/150,1);
    if(backdrop) backdrop.style.background=`rgba(20,14,8,${(0.88*(1-fade)).toFixed(3)})`;
  }

  function snapClose(){
    const r=getRot();
    if(r==='rot-0'){
      const box=overlay.querySelector('.modal-box');
      if(box){ box.style.transition='transform 0.2s cubic-bezier(0.4,0,1,1)'; box.style.transform='translateY(100vh)'; }
    } else {
      overlay.style.transition='top 0.2s cubic-bezier(0.4,0,1,1), left 0.2s cubic-bezier(0.4,0,1,1)';
      if(r==='rot-180') overlay.style.top=`calc(${_origTop} - 100vh)`;
      if(r==='rot-l')   overlay.style.left=`calc(${_origLeft} - 100vw)`;
      if(r==='rot-r')   overlay.style.left=`calc(${_origLeft} + 100vw)`;
    }
    if(backdrop){ backdrop.style.transition='background 0.2s linear'; backdrop.style.background='rgba(20,14,8,0)'; }
    setTimeout(closeScoreModal, 210);
  }

  function snapOpen(){
    const r=getRot();
    if(r==='rot-0'){
      const box=overlay.querySelector('.modal-box');
      if(box){ box.style.animation='none'; box.style.transition='transform 0.25s cubic-bezier(0.32,0.72,0,1)'; box.style.transform=''; }
    } else {
      overlay.style.transition='top 0.25s cubic-bezier(0.32,0.72,0,1), left 0.25s cubic-bezier(0.32,0.72,0,1)';
      overlay.style.top=_origTop;
      overlay.style.left=_origLeft;
    }
    if(backdrop){ backdrop.style.transition='background 0.25s ease'; backdrop.style.background='rgba(20,14,8,0.88)'; }
  }

  // Bloquer les clics sur boutons après un pinch-zoom
  let _wasPinch=false, _pinchBlockTimer=null;

  overlay.querySelector('.modal-box').addEventListener('touchstart', e=>{
    if(e.touches.length>=2){
      _wasPinch=true;
      clearTimeout(_pinchBlockTimer);
    }
  },{passive:true});

  overlay.querySelector('.modal-box').addEventListener('touchend', e=>{
    if(_wasPinch){
      e.preventDefault();
      e.stopPropagation();
      _pinchBlockTimer=setTimeout(()=>{ _wasPinch=false; },400);
    }
  },{passive:false});

  overlay.querySelector('.modal-box').addEventListener('click', e=>{
    if(_wasPinch){ e.stopPropagation(); e.preventDefault(); }
  },{capture:true});

  function startDrag(e){
    if(overlay.classList.contains('hidden')) return;
    if(e.touches.length>1) return; // laisser le pinch-zoom
    // Exclure les touches sur keypad et boutons
    if(e.target.closest('.modal-keypad,.modal-confirm-row,.modal-sign-row')) return;
    _active=true; _vel=0; _lastD=0; _lastT=performance.now();
    _sx=e.touches[0].clientX; _sy=e.touches[0].clientY;
    _origTop  = overlay.style.top  || '0px';
    _origLeft = overlay.style.left || '0px';
    const r=getRot();
    if(r==='rot-0'){
      const box=overlay.querySelector('.modal-box');
      if(box){ box.style.transition='none'; box.style.animation='none'; }
    } else {
      overlay.style.transition='none';
    }
    document.addEventListener('touchmove', onDragMove, {passive:false});
    document.addEventListener('touchend',  onDragEnd,  {passive:false});
  }

  function onDragMove(e){
    if(!_active) return;
    e.preventDefault();
    const now=performance.now(), d=Math.max(0,getD(e.touches));
    const dt=now-_lastT; if(dt>0) _vel=(d-_lastD)/dt;
    _lastD=d; _lastT=now;
    apply(d);
  }

  function onDragEnd(e){
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('touchend',  onDragEnd);
    if(!_active) return;
    _active=false;
    if(overlay.classList.contains('hidden')) return;
    const d=Math.max(0,getD(e.changedTouches));
    if(d>120||_vel>0.3) snapClose();
    else snapOpen();
  }

  // Zone de drag : tout le modal-box sauf keypad, sign-row et confirm-row
  const _dragBox=overlay.querySelector('.modal-box');
  if(_dragBox) _dragBox.addEventListener('touchstart', startDrag, {passive:true});

  overlay.addEventListener('touchend', e=>{
    if(_active) return;
    const b=overlay.querySelector('.modal-box');
    if(b && !b.contains(e.target)){ e.preventDefault(); closeScoreModal(); }
  },{passive:false});
})();

function setSign(s){
  modalSign=s;
  document.getElementById('sign-plus').classList.toggle('active',s===1);
  document.getElementById('sign-minus').classList.toggle('active',s===-1);
  updateModalDisplay();
  if(parseInt(modalValue)>0) confirmScoreModal();
}
function pressKey(k){
  if(k==='⌫')modalValue=modalValue.length>1?modalValue.slice(0,-1):'0';
  else if(k==='00')modalValue=modalValue==='0'?'0':modalValue+'00';
  else modalValue=modalValue==='0'?String(k):modalValue+k;
  if(modalValue.length>7)modalValue=modalValue.slice(0,7);
  updateModalDisplay();
}
function updateModalDisplay(){
  const v=parseInt(modalValue)||0;
  const el=document.getElementById('score-modal-display');
  el.textContent=(modalSign===1?'▲ +':'▼ −')+fmtNum(v);
  el.className='modal-score-display'+(modalSign===1?' pos':' neg');
}
function confirmScoreModal(){
  const v=parseInt(modalValue)||0;if(v===0){closeScoreModal();return;}
  const delta=modalSign*v;
  const p=players[modalPlayerIdx];
  const minVal=bloquerMode==='min'?startPoints:(allowNeg||objectifMode==='elim'||objectifMode==='none'?-Infinity:(objectifMode==='win'&&winPoints!==null&&winPoints<startPoints?winPoints:0));
  const capMax=bloquerMode==='max'?startPoints:(maxPoints===Infinity?Infinity:maxPoints);
  const prevScore=p.score;
  const rawScore=p.score+delta;
  const newScore=Math.min(capMax,Math.max(minVal,rawScore));
  if(newScore===prevScore){closeScoreModal();return;} // aucun changement réel : pas d'étape d'annulation
  saveUndo();
  window._lastAdjustPrev={playerIdx:modalPlayerIdx, score:prevScore, rawScore:p.rawScore};
  p.score=newScore;
  p.rawScore=rawScore; // score brut avant clamp
  const realDelta=p.score-prevScore;
  const rawDelta=rawScore-prevScore; // delta brut avant clamp
  updateDisplay(modalPlayerIdx,null,realDelta);
  flashDelta(modalPlayerIdx,realDelta);
  actionCounter++;
  const group={playerIdx:modalPlayerIdx,who:p.playerName,entries:[{delta:rawDelta}],open:false,rank:actionCounter};
  history.unshift(group);
  saveGame();
  closeScoreModal();
}

// ── UNDO ──────────────────────────────────────────────────────────
(function setupUndo(){
  const btn=document.getElementById('undo-btn');let iv=null,to=null;
  const stop=()=>{clearTimeout(to);clearInterval(iv);to=null;iv=null;};
  const start=e=>{e.preventDefault();stop();undoLast();to=setTimeout(()=>{iv=setInterval(undoLast,120);},500);};
  window._undoRepeatStop=stop;
  btn.addEventListener('touchstart',start,{passive:false});btn.addEventListener('touchend',stop);btn.addEventListener('touchcancel',stop);
  btn.addEventListener('mousedown',start);btn.addEventListener('mouseup',stop);btn.addEventListener('mouseleave',stop);
  // Relâchement n'importe où : arrêter la répétition
  ['pointerup','pointercancel','touchend'].forEach(ev=>document.addEventListener(ev,stop,{passive:true}));
  // Clavier (Entrée/Espace) : une seule annulation, sans répétition
  btn.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!e.repeat)undoLast();}});
})();

function saveUndo(){
  undoStack.push(JSON.stringify({players,history,seatOrder,actionCounter,rankCounter}));
  if(undoStack.length>40)undoStack.shift();
  document.getElementById('undo-btn').disabled=false;
}
function undoLast(){
  if(!undoStack.length){if(window._undoRepeatStop)window._undoRepeatStop();return;}
  // Fermer le modal winner s'il est ouvert
  document.getElementById('winner-modal').classList.add('hidden');
  document.getElementById('elim-modal').classList.add('hidden');
  elimPending=-1;
  // Annuler toute fin de partie / animation en attente
  window._afterFinAnim=null;window._afterWinAnim=null;window._afterElimAnim=null;window._pendingEndgame=null;
  document.getElementById('endgame-modal').classList.add('hidden');
  const s=JSON.parse(undoStack.pop());
  players=s.players;history=s.history;seatOrder=s.seatOrder;actionCounter=s.actionCounter;
  if(typeof s.rankCounter==='number')rankCounter=s.rankCounter;
  document.getElementById('undo-btn').disabled=undoStack.length===0;
  _fitCache={};
  renderGame();saveGame();
}

function rotatePlayers(){
  if(players.length<2)return;saveUndo();
  const last=seatOrder.pop();seatOrder.unshift(last);
  renderGame();saveGame();
}

