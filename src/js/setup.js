// ═══════════════════════════════════════════════════════════════
// Polices des thèmes arcade (retro) et ldm/ldm-day (classic) : feuille chargée une seule fois,
// à la demande (non bloquante pour le rendu initial)
const THEME_FONTS={arcade:'retro',ldm:'classic','ldm-day':'classic'};
function loadThemeFonts(id){
  const f=THEME_FONTS[id];if(!f||document.getElementById('fonts-'+f))return;
  const l=document.createElement('link');l.id='fonts-'+f;l.rel='stylesheet';l.href='fonts/fonts-'+f+'.css';
  document.head.appendChild(l);
}
function applyTheme(id){
  loadThemeFonts(id);
  document.documentElement.setAttribute('data-theme',id==='cyber'?'':id);
  selectedTheme=id;
  const colors={cyber:'#020d12',dark:'#0a0a0f','neon-pink':'#0d0010',arcade:'#0a0800',nature:'#051208',sunset:'#120508',ocean:'#020810',mono:'#080808','ldm-day':'#f5f0e8',ldm:'#0d0a12'};
  const c=colors[id]||'#020d12';
  const m=document.getElementById('meta-theme-color');if(m)m.content=c;
}
function restoreSavedDefaults(e){
  // Détecter si aucun réglage n'a encore été sauvegardé
  const btnR=_getFooterBtn(e);
  if(!settings.defSaved){return;} // label déjà 'Nothing to restore' en permanence
  if(settings.defPlayers) selectPlayer(settings.defPlayers);
  selectStartPreset(settings.defStart||0);
  if(settings.defMax>0) maxPoints=settings.defMax; else maxPoints=Infinity;
  allowNeg=settings.defNeg||false;
  singleWinner=settings.defSingleWinner||false;
  lastLoser=settings.defLastLoser||false;
  setObjectifFromPreset(settings.defObjectifMode||'none', settings.defObjectifVal??null);
  selectedPresetIdx=-1;
  renderPresets();
  checkGoBtn();
  _flashBtnLabel(btnR,t('restored')||'✓ Restauré',1500);
}
function clearSavedDefaults(e){
  if(!settings.defSaved)return;
  settings={...settings,defPlayers:0,defStart:0,defMax:0,defNeg:false,defObjectifMode:'none',defObjectifVal:null,defSingleWinner:false,defLastLoser:false,defSaved:false};
  defPlayers=0;defStart=0;defMax=0;defNeg=false;
  saveSettings();
  updateRestoreBtn();
  _flashBtnLabel(_getFooterBtn(e),t('cleared')||'✓ Effacé',1500);
}
function saveAsDefault(e){
  settings={...settings,defPlayers:numPlayers||0,defStart:startPoints>=0?startPoints:0,defMax:maxPoints===Infinity?0:maxPoints,defNeg:allowNeg,defObjectifMode:objectifMode||'none',defObjectifVal:getObjectifVal(),defSingleWinner:singleWinner||false,defLastLoser:lastLoser||false,defSaved:true};
  saveSettings();
  defPlayers=settings.defPlayers;defStart=settings.defStart;defMax=settings.defMax;defNeg=settings.defNeg;
  // Flash confirmation
  updateRestoreBtn();
  // Flash léger sur l'emoji save uniquement
  const _sb=document.getElementById('btn-savedefault');
  if(_sb){const _em=_sb.querySelector('.btn-emoji');if(_em){const _eo=_em.innerHTML;_em.innerHTML='✓';setTimeout(()=>_em.innerHTML=_eo,1200);}}
}

// ── SAUVEGARDE DE PARTIE ──────────────────────────────────────────
function saveGame(){
  // Pas de sauvegarde pendant une confirmation de fin de partie en attente
  if(window._pendingEndgame)return;
  try{
    store.set('save',JSON.stringify({
      app:APP_ID,
      players,seatOrder,history,actionCounter,
      numPlayers,startPoints,maxPoints:maxPoints===Infinity?null:maxPoints,allowNeg,
      saveVersion:33,
      elimPoints,winPoints,objectifMode,bloquerMode,rankCounter,singleWinner,lastLoser,
      lastGameConfig,
      ts:Date.now()
    }));
  }catch(e){}
}
// Limites Light : 2 à 6 joueurs (chips 2-4 + preset Loi du Milieu), pas de mode
// « sans limite » ni d'options de victoire Pro
const MAX_PLAYERS=12, LIGHT_MIN_PLAYERS=2, LIGHT_MAX_PLAYERS=6;
const _isNum=v=>typeof v==='number'&&isFinite(v);
function isValidSave(s){
  if(!s||typeof s!=='object'||Array.isArray(s))return false;
  if(s.app!==undefined&&s.app!==APP_ID)return false;
  if((s.saveVersion||0)<33)return false;
  const P=s.players;
  if(!Array.isArray(P)||P.length<1||P.length>MAX_PLAYERS)return false;
  if(!P.every(p=>p&&typeof p==='object'&&_isNum(p.score)&&(p.playerName===undefined||typeof p.playerName==='string')
    &&(p.rawScore===undefined||_isNum(p.rawScore))&&(p.finalScore===undefined||_isNum(p.finalScore))))return false;
  if(!Array.isArray(s.seatOrder)||s.seatOrder.length!==P.length
    ||!s.seatOrder.every(i=>Number.isInteger(i)&&i>=0&&i<P.length)
    ||new Set(s.seatOrder).size!==P.length)return false;
  if(!Array.isArray(s.history)||!s.history.every(h=>h&&typeof h==='object'&&Number.isInteger(h.playerIdx)
    &&h.playerIdx>=0&&h.playerIdx<P.length&&Array.isArray(h.entries)&&h.entries.every(e=>e&&_isNum(e.delta))))return false;
  if(!_isNum(s.startPoints))return false;
  if(!IS_PRO){
    if(P.length<LIGHT_MIN_PLAYERS||P.length>LIGHT_MAX_PLAYERS)return false;
    if(!['win','elim'].includes(s.objectifMode))return false;
    if(s.singleWinner||s.lastLoser)return false;
  }
  return true;
}
// Renvoie true si la partie a été reprise, false sinon (l'init normale continue)
function restoreGame(){
  const s=readJSON('save',null);
  if(!s||!isValidSave(s)){
    discardSave(); // sauvegarde absente, corrompue ou hors limites de cette app
    return false;
  }
  try{
    players=s.players;seatOrder=s.seatOrder;history=s.history;actionCounter=_isNum(s.actionCounter)?s.actionCounter:0;
    numPlayers=s.players.length;startPoints=s.startPoints;
    maxPoints=_isNum(s.maxPoints)?s.maxPoints:Infinity;
    allowNeg=s.allowNeg||false;
    elimPoints=_isNum(s.elimPoints)?s.elimPoints:null;winPoints=_isNum(s.winPoints)?s.winPoints:null;objectifMode=s.objectifMode||'none';
    bloquerMode=s.bloquerMode||'none';rankCounter=_isNum(s.rankCounter)?s.rankCounter:0;
    singleWinner=s.singleWinner||false; lastLoser=s.lastLoser||false;
    if(s.lastGameConfig&&typeof s.lastGameConfig==='object')lastGameConfig=s.lastGameConfig;
    undoStack=[];groupTimers={};
    document.getElementById('undo-btn').disabled=true;
    document.getElementById('restore-banner').classList.add('hidden');
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.getElementById('game-screen').style.display='flex';
    renderGame();
    return true;
  }catch(e){
    console.warn('Restauration impossible',e);
    discardSave();
    document.getElementById('game-screen').style.display='none';
    showPage('setup-page');
    return false;
  }
}
function discardSave(){
  store.del('save');
  document.getElementById('restore-banner').classList.add('hidden');
}

// ── PAGES ─────────────────────────────────────────────────────────
function showPage(id){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById(id).classList.add('active');}
function showSetup(){showPage('setup-page');}
function showSettings(){renderThemeGrid();showPage('settings-page');}
let _themeOrigin='setup';
function showThemeFromSetup(){_themeOrigin='setup';renderThemeGrid();showPage('settings-page');}
function showThemeFromGame(){_themeOrigin='game';renderThemeGrid();document.getElementById('game-screen').style.display='none';showPage('settings-page');}
function backFromTheme(){
  if(_themeOrigin==='game'){document.getElementById('game-screen').style.display='flex';showPage('game-screen');fixLateral();setTimeout(fitTexts,50);}
  else showPage('setup-page');
}
function showPrivacy(){_privacyOrigin=document.querySelector('.page.active')?.id||'settings-page';showPage('privacy-modal');}
function acceptPrivacy(){
  store.set('privacy','1');
  document.getElementById('btn-privacy-accept').classList.add('hidden');
  document.getElementById('privacy-back-btn').classList.remove('hidden');
  document.getElementById('privacy-s5-section').classList.remove('hidden');
  closePrivacy();
}
function checkFirstLaunch(){
  if(!store.get('privacy')){
    _privacyOrigin='setup-page';
    document.getElementById('privacy-back-btn').classList.add('hidden');
    document.getElementById('btn-privacy-accept').classList.remove('hidden');
    document.getElementById('privacy-s5-section').classList.add('hidden');
    showPage('privacy-modal');
  }
}
let _privacyOrigin='settings-page';
function closePrivacy(){showPage(_privacyOrigin);}
function clearAllData(){
  if(!confirm(t('confirmClearData')))return;
  clearAppStorage();
  // Réglages en mémoire remis aux valeurs par défaut (la page reste cohérente)
  settings={...SETTINGS_DEFAULT,theme:'cyber',lang:currentLang};
  lastGameConfig=null;
  closePrivacy();
  confirmReset();
}

// ── PRÉRÉGLAGES ───────────────────────────────────────────────────
function renderPresets(){
  const g=document.getElementById('presets-grid');g.innerHTML='';
  GAME_PRESETS.forEach((p,idx)=>{
    const c=document.createElement('div');
    c.className='preset-card'+(idx===selectedPresetIdx?' on':'');_a11yBtn(c);
    c.innerHTML=`<div class="preset-card-name">${t(p.nameKey)}</div><div class="preset-card-detail">${t(p.detailKey)}</div>`;
    if(!IS_PRO && p.nameKey!=='presetLdm'){
      c.classList.add('lk-disabled');
      c.classList.add('lk-locked');
      c.onclick=(e)=>{e.stopPropagation();_spop();};
      c.ontouchstart=(e)=>{const t=e.touches[0];c._lkTx=t.clientX;c._lkTy=t.clientY;};
      c.ontouchend=(e)=>{const t=e.changedTouches[0];const dx=Math.abs(t.clientX-(c._lkTx||0));const dy=Math.abs(t.clientY-(c._lkTy||0));if(dx<10&&dy<10){e.preventDefault();e.stopPropagation();_spop();}};
    } else {
      c.onclick=()=>applyPreset(idx);
    }
    g.appendChild(c);
  });
}

// ── THÈMES ────────────────────────────────────────────────────────
function renderThemeGrid(){
  const g=document.getElementById('themes-grid');g.innerHTML='';
  THEMES.forEach(th=>{
    const card=document.createElement('div');
    card.className='theme-card'+(selectedTheme===th.id?' selected':'');_a11yBtn(card);
    card.style.background=th.bg;
    card.innerHTML=`<div class="theme-check">✓</div><div class="theme-card-name" style="color:${th.a}">${t(th.nameKey)}</div><div class="theme-swatches"><div class="theme-swatch" style="background:${th.a};box-shadow:0 0 6px ${th.a}"></div><div class="theme-swatch" style="background:${th.b};box-shadow:0 0 6px ${th.b}"></div><div class="theme-swatch" style="background:${th.bg};border:1px solid ${th.a}44"></div></div>`;
    if(!IS_PRO && th.id!=='cyber'){
      card.classList.add('lk-disabled');
      card.classList.add('lk-locked');
      card.onclick=(e)=>{e.stopPropagation();_spop();};
      card.ontouchstart=(e)=>{const t=e.touches[0];card._lkTx=t.clientX;card._lkTy=t.clientY;};
      card.ontouchend=(e)=>{const t=e.changedTouches[0];const dx=Math.abs(t.clientX-(card._lkTx||0));const dy=Math.abs(t.clientY-(card._lkTy||0));if(dx<10&&dy<10){e.preventDefault();e.stopPropagation();_spop();}};
    } else {
      card.onclick=()=>{
        document.querySelectorAll('.theme-card').forEach(c=>c.classList.remove('selected'));
        card.classList.add('selected');selectedTheme=th.id;applyTheme(th.id);
        settings.theme=th.id;
        saveSettings();
      };
    }
    g.appendChild(card);
  });
}


// ── SETUP ─────────────────────────────────────────────────────────
function selectPlayer(n){numPlayers=n;document.querySelectorAll('#players-grid .player-chip').forEach(c=>{c.classList.toggle('on',parseInt(c.textContent)===n);});checkGoBtn();}
function selectStartPreset(v){
  startPoints=v;
  const known=[0,10,20,40,50,100];
  const chip=document.querySelector(`#start-presets .points-chip[data-val="${v}"]`);
  document.querySelectorAll('#start-presets .points-chip').forEach(c=>c.classList.remove('on'));
  if(chip){chip.classList.add('on');document.getElementById('points-custom').value='';}
  else{document.getElementById('points-custom').value=v>0?v:'';}
  checkGoBtn();
}
function selectObjectifPreset(val){
  document.querySelectorAll('#objectif-presets .points-chip').forEach(c=>{
    c.classList.toggle('on', parseInt(c.dataset.oval)===val);
  });
  document.getElementById('objectif-custom').value='';
  checkGoBtn();
}
function selectBloquer(mode){ bloquerMode=mode; } // UI supprimée

// ── OBJECTIF ──────────────────────────────────────────────────────
function selectObjectif(mode){
  objectifMode=mode;
  ['none','elim','win'].forEach(m=>{
    document.getElementById('obj-'+m).classList.toggle('on',m===mode);
  });
  const inp=document.getElementById('objectif-input');
  const custom=document.getElementById('objectif-custom');
  const chips=document.querySelectorAll('#objectif-presets .points-chip');
  if(mode==='none'){
    elimPoints=null;winPoints=null;maxPoints=Infinity;allowNeg=false;
    chips.forEach(c=>{c.classList.remove('on');if(!c._lkDone){c.style.pointerEvents='none';c.style.opacity='0.25';}});
    custom.value='';custom.disabled=true;custom.placeholder='—';
  } else {
    chips.forEach(c=>{if(!c._lkDone){c.style.pointerEvents='';c.style.opacity='';}});
    custom.disabled=false;
    // Activer 0 par défaut seulement si aucun bouton n'est déjà actif
    const alreadyOn=[...chips].find(c=>c.classList.contains('on'));
    if(!alreadyOn&&!custom.value){
      const chip0=document.querySelector('#objectif-presets .points-chip[data-oval="0"]');
      if(chip0)chip0.classList.add('on');
      custom.value='';
    }
    custom.placeholder=t('placeholderOther')||'…';
  }
  checkGoBtn();
  const wo=document.getElementById('win-options');
  if(wo) wo.style.display=mode==='win'?'flex':'none';
  updateWinOptionsUI();
}

function updateWinOptionsUI(){
  const ts=document.getElementById('toggle-single-winner');
  const tl=document.getElementById('toggle-last-loser');
  const rl=document.getElementById('row-last-loser');
  if(!ts||!tl) return;
  ts.classList.toggle('on', singleWinner);
  tl.classList.toggle('on', lastLoser);
  if(rl) rl.classList.toggle('disabled', singleWinner);
  const rs=document.getElementById('row-single-winner');
  if(rs) rs.setAttribute('aria-checked', singleWinner?'true':'false');
  if(rl){ rl.setAttribute('aria-checked', lastLoser?'true':'false'); rl.setAttribute('aria-disabled', singleWinner?'true':'false'); }
}

function toggleSingleWinner(){
  selectedPresetIdx=-1;document.querySelectorAll('.preset-card').forEach(c=>c.classList.remove('on'));
  singleWinner=!singleWinner;
  if(singleWinner) lastLoser=false; // incompatible
  updateWinOptionsUI();
}

function toggleLastLoser(){
  selectedPresetIdx=-1;document.querySelectorAll('.preset-card').forEach(c=>c.classList.remove('on'));
  lastLoser=!lastLoser;
  if(lastLoser) singleWinner=false; // incompatible
  updateWinOptionsUI();
}

function getObjectifVal(){
  const custom=document.getElementById('objectif-custom');
  if(custom.value!==''){
    const v=parseInt(custom.value);
    return isNaN(v)?null:v;
  }
  const activeChip=document.querySelector('#objectif-presets .points-chip.on');
  if(activeChip)return parseInt(activeChip.dataset.oval);
  return null;
}
function applyObjectif(){
  elimPoints=null;winPoints=null;maxPoints=Infinity;allowNeg=false;
  if(bloquerMode==='min'){allowNeg=false;}
  if(bloquerMode==='max'){maxPoints=startPoints;}
  if(objectifMode==='none')return;
  const val=getObjectifVal();if(val===null)return;
  if(objectifMode==='elim'){
    elimPoints=val;
    if(val<0)allowNeg=true;
  } else {
    winPoints=val;
    if(val!==null && val>startPoints) maxPoints=val; // seulement si montée
  }
}
function setObjectifFromPreset(mode,val){
  objectifMode=mode;
  ['none','elim','win'].forEach(m=>{
    document.getElementById('obj-'+m).classList.toggle('on',m===mode);
  });
  // Réinitialiser toutes les chips de valeur
  document.querySelectorAll('#objectif-presets .points-chip').forEach(c=>c.classList.remove('on'));
  // Toujours réactiver les chips et le champ
  document.querySelectorAll('#objectif-presets .points-chip').forEach(c=>{
    c.classList.remove('on');if(!c._lkDone){c.style.pointerEvents='';c.style.opacity='';}
  });
  const custom=document.getElementById('objectif-custom');
  custom.disabled=false;
  if(mode==='none'){
    custom.value='';custom.placeholder=t('placeholderOther')||'…';
  } else {
    custom.placeholder=t('placeholderOther')||'…';
    if(val!==null&&val!==undefined){
      const chip=document.querySelector(`#objectif-presets .points-chip[data-oval="${val}"]`);
      if(chip){
        chip.classList.add('on');
        custom.value=''; // chip active → champ vide
      } else {
        custom.value=val;
      }
    }
  }
  const wo=document.getElementById('win-options');
  if(wo) wo.style.display=mode==='win'?'flex':'none';
  updateWinOptionsUI();
}


function checkGoBtn(){
  const objOk=objectifMode==='none'||getObjectifVal()!==null;
  const ok=numPlayers>=1&&startPoints>=0&&objOk;
  const btn=document.getElementById('go-btn');
  btn.disabled=!ok;
  if(ok){
    let label=`${t('btnNext')} (${numPlayers}j · ${fmtNum(startPoints)}pts`;
    if(objectifMode!=='none'&&getObjectifVal()!==null)label+=` · ${objectifMode==='elim'?t('btnElim'):t('btnWin')} ${fmtNum(getObjectifVal())}`;
    btn.textContent=label+')';
  } else {btn.textContent=t('btnNext');}
}

// ── PROFILS JOUEURS ───────────────────────────────────────────────
function loadProfiles(){
  const v=readJSON('profiles',[]);
  return Array.isArray(v)?v.filter(n=>typeof n==='string'&&n.trim()):[];
}
function saveProfiles(){
  const inputs=document.querySelectorAll('.name-input');
  const names=Array.from(inputs).map(i=>i.value.trim()).filter(Boolean);
  if(!names.length)return;
  let profiles=loadProfiles();
  // Ajouter chaque nom unique
  names.forEach(n=>{if(!profiles.includes(n))profiles.push(n);});
  if(profiles.length>30)profiles=profiles.slice(-30);
  store.set('profiles',JSON.stringify(profiles));
  renderProfileChips();
}
function renderProfileChips(){
  const profiles=loadProfiles();
  const list=document.getElementById('profiles-list');
  list.innerHTML='';
  if(!profiles.length){list.classList.add('hidden');return;}
  list.classList.remove('hidden');
  profiles.forEach(name=>{
    // Aucun nom dans du HTML ni dans un onclick inline : textContent + addEventListener
    const chip=document.createElement('div');chip.className='profile-chip';
    const nm=document.createElement('button');nm.type='button';nm.className='profile-chip-name';nm.textContent=name;
    nm.addEventListener('click',e=>{e.stopPropagation();fillName(name);});
    const del=document.createElement('button');del.type='button';del.className='profile-chip-del';del.textContent='✕';
    del.setAttribute('aria-label',t('ariaDeleteProfile').replace('{n}',name));
    del.addEventListener('click',e=>{e.stopPropagation();deleteProfile(name);});
    chip.addEventListener('click',()=>fillName(name));
    chip.appendChild(nm);chip.appendChild(del);
    list.appendChild(chip);
  });
}
let _lastFocusedInput=null;
function fillName(name){
  const inputs=[...document.querySelectorAll('.name-input')];
  // Utiliser la dernière case explicitement cliquée/focalisée
  if(_lastFocusedInput&&inputs.includes(_lastFocusedInput)){
    _lastFocusedInput.value=name;
    _lastFocusedInput.focus();
    return;
  }
  // Sinon première case vide
  const empty=inputs.find(inp=>!inp.value.trim());
  if(empty){empty.value=name;empty.focus();}
}
function deleteProfile(name){
  let profiles=loadProfiles().filter(p=>p!==name);
  store.set('profiles',JSON.stringify(profiles));
  renderProfileChips();
}

// ── NAMES SCREEN ──────────────────────────────────────────────────
function showNamesScreen(){
  _lastFocusedInput=null;
  const list=document.getElementById('names-list');list.innerHTML='';
  const sw=window.innerWidth;
  let cardVisW;
  if(numPlayers<=2)      cardVisW=sw;
  else if(numPlayers<=6) cardVisW=sw/2;
  else                   cardVisW=sw/3;
  const rows=numPlayers<=2?numPlayers:numPlayers<=4?2:numPlayers<=6?3:numPlayers<=10?4:5;
  const cardVisH=(window.innerHeight-44-68)/rows;
  const isLateral=numPlayers>=3;
  const effectiveW=isLateral?Math.min(cardVisW,cardVisH):cardVisW;
  const fontSize=effectiveW*0.13*0.84;
  const charWidth=fontSize*0.62;
  const maxLen=Math.max(3,Math.min(10,Math.floor(effectiveW*0.84/charWidth)));

  for(let i=0;i<numPlayers;i++){
    const row=document.createElement('div');row.className='name-row';
    const av=document.createElement('div');av.className='name-avatar';av.style.background=pColor(i);av.style.borderColor=pColor(i);av.style.color='#111';
    av.setAttribute('aria-hidden','true');av.textContent=pShape(i)+(i+1);
    const inp=document.createElement('input');inp.className='name-input';inp.type='text';
    inp.setAttribute('aria-label',t('ariaPlayerName').replace('{n}',i+1));
    inp.placeholder=`${t("player")} ${i+1}`;inp.maxLength=maxLen;inp.autocomplete='off';
    inp.addEventListener('focus',()=>{_lastFocusedInput=inp;});
    inp.addEventListener('touchstart',()=>{_lastFocusedInput=inp;},{passive:true});
    row.appendChild(av);row.appendChild(inp);list.appendChild(row);
  }
  renderProfileChips();
  showPage('names-page');
}

function shufflePlayers(){
  const inputs=[...document.querySelectorAll('.name-input')];
  const vals=inputs.map(i=>i.value);
  for(let i=vals.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[vals[i],vals[j]]=[vals[j],vals[i]];}
  inputs.forEach((inp,i)=>inp.value=vals[i]);
}
function clearNames(){document.querySelectorAll('.name-input').forEach(i=>i.value='');}
function clearAll(){
  clearNames();
  clearSavedNames();
}
function clearSavedNames(){
  store.del('profiles');
  document.getElementById('profiles-list').innerHTML='';
  document.getElementById('profiles-list').classList.add('hidden');
}

// ── DÉMARRAGE PARTIE ──────────────────────────────────────────────
function startGame(){_hpop();
  bloquerMode='none'; // section gains/pertes supprimée
  applyObjectif();
  // Mémoriser les réglages de cette partie pour le reset + persistance
  lastGameConfig={numPlayers,startPoints,objectifMode,objectifVal:getObjectifVal(),bloquerMode,allowNeg,singleWinner,lastLoser};
  settings.lastGameConfig=lastGameConfig;
  saveSettings();
  const inputs=document.querySelectorAll('.name-input');
  players=Array.from({length:numPlayers},(_,i)=>({playerName:inputs[i]?.value.trim()||'',score:startPoints,eliminated:false}));
  seatOrder=players.map((_,i)=>i);undoStack=[];history=[];actionCounter=0;groupTimers={};elimPending=-1;rankCounter=0;
  window._pendingEndgame=null;
  document.getElementById('undo-btn').disabled=true;
  document.getElementById('restore-banner').classList.add('hidden');
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('game-screen').style.display='flex';
  
  renderGame();
  saveGame();
}

