import { _detectLang, _flashBtnLabel, _getFooterBtn, applyLang, currentLang, setCurrentLang, t, updateRestoreBtn } from './i18n';
import { playElimAnim, playWinAnim } from './animations';
import { diceRenderPreview, diceResetPreview, diceUpdateFab } from './dice-ui';
import { $, $opt, $$, $q, escapeHtml } from './dom';
import type { BloquerMode, CardRot, GameConfig, GamePreset, GameSave, HistoryGroup, ObjectifMode, Player, Settings, Theme, UndoSnapshot } from './types';

/** Overlay du modal de score : porte l'orientation courante et l'état de glissement. */
interface ScoreModalEl extends HTMLElement {
  _modalRot?: CardRot;
  _dragging?: boolean;
}

export const THEMES: Theme[]=[
  {id:'cyber',    nameKey:'themeCyberpunk',  bg:'#020d12',a:'#00ffe0',b:'#00bfff'},
  {id:'cyber-light',nameKey:'themeCyberpunkLight', bg:'#e3f6f4',a:'#00a38f',b:'#007aa3'},
  {id:'dark',     nameKey:'themeDark',       bg:'#0a0a0f',a:'#6c63ff',b:'#a78bfa'},
  {id:'dark-light',nameKey:'themeDarkLight', bg:'#e4e3f6',a:'#0900a3',b:'#2900a3'},
  {id:'neon-pink',nameKey:'themeNeonPink',   bg:'#0d0010',a:'#ff00cc',b:'#cc00ff'},
  {id:'neon-pink-light',nameKey:'themeNeonPinkLight', bg:'#f6e3f3',a:'#a30082',b:'#8200a3'},
  {id:'arcade',   nameKey:'themeArcade',     bg:'#0a0800',a:'#ffdc00',b:'#ff8800'},
  {id:'arcade-light',nameKey:'themeArcadeLight', bg:'#f6f4e3',a:'#a38c00',b:'#a35700'},
  {id:'nature',   nameKey:'themeNature',     bg:'#051208',a:'#50c850',b:'#88dd44'},
  {id:'nature-light',nameKey:'themeNatureLight', bg:'#e3f6e3',a:'#228022',b:'#4a8f13'},
  {id:'sunset',   nameKey:'themeSunset',     bg:'#120508',a:'#ff6040',b:'#ffaa00'},
  {id:'sunset-light',nameKey:'themeSunsetLight', bg:'#f6e6e3',a:'#a31b00',b:'#a36c00'},
  {id:'ocean',    nameKey:'themeOcean',      bg:'#020810',a:'#0096ff',b:'#00ccff'},
  {id:'ocean-light',nameKey:'themeOceanLight', bg:'#dbeeff',a:'#0a4a78',b:'#0a6090'},
  {id:'gold',     nameKey:'themeGold',       bg:'#0a0800',a:'#ddb800',b:'#ffee44'},
  {id:'gold-light',nameKey:'themeGoldLight', bg:'#f6f3e3',a:'#a38700',b:'#a39400'},
  {id:'sobre',    nameKey:'themeSobre',      bg:'#1c1c1e',a:'#e8e8e8',b:'#a0a0a0'},
  {id:'light',    nameKey:'themeLight',      bg:'#f0f4ff',a:'#3355cc',b:'#5577ee'},
  {id:'mono',     nameKey:'themeMono',       bg:'#080808',a:'#ffffff', b:'#aaaaaa'},
  {id:'mono-light',nameKey:'themeMonoLight', bg:'#ffffff', a:'#000000',b:'#444444'},
  {id:'ldm',      nameKey:'themeLdmNight',   bg:'#2e2418',a:'#f0c040',b:'#ffe070'},
  {id:'ldm-day',  nameKey:'themeLdmDay',     bg:'#f5f0e8',a:'#7a5500',b:'#9e7000'},
];

// Palette Paul Tol — daltonien-safe
export const COLORS=[
  '#4477AA','#EE6677','#CCBB44','#AA3377','#228833','#66CCEE',
  '#BBBBBB','#EE7733','#0077BB','#EE3377','#44AA99','#DDCC77',
];

// Préréglages de jeux
export const GAME_PRESETS: GamePreset[]=[
  {nameKey:'presetLdm',   detailKey:'presetLdmDetail',
   players:6, start:40, objectifMode:'elim', objectifVal:0, singleWinner:false, lastLoser:false},
  {nameKey:'presetPoker', detailKey:'presetPokerDetail',
   players:6, start:1000, objectifMode:'elim', objectifVal:0, singleWinner:false, lastLoser:false},
  {nameKey:'presetUno',   detailKey:'presetUnoDetail',
   players:4, start:0, objectifMode:'win',  objectifVal:500,  singleWinner:false, lastLoser:false},
  {nameKey:'presetBelote', detailKey:'presetBeloteDetail',
   players:2, start:0, objectifMode:'win', objectifVal:1000, singleWinner:false, lastLoser:true},
  {nameKey:'presetMagic', detailKey:'presetMagicDetail',
   players:4, start:20, objectifMode:'elim', objectifVal:0, singleWinner:false, lastLoser:false},
  {nameKey:'presetSkyjo', detailKey:'presetSkyjoDetail',
   players:4, start:0,objectifMode:'elim', objectifVal:100, allowNeg:true, singleWinner:false, lastLoser:false},
];

export let numPlayers=0,startPoints=0,maxPoints=Infinity,allowNeg=false;
export let elimPoints: number|null=null,winPoints: number|null=null,objectifMode: ObjectifMode='none';
export let bloquerMode: BloquerMode='none';
export let singleWinner=false, lastLoser=false;
export let rankCounter=0;
export let players: Player[]=[],seatOrder: number[]=[],undoStack: string[]=[],history: HistoryGroup[]=[],actionCounter=0,groupTimers: Record<number, ReturnType<typeof setTimeout>>={};
export const GROUP_DELAY=1500;
export let modalPlayerIdx=-1,modalValue='0',modalSign: 1|-1=1;
export let settings: Settings={theme:'cyber',defPlayers:0,defStart:0,defMax:0,defNeg:false,defObjectifMode:'none',defObjectifVal:null,defSaved:false};
export let selectedTheme='cyber',defPlayers=0,defStart=-1,defMax=0,defNeg=false;
export let elimPending=-1; // index joueur en attente de confirmation d'élimination
export let lastGameConfig: GameConfig|null=null; // réglages de la dernière partie lancée

// ── FORMATAGE ─────────────────────────────────────────────────────
export function fmtNum(n: number){
  if(Math.abs(n)<1000)return String(n);
  return n.toLocaleString('fr-FR');
}

// ── SETTINGS ──────────────────────────────────────────────────────
export function loadSettings(){
  const raw=localStorage.getItem('scoretrack_settings');
  const firstRun=!raw;
  try{const s=JSON.parse(raw||'{}');settings={...settings,...s};}catch(e){}

  if(firstRun){
    // Première ouverture : thème Dark + preset Loi du Milieu
    settings.theme='dark';
    applyTheme('dark');selectedTheme='dark';
  } else {
    applyTheme(settings.theme||'dark');
    selectedTheme=settings.theme||'dark';
  }

  // Langue persistée
  setCurrentLang(settings.lang || _detectLang());
  applyLang(currentLang);
  checkFirstLaunch();

  defPlayers=settings.defPlayers||0;
  defStart=settings.defStart>=0?settings.defStart:-1;
  defMax=settings.defMax||0;
  defNeg=settings.defNeg||false;
  // Rétro-compatibilité : déduire defSaved si absent
  if(!settings.defSaved && (settings.defPlayers>0||settings.defMax>0||(settings.defObjectifMode&&settings.defObjectifMode!=='none'))){
    settings.defSaved=true;
  }

  if(localStorage.getItem('scoretrack_save')){
    restoreGame(); return; // reprendre la partie en cours
  }
  applyDefaults(firstRun);
  updateRestoreBtn();
}
export function applyDefaults(firstRun: boolean){
  if(firstRun||!settings.lastGameConfig){
    selectedPresetIdx=0;
    const ldmIdx=GAME_PRESETS.findIndex(p=>p.nameKey==='presetLdm');
    applyPreset(ldmIdx>=0?ldmIdx:0);
  } else {
    const c=settings.lastGameConfig;
    selectPlayer(c.numPlayers);
    selectStartPreset(c.startPoints);
      allowNeg=c.allowNeg||false;
    singleWinner=c.singleWinner||false;
    lastLoser=c.lastLoser||false;
    setObjectifFromPreset(c.objectifMode||'none',c.objectifVal??null);
    selectedPresetIdx=-1;
  }
  renderPresets(); // toujours re-render ici, selectedPresetIdx est fixé
}
// Applique un preset par index et le marque visuellement
export let selectedPresetIdx = -1;
export function applyPreset(idx: number){
  const p=GAME_PRESETS[idx];if(!p)return;
  selectedPresetIdx = idx;
  $$<HTMLElement>('.preset-card').forEach(c=>c.classList.remove('on'));
  const cards=$$<HTMLElement>('.preset-card');
  if(cards[idx])cards[idx].classList.add('on');
  selectPlayer(p.players);
  selectStartPreset(p.start);
  allowNeg=p.allowNeg||false;
  singleWinner=p.singleWinner||false;
  lastLoser=p.lastLoser||false;
  selectObjectif(p.objectifMode||'none');
  setObjectifFromPreset(p.objectifMode||'none',p.objectifVal??null);
  updateWinOptionsUI(); // après selectObjectif pour garantir l'UI correcte
  checkGoBtn();
}
// Marque le preset card si les réglages actuels correspondent
export function highlightMatchingPreset(){
  const currentVal=getObjectifVal();
  $$<HTMLElement>('.preset-card').forEach((card,idx)=>{
    const p=GAME_PRESETS[idx];if(!p)return;
    const match=p.players===numPlayers&&p.start===startPoints&&
      (p.objectifMode||'none')===objectifMode&&
      (p.objectifVal??null)===currentVal&&
      (p.singleWinner||false)===singleWinner&&
      (p.lastLoser||false)===lastLoser;
    card.classList.toggle('on',match);
  });
}
export function applyTheme(id: string){
  document.documentElement.setAttribute('data-theme',id==='cyber'?'':id);
  selectedTheme=id;
  // couleur de la barre d'état = fond du thème (source unique : THEMES)
  const c=THEMES.find(th=>th.id===id)?.bg||'#020d12';
  const m=$opt<HTMLMetaElement>('meta-theme-color');if(m)m.content=c;
  // met à jour les couleurs des dés si le lanceur est ouvert (elles sont cuites dans
  // les matériaux 3D à la construction -> il faut reconstruire).
  try{
    var ov=$opt('dice-overlay');
    if(ov && !ov.classList.contains('hidden') && typeof diceRenderPreview==='function'){
      diceResetPreview();
    }
  }catch(e){}
}
export function restoreSavedDefaults(e: Event){
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
export function clearSavedDefaults(e: Event){
  if(!settings.defSaved)return;
  settings={...settings,defPlayers:0,defStart:0,defMax:0,defNeg:false,defObjectifMode:'none',defObjectifVal:null,defSingleWinner:false,defLastLoser:false,defSaved:false};
  defPlayers=0;defStart=0;defMax=0;defNeg=false;
  try{localStorage.setItem('scoretrack_settings',JSON.stringify(settings));}catch(err){}
  updateRestoreBtn();
  _flashBtnLabel(_getFooterBtn(e),t('cleared')||'✓ Effacé',1500);
}
export function saveAsDefault(e?: Event){
  settings={...settings,defPlayers:numPlayers||0,defStart:startPoints>=0?startPoints:0,defMax:maxPoints===Infinity?0:maxPoints,defNeg:allowNeg,defObjectifMode:objectifMode||'none',defObjectifVal:getObjectifVal(),defSingleWinner:singleWinner||false,defLastLoser:lastLoser||false,defSaved:true};
  try{localStorage.setItem('scoretrack_settings',JSON.stringify(settings));}catch(e2){}
  defPlayers=settings.defPlayers;defStart=settings.defStart;defMax=settings.defMax;defNeg=settings.defNeg;
  // Flash confirmation
  updateRestoreBtn();
  // Flash léger sur l'emoji save uniquement
  const _sb=$opt('btn-savedefault');
  if(_sb){const _em=_sb.querySelector('.btn-emoji');if(_em){const _eo=_em.innerHTML;_em.innerHTML='✓';setTimeout(()=>_em.innerHTML=_eo,1200);}}
}

// ── SAUVEGARDE DE PARTIE ──────────────────────────────────────────
export function saveGame(){
  try{
    localStorage.setItem('scoretrack_save',JSON.stringify({
      players,seatOrder,history,actionCounter,
      numPlayers,startPoints,maxPoints:maxPoints===Infinity?null:maxPoints,allowNeg,
      saveVersion:33,
      elimPoints,winPoints,objectifMode,bloquerMode,rankCounter,singleWinner,lastLoser,
      lastGameConfig,
      ts:Date.now()
    }));
  }catch(e){}
}
export function restoreGame(){
  try{
    const s: GameSave|null=JSON.parse(localStorage.getItem('scoretrack_save') as string);
    if(!s)return;
    // Version 3.3 : vérifier la version du save
    if((s.saveVersion||0) < 33){
      discardSave(); return;
    }
    players=s.players;seatOrder=s.seatOrder;history=s.history;actionCounter=s.actionCounter;
    numPlayers=s.numPlayers;startPoints=s.startPoints;
    maxPoints=s.maxPoints===null?Infinity:s.maxPoints;
    allowNeg=s.allowNeg||false;
    elimPoints=s.elimPoints??null;winPoints=s.winPoints??null;objectifMode=s.objectifMode||'none';
    bloquerMode=s.bloquerMode||'none';rankCounter=s.rankCounter||0;
    singleWinner=s.singleWinner||false; lastLoser=s.lastLoser||false;
    if(s.lastGameConfig)lastGameConfig=s.lastGameConfig;
    undoStack=[];groupTimers={};
    $('restore-banner').classList.add('hidden');
    $$<HTMLElement>('.page').forEach(p=>p.classList.remove('active'));
    $('game-screen').style.display='flex';if(typeof diceUpdateFab==='function')diceUpdateFab();
    renderGame();
  }catch(e){discardSave();}
}
export function discardSave(){
  localStorage.removeItem('scoretrack_save');
  $('restore-banner').classList.add('hidden');
}

// ── PAGES ─────────────────────────────────────────────────────────
export function showPage(id: string){$$<HTMLElement>('.page').forEach(p=>p.classList.remove('active'));$(id).classList.add('active');}
export function showSetup(){showPage('setup-page');}
export function showSettings(){renderThemeGrid();showPage('settings-page');}
export let _themeOrigin: 'setup'|'game'='setup';
export function showThemeFromSetup(){_themeOrigin='setup';renderThemeGrid();showPage('settings-page');}
export function showThemeFromGame(){_themeOrigin='game';renderThemeGrid();$('game-screen').style.display='none';if(typeof diceUpdateFab==='function')diceUpdateFab();showPage('settings-page');}
export function backFromTheme(){
  if(_themeOrigin==='game'){$('game-screen').style.display='flex';if(typeof diceUpdateFab==='function')diceUpdateFab();showPage('game-screen');fixLateral();setTimeout(fitTexts,50);}
  else showPage('setup-page');
}
export function showPrivacy(){_privacyOrigin=$q('.page.active')?.id||'settings-page';showPage('privacy-modal');}
export function acceptPrivacy(){
  localStorage.setItem('st_privacy_accepted','1');
  $('btn-privacy-accept').classList.add('hidden');
  $('privacy-back-btn').classList.remove('hidden');
  $('privacy-s5-section').classList.remove('hidden');
  closePrivacy();
}
export function checkFirstLaunch(){
  if(!localStorage.getItem('st_privacy_accepted')){
    _privacyOrigin='setup-page';
    $('privacy-back-btn').classList.add('hidden');
    $('btn-privacy-accept').classList.remove('hidden');
    $('privacy-s5-section').classList.add('hidden');
    showPage('privacy-modal');
  }
}
export let _privacyOrigin='settings-page';
export function closePrivacy(){showPage(_privacyOrigin);}
export function clearAllData(){
  localStorage.clear();
  closePrivacy();
  confirmReset();
}

// ── PRÉRÉGLAGES ───────────────────────────────────────────────────
export function renderPresets(){
  const g=$('presets-grid');g.innerHTML='';
  GAME_PRESETS.forEach((p,idx)=>{
    const c=document.createElement('div');
    c.className='preset-card'+(idx===selectedPresetIdx?' on':'');
    c.innerHTML=`<div class="preset-card-name">${t(p.nameKey)}</div><div class="preset-card-detail">${t(p.detailKey)}</div>`;
    c.onclick=()=>applyPreset(idx);
    g.appendChild(c);
  });
}

// ── THÈMES ────────────────────────────────────────────────────────
export function renderThemeGrid(){
  const g=$('themes-grid');g.innerHTML='';
  THEMES.forEach(th=>{
    const card=document.createElement('div');
    card.className='theme-card'+(selectedTheme===th.id?' selected':'');
    card.style.background=th.bg;
    card.innerHTML=`<div class="theme-check">✓</div><div class="theme-card-name" style="color:${th.a}">${t(th.nameKey)}</div><div class="theme-swatches"><div class="theme-swatch" style="background:${th.a};box-shadow:0 0 6px ${th.a}"></div><div class="theme-swatch" style="background:${th.b};box-shadow:0 0 6px ${th.b}"></div><div class="theme-swatch" style="background:${th.bg};border:1px solid ${th.a}44"></div></div>`;
    card.onclick=()=>{
      $$<HTMLElement>('.theme-card').forEach(c=>c.classList.remove('selected'));
      card.classList.add('selected');selectedTheme=th.id;applyTheme(th.id);
      applyScreenMaterial(th.id);
      settings.theme=th.id;
      try{localStorage.setItem('scoretrack_settings',JSON.stringify(settings));}catch(e){}
    };
    g.appendChild(card);
  });
  applyScreenMaterial(selectedTheme);
}

// Applique au fond de l'ecran selecteur la matiere du theme donne.
// On lit les variables --mat/--mat-blend/--mat-op deja definies par [data-theme]
// via un element temporaire, sans redeclarer les data-uri.
export function applyScreenMaterial(themeId: string){
  const screen=$opt('theme-mat-screen');
  if(!screen) return;
  const probe=document.createElement('div');
  probe.setAttribute('data-theme', themeId==='cyber'?'':themeId);
  probe.style.display='none';
  document.body.appendChild(probe);
  const cs=getComputedStyle(probe);
  const mat=cs.getPropertyValue('--mat').trim();
  const blend=cs.getPropertyValue('--mat-blend').trim()||'soft-light';
  const op=cs.getPropertyValue('--mat-op').trim()||'0';
  const bg=cs.getPropertyValue('--bg').trim();
  document.body.removeChild(probe);
  screen.style.setProperty('--screen-mat', mat||'none');
  screen.style.setProperty('--screen-mat-blend', blend);
  screen.style.setProperty('--screen-mat-op', (mat&&mat!=='none')?op:'0');
  // Le fond du sélecteur prend la couleur de fond du thème (clair/foncé)
  if(bg){ screen.style.backgroundColor = bg; }
}


// ── SETUP ─────────────────────────────────────────────────────────
export function selectPlayer(n: number){numPlayers=n;$$<HTMLElement>('#players-grid .player-chip').forEach(c=>{c.classList.toggle('on',parseInt(c.textContent!)===n);});checkGoBtn();}
export function selectStartPreset(v: number){
  startPoints=v;
  const chip=$q<HTMLElement>(`#start-presets .points-chip[data-val="${v}"]`);
  $$<HTMLElement>('#start-presets .points-chip').forEach(c=>c.classList.remove('on'));
  if(chip){chip.classList.add('on');$<HTMLInputElement>('points-custom').value='';}
  else{$<HTMLInputElement>('points-custom').value=v>0?String(v):'';}
  checkGoBtn();
}
export function selectObjectifPreset(val: number){
  $$<HTMLElement>('#objectif-presets .points-chip').forEach(c=>{
    c.classList.toggle('on', parseInt(c.dataset.oval!)===val);
  });
  $<HTMLInputElement>('objectif-custom').value='';
  checkGoBtn();
}
export function selectBloquer(mode: BloquerMode){ bloquerMode=mode; } // UI supprimée

// ── OBJECTIF ──────────────────────────────────────────────────────
export function selectObjectif(mode: ObjectifMode){
  objectifMode=mode;
  ['none','elim','win'].forEach(m=>{
    $('obj-'+m).classList.toggle('on',m===mode);
  });
  const custom=$<HTMLInputElement>('objectif-custom');
  const chips=$$<HTMLElement>('#objectif-presets .points-chip');
  if(mode==='none'){
    elimPoints=null;winPoints=null;maxPoints=Infinity;allowNeg=false;
    chips.forEach(c=>{c.classList.remove('on');c.style.pointerEvents='none';c.style.opacity='0.25';});
    custom.value='';custom.disabled=true;custom.placeholder='—';
  } else {
    chips.forEach(c=>{c.style.pointerEvents='';c.style.opacity='';});
    custom.disabled=false;
    // Activer 0 par défaut seulement si aucun bouton n'est déjà actif
    const alreadyOn=[...chips].find(c=>c.classList.contains('on'));
    if(!alreadyOn&&!custom.value){
      const chip0=$q<HTMLElement>('#objectif-presets .points-chip[data-oval="0"]');
      if(chip0)chip0.classList.add('on');
      custom.value='';
    }
    custom.placeholder=t('placeholderOther');
  }
  checkGoBtn();
  const wo=$opt('win-options');
  if(wo) wo.style.display=mode==='win'?'flex':'none';
  updateWinOptionsUI();
}

export function updateWinOptionsUI(){
  const ts=$opt('toggle-single-winner');
  const tl=$opt('toggle-last-loser');
  const rl=$opt('row-last-loser');
  if(!ts||!tl) return;
  ts.classList.toggle('on', singleWinner);
  tl.classList.toggle('on', lastLoser);
  if(rl) rl.classList.toggle('disabled', singleWinner);
}

export function toggleSingleWinner(){
  selectedPresetIdx=-1;$$<HTMLElement>('.preset-card').forEach(c=>c.classList.remove('on'));
  singleWinner=!singleWinner;
  if(singleWinner) lastLoser=false; // incompatible
  updateWinOptionsUI();
}

export function toggleLastLoser(){
  selectedPresetIdx=-1;$$<HTMLElement>('.preset-card').forEach(c=>c.classList.remove('on'));
  lastLoser=!lastLoser;
  if(lastLoser) singleWinner=false; // incompatible
  updateWinOptionsUI();
}

export function getObjectifVal(): number|null{
  const custom=$<HTMLInputElement>('objectif-custom');
  if(custom.value!==''){
    const v=parseInt(custom.value);
    return isNaN(v)?null:v;
  }
  const activeChip=$q<HTMLElement>('#objectif-presets .points-chip.on');
  if(activeChip)return parseInt(activeChip.dataset.oval!);
  return null;
}
export function applyObjectif(){
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
export function setObjectifFromPreset(mode: ObjectifMode,val: number|null|undefined){
  objectifMode=mode;
  ['none','elim','win'].forEach(m=>{
    $('obj-'+m).classList.toggle('on',m===mode);
  });
  // Réinitialiser toutes les chips de valeur
  $$<HTMLElement>('#objectif-presets .points-chip').forEach(c=>c.classList.remove('on'));
  // Toujours réactiver les chips et le champ
  $$<HTMLElement>('#objectif-presets .points-chip').forEach(c=>{
    c.classList.remove('on');c.style.pointerEvents='';c.style.opacity='';
  });
  const custom=$<HTMLInputElement>('objectif-custom');
  custom.disabled=false;
  if(mode==='none'){
    custom.value='';custom.placeholder=t('placeholderOther');
  } else {
    custom.placeholder=t('placeholderOther');
    if(val!==null&&val!==undefined){
      const chip=$q<HTMLElement>(`#objectif-presets .points-chip[data-oval="${val}"]`);
      if(chip){
        chip.classList.add('on');
        custom.value=''; // chip active → champ vide
      } else {
        custom.value=String(val);
      }
    }
  }
  const wo=$opt('win-options');
  if(wo) wo.style.display=mode==='win'?'flex':'none';
  updateWinOptionsUI();
}


export function checkGoBtn(){
  const objOk=objectifMode==='none'||getObjectifVal()!==null;
  const ok=numPlayers>=1&&startPoints>=0&&objOk;
  const btn=$<HTMLButtonElement>('go-btn');
  btn.disabled=!ok;
  if(ok){
    let label=`${t('btnNext')} (${numPlayers}j · ${fmtNum(startPoints)}pts`;
    if(objectifMode!=='none'&&getObjectifVal()!==null)label+=` · ${objectifMode==='elim'?t('btnElim'):t('btnWin')} ${fmtNum(getObjectifVal() as number)}`;
    btn.textContent=label+')';
  } else {btn.textContent=t('btnNext');}
}

// ── PROFILS JOUEURS ───────────────────────────────────────────────
export function loadProfiles(): string[]{
  try{return JSON.parse(localStorage.getItem('scoretrack_profiles')||'[]');}catch(e){return[];}
}
export function saveProfiles(){
  const inputs=$$<HTMLInputElement>('.name-input');
  const names=Array.from(inputs).map(i=>i.value.trim()).filter(Boolean);
  if(!names.length)return;
  let profiles=loadProfiles();
  // Ajouter chaque nom unique
  names.forEach(n=>{if(!profiles.includes(n))profiles.push(n);});
  if(profiles.length>30)profiles=profiles.slice(-30);
  localStorage.setItem('scoretrack_profiles',JSON.stringify(profiles));
  renderProfileChips();
}
export function renderProfileChips(){
  const profiles=loadProfiles();
  const list=$('profiles-list');
  list.innerHTML='';
  if(!profiles.length){list.classList.add('hidden');return;}
  list.classList.remove('hidden');
  profiles.forEach(name=>{
    // Construction par DOM (pas d'innerHTML) : le nom du joueur est une donnée
    // utilisateur arbitraire, jamais interpolée dans du HTML ou dans un attribut
    // onclick — voir docs/audit/DECISIONS-B.md (correctif de l'injection P0).
    const chip=document.createElement('div');chip.className='profile-chip';
    const label=document.createElement('span');label.textContent=name;
    const del=document.createElement('span');del.className='profile-chip-del';del.textContent='✕';
    del.addEventListener('click',e=>{e.stopPropagation();deleteProfile(name);});
    chip.appendChild(label);chip.appendChild(del);
    chip.onclick=()=>fillName(name);
    list.appendChild(chip);
  });
}
export let _lastFocusedInput: HTMLInputElement|null=null;
export function fillName(name: string){
  const inputs=[...$$<HTMLInputElement>('.name-input')];
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
export function deleteProfile(name: string){
  const profiles=loadProfiles().filter(p=>p!==name);
  localStorage.setItem('scoretrack_profiles',JSON.stringify(profiles));
  renderProfileChips();
}

// ── NAMES SCREEN ──────────────────────────────────────────────────
export function showNamesScreen(){
  _lastFocusedInput=null;
  const list=$('names-list');list.innerHTML='';
  const sw=window.innerWidth;
  let cardVisW: number;
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
    const av=document.createElement('div');av.className='name-avatar';av.style.color=COLORS[i%12];av.style.borderColor=COLORS[i%12];av.textContent=String(i+1);
    const inp=document.createElement('input');inp.className='name-input';inp.type='text';
    inp.placeholder=`${t("player")} ${i+1}`;inp.maxLength=maxLen;inp.autocomplete='off';
    inp.addEventListener('focus',()=>{_lastFocusedInput=inp;});
    inp.addEventListener('touchstart',()=>{_lastFocusedInput=inp;},{passive:true});
    row.appendChild(av);row.appendChild(inp);list.appendChild(row);
  }
  renderProfileChips();
  showPage('names-page');
}

export function shufflePlayers(){
  const inputs=[...$$<HTMLInputElement>('.name-input')];
  const vals=inputs.map(i=>i.value);
  for(let i=vals.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[vals[i],vals[j]]=[vals[j],vals[i]];}
  inputs.forEach((inp,i)=>inp.value=vals[i]);
}
export function clearNames(){$$<HTMLInputElement>('.name-input').forEach(i=>i.value='');}
export function clearAll(){
  clearNames();
  clearSavedNames();
}
export function clearSavedNames(){
  localStorage.removeItem('scoretrack_profiles');
  $('profiles-list').innerHTML='';
  $('profiles-list').classList.add('hidden');
}

// ── DÉMARRAGE PARTIE ──────────────────────────────────────────────
export function startGame(){
  bloquerMode='none'; // section gains/pertes supprimée
  applyObjectif();
  // Mémoriser les réglages de cette partie pour le reset + persistance
  lastGameConfig={numPlayers,startPoints,objectifMode,objectifVal:getObjectifVal(),bloquerMode,allowNeg,singleWinner,lastLoser};
  settings.lastGameConfig=lastGameConfig;
  try{localStorage.setItem('scoretrack_settings',JSON.stringify(settings));}catch(e){}
  const inputs=$$<HTMLInputElement>('.name-input');
  players=Array.from({length:numPlayers},(_,i)=>({playerName:inputs[i]?.value.trim()||'',score:startPoints,eliminated:false}));
  seatOrder=players.map((_,i)=>i);undoStack=[];history=[];actionCounter=0;groupTimers={};elimPending=-1;rankCounter=0;
  $$<HTMLElement>('.page').forEach(p=>p.classList.remove('active'));
  $('game-screen').style.display='flex';if(typeof diceUpdateFab==='function')diceUpdateFab();
  
  renderGame();
  saveGame();
}

// ── RENDER ────────────────────────────────────────────────────────
/** Case de la grille des cartes : joueur i (−1 = case vide), rotation, colonne/ligne et étendue. */
interface Placement { i: number; rot?: CardRot; c: number; r: number; cs: number; rs: number; }
export function renderGame(){
  const wrap=$('players-wrap');
  wrap.innerHTML='';
  wrap.style.visibility='hidden';
  const n=players.length;
  const s=seatOrder;
  let cols: number,rows: number,placements: Placement[];

  switch(n){
    case 1:
      cols=1;rows=1;
      placements=[{i:s[0],rot:'rot-0',c:1,r:1,cs:1,rs:1}];
      break;
    case 2:
      cols=1;rows=2;
      placements=[
        {i:s[1],rot:'rot-180',c:1,r:1,cs:1,rs:1},
        {i:s[0],rot:'rot-0',  c:1,r:2,cs:1,rs:1},
      ];
      break;
    case 3:
      // J1=bas pleine largeur (1/3 hauteur), J2=gauche-haut, J3=droite-haut (2/3 hauteur)
      cols=2;rows=3;
      placements=[
        {i:s[1],rot:'rot-l',  c:1,r:1,cs:1,rs:2},  // J2 gauche, 2/3 hauteur
        {i:s[2],rot:'rot-r',  c:2,r:1,cs:1,rs:2},  // J3 droite, 2/3 hauteur
        {i:s[0],rot:'rot-0',  c:1,r:3,cs:2,rs:1},  // J1 bas pleine largeur
      ];
      break;
    case 4:
      cols=2;rows=2;
      placements=[
        {i:s[1],rot:'rot-l',c:1,r:1,cs:1,rs:1},
        {i:s[2],rot:'rot-r',c:2,r:1,cs:1,rs:1},
        {i:s[0],rot:'rot-l',c:1,r:2,cs:1,rs:1},
        {i:s[3],rot:'rot-r',c:2,r:2,cs:1,rs:1},
      ];
      break;
    case 5:
      cols=2;rows=3;
      placements=[
        {i:s[2],rot:'rot-l',c:1,r:1,cs:1,rs:1},
        {i:s[3],rot:'rot-r',c:2,r:1,cs:1,rs:1},
        {i:s[1],rot:'rot-l',c:1,r:2,cs:1,rs:1},
        {i:s[4],rot:'rot-r',c:2,r:2,cs:1,rs:1},
        {i:s[0],rot:'rot-0',c:1,r:3,cs:2,rs:1},
      ];
      break;
    case 6:
      cols=2;rows=3;
      placements=[
        {i:s[2],rot:'rot-l',c:1,r:1,cs:1,rs:1},
        {i:s[3],rot:'rot-r',c:2,r:1,cs:1,rs:1},
        {i:s[1],rot:'rot-l',c:1,r:2,cs:1,rs:1},
        {i:s[4],rot:'rot-r',c:2,r:2,cs:1,rs:1},
        {i:s[0],rot:'rot-l',c:1,r:3,cs:1,rs:1},
        {i:s[5],rot:'rot-r',c:2,r:3,cs:1,rs:1},
      ];
      break;
    case 7:
      cols=3;rows=3;
      placements=[
        {i:s[3],rot:'rot-l',c:1,r:1,cs:1,rs:1},{i:-1,c:2,r:1,cs:1,rs:1},{i:s[4],rot:'rot-r',c:3,r:1,cs:1,rs:1},
        {i:s[2],rot:'rot-l',c:1,r:2,cs:1,rs:1},{i:-1,c:2,r:2,cs:1,rs:1},{i:s[5],rot:'rot-r',c:3,r:2,cs:1,rs:1},
        {i:s[1],rot:'rot-l',c:1,r:3,cs:1,rs:1},{i:s[0],rot:'rot-0',c:2,r:3,cs:1,rs:1},{i:s[6],rot:'rot-r',c:3,r:3,cs:1,rs:1},
      ];
      break;
    case 8:
      cols=3;rows=3;
      placements=[
        {i:s[3],rot:'rot-l',c:1,r:1,cs:1,rs:1},{i:s[4],rot:'rot-180',c:2,r:1,cs:1,rs:1},{i:s[5],rot:'rot-r',c:3,r:1,cs:1,rs:1},
        {i:s[2],rot:'rot-l',c:1,r:2,cs:1,rs:1},{i:-1,c:2,r:2,cs:1,rs:1},{i:s[6],rot:'rot-r',c:3,r:2,cs:1,rs:1},
        {i:s[1],rot:'rot-l',c:1,r:3,cs:1,rs:1},{i:s[0],rot:'rot-0',c:2,r:3,cs:1,rs:1},{i:s[7],rot:'rot-r',c:3,r:3,cs:1,rs:1},
      ];
      break;
    case 9:
      cols=3;rows=4;
      placements=[
        {i:s[4],rot:'rot-l',c:1,r:1,cs:1,rs:1},{i:-1,c:2,r:1,cs:1,rs:1},{i:s[5],rot:'rot-r',c:3,r:1,cs:1,rs:1},
        {i:s[3],rot:'rot-l',c:1,r:2,cs:1,rs:1},{i:-1,c:2,r:2,cs:1,rs:1},{i:s[6],rot:'rot-r',c:3,r:2,cs:1,rs:1},
        {i:s[2],rot:'rot-l',c:1,r:3,cs:1,rs:1},{i:-1,c:2,r:3,cs:1,rs:1},{i:s[7],rot:'rot-r',c:3,r:3,cs:1,rs:1},
        {i:s[1],rot:'rot-l',c:1,r:4,cs:1,rs:1},{i:s[0],rot:'rot-0',c:2,r:4,cs:1,rs:1},{i:s[8],rot:'rot-r',c:3,r:4,cs:1,rs:1},
      ];
      break;
    case 10:
      cols=3;rows=4;
      placements=[
        {i:s[4],rot:'rot-l',c:1,r:1,cs:1,rs:1},{i:s[5],rot:'rot-180',c:2,r:1,cs:1,rs:1},{i:s[6],rot:'rot-r',c:3,r:1,cs:1,rs:1},
        {i:s[3],rot:'rot-l',c:1,r:2,cs:1,rs:1},{i:-1,c:2,r:2,cs:1,rs:1},{i:s[7],rot:'rot-r',c:3,r:2,cs:1,rs:1},
        {i:s[2],rot:'rot-l',c:1,r:3,cs:1,rs:1},{i:-1,c:2,r:3,cs:1,rs:1},{i:s[8],rot:'rot-r',c:3,r:3,cs:1,rs:1},
        {i:s[1],rot:'rot-l',c:1,r:4,cs:1,rs:1},{i:s[0],rot:'rot-0',c:2,r:4,cs:1,rs:1},{i:s[9],rot:'rot-r',c:3,r:4,cs:1,rs:1},
      ];
      break;
    case 11:
      cols=3;rows=5;
      placements=[
        {i:s[5],rot:'rot-l',c:1,r:1,cs:1,rs:1},{i:-1,c:2,r:1,cs:1,rs:1},{i:s[6],rot:'rot-r',c:3,r:1,cs:1,rs:1},
        {i:s[4],rot:'rot-l',c:1,r:2,cs:1,rs:1},{i:-1,c:2,r:2,cs:1,rs:1},{i:s[7],rot:'rot-r',c:3,r:2,cs:1,rs:1},
        {i:s[3],rot:'rot-l',c:1,r:3,cs:1,rs:1},{i:-1,c:2,r:3,cs:1,rs:1},{i:s[8],rot:'rot-r',c:3,r:3,cs:1,rs:1},
        {i:s[2],rot:'rot-l',c:1,r:4,cs:1,rs:1},{i:-1,c:2,r:4,cs:1,rs:1},{i:s[9],rot:'rot-r',c:3,r:4,cs:1,rs:1},
        {i:s[1],rot:'rot-l',c:1,r:5,cs:1,rs:1},{i:s[0],rot:'rot-0',c:2,r:5,cs:1,rs:1},{i:s[10],rot:'rot-r',c:3,r:5,cs:1,rs:1},
      ];
      break;
    case 12:
      cols=3;rows=5;
      placements=[
        {i:s[5],rot:'rot-l',c:1,r:1,cs:1,rs:1},{i:s[6],rot:'rot-180',c:2,r:1,cs:1,rs:1},{i:s[7],rot:'rot-r',c:3,r:1,cs:1,rs:1},
        {i:s[4],rot:'rot-l',c:1,r:2,cs:1,rs:1},{i:-1,c:2,r:2,cs:1,rs:1},{i:s[8],rot:'rot-r',c:3,r:2,cs:1,rs:1},
        {i:s[3],rot:'rot-l',c:1,r:3,cs:1,rs:1},{i:-1,c:2,r:3,cs:1,rs:1},{i:s[9],rot:'rot-r',c:3,r:3,cs:1,rs:1},
        {i:s[2],rot:'rot-l',c:1,r:4,cs:1,rs:1},{i:-1,c:2,r:4,cs:1,rs:1},{i:s[10],rot:'rot-r',c:3,r:4,cs:1,rs:1},
        {i:s[1],rot:'rot-l',c:1,r:5,cs:1,rs:1},{i:s[0],rot:'rot-0',c:2,r:5,cs:1,rs:1},{i:s[11],rot:'rot-r',c:3,r:5,cs:1,rs:1},
      ];
      break;
    default:
      cols=1;rows=1;
      placements=[{i:s[0],rot:'rot-0',c:1,r:1,cs:1,rs:1}];
  }

  wrap.style.gridTemplateColumns=`repeat(${cols},minmax(0,1fr))`;
  wrap.style.gridTemplateRows=`repeat(${rows},minmax(0,1fr))`;

  placements.forEach(({i,rot,c,r,cs,rs})=>{
    let cell: HTMLDivElement;
    if(i===-1){
      cell=document.createElement('div');
      cell.style.cssText='background:var(--bg2);overflow:hidden;min-width:0;min-height:0;';
    } else {
      cell=buildCard(i,rot!);
    }
    cell.style.gridColumn=`${c}/span ${cs}`;
    cell.style.gridRow=`${r}/span ${rs}`;
    wrap.appendChild(cell);
  });

  // Fix layout après rendu
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    fixLateral();
    let tries=0;
    function tryFit(){
      const cards=$$<HTMLElement>('.pcard',wrap);
      const ready=[...cards].every(c=>{
        const inner=$q<HTMLElement>('.card-inner',c);
        return inner&&inner.offsetWidth>0&&inner.offsetHeight>0;
      });
      if(ready){
        if(window._barInit) window._barInit();
        _fitCache={};fitTexts();wrap.style.visibility='';
      } else if(tries++<10){
        setTimeout(tryFit,20);
      } else {
        if(window._barInit) window._barInit();
        _fitCache={};fitTexts();wrap.style.visibility='';
      }
    }
    tryFit();
  }));
}

// ── BUILD CARD ────────────────────────────────────────────────────
export function buildCard(pi: number,rot: CardRot){
  if(pi===undefined||pi===null||!players[pi])return document.createElement('div');
  const p=players[pi];
  const card=document.createElement('div');card.className=`pcard color-${(pi%10)+1} ${rot}${p.eliminated?' elim':''}`;card.id=`card-${pi}`;
  p.rot=rot; // mémoriser la rotation pour le modal
  const inner=document.createElement('div');inner.className='card-inner';inner.id=`inner-${pi}`;
  const cls=scoreClass(p.score);
  const nameHtml=p.playerName?`<div class="pplayer">${escapeHtml(p.playerName)}</div>`:`<span class="pplayer-ghost"></span>`;
  const zone=document.createElement('div');zone.className='tap-zone';
  zone.innerHTML=`${nameHtml}<div class="score-wrap"><span class="score ${cls}" id="sc-${pi}">${fmtNum(p.score)}</span><span class="delta-flash" id="df-${pi}"></span></div><span class="tap-sign-minus">－</span><span class="tap-sign-plus">＋</span>`;

  const getIsPlus=(e: MouseEvent|TouchEvent,isTouch: boolean)=>{
    const rect=card.getBoundingClientRect();
    const cx=isTouch?(e as TouchEvent).changedTouches[0].clientX:(e as MouseEvent).clientX;
    const cy=isTouch?(e as TouchEvent).changedTouches[0].clientY:(e as MouseEvent).clientY;
    if(rot==='rot-l')   return(cy-rect.top)>=rect.height/2;
    if(rot==='rot-r')   return(cy-rect.top)<rect.height/2;
    if(rot==='rot-180') return(cx-rect.left)<rect.width/2;
    return(cx-rect.left)>=rect.width/2;
  };

  let holdTimer: ReturnType<typeof setTimeout>|null=null,didHold=false;
  let swipeStartX=0,swipeStartY=0,swipeActive=false;
  const SWIPE_THRESHOLD=40; // px minimum pour déclencher

  zone.addEventListener('touchstart',e=>{
    if(e.touches.length>1){swipeActive=false;if(holdTimer){clearTimeout(holdTimer);holdTimer=null;}return;}
    e.preventDefault();e.stopPropagation();
    didHold=false;swipeActive=true;
    swipeStartX=e.touches[0].clientX;
    swipeStartY=e.touches[0].clientY;
    holdTimer=setTimeout(()=>{
      didHold=true;holdTimer=null;swipeActive=false;
      openScoreModal(pi); // appui long → rotation selon la carte
    },450);
  },{passive:false});

  zone.addEventListener('touchend',e=>{
    if(holdTimer){clearTimeout(holdTimer);holdTimer=null;}
    if(!swipeActive||e.touches.length>0)return;
    swipeActive=false;
    if(didHold)return;

    const dx=e.changedTouches[0].clientX - swipeStartX;
    const dy=e.changedTouches[0].clientY - swipeStartY;
    const adx=Math.abs(dx), ady=Math.abs(dy);

    if(Math.max(adx,ady) >= SWIPE_THRESHOLD){
      // Swipe détecté — direction dominante détermine la rotation du modal
      let swipeRot: CardRot;
      if(adx >= ady){
        swipeRot = dx > 0 ? 'rot-l' : 'rot-r';  // gauche→droite = rot-l, droite→gauche = rot-r
      } else {
        swipeRot = dy > 0 ? 'rot-180' : 'rot-0'; // haut→bas = rot-180, bas→haut = rot-0
      }
      openScoreModal(pi, swipeRot);
    } else {
      // Tap court → +1 / −1 selon la zone
      adjust(pi, getIsPlus(e,true)?+1:-1, zone);
    }
  });

  zone.addEventListener('touchcancel',()=>{
    if(holdTimer){clearTimeout(holdTimer);holdTimer=null;}
    swipeActive=false;
  });
  zone.addEventListener('click',e=>adjust(pi,getIsPlus(e,false)?+1:-1,zone));

  // Désactiver les interactions pour les cartes hors jeu
  if(p.winner||p.eliminated){
    zone.style.pointerEvents='none';
    // Masquer le delta-flash
    const df=$q<HTMLElement>('.delta-flash',zone);
    if(df)df.style.display='none';
  }

  inner.appendChild(zone);
  if(p.winner&&!p.eliminated){
    const scoreWrap=$q<HTMLElement>('.score-wrap',zone);
    if(scoreWrap)scoreWrap.style.display='none';
    const sm=$q<HTMLElement>('.tap-sign-minus',zone);const sp=$q<HTMLElement>('.tap-sign-plus',zone);
    if(sm)sm.style.display='none';if(sp)sp.style.display='none';
    const dfW=$q<HTMLElement>('.delta-flash',zone);
    if(dfW)dfW.style.display='none';
    const ppW=$q<HTMLElement>('.pplayer',zone);
    if(ppW)ppW.style.display='none'; // masquer le prénom de la zone
    card.classList.add('win');
    const tag=document.createElement('div');tag.className='win-tag';
    const winScore: number|null=p.finalScore!==undefined?p.finalScore:null;
    const scoreStr=winScore!==null?`<div class="tag-score">${fmtNum(winScore)}</div>`:'';
    const nameStr=p.playerName?`<div class="elim-name">${escapeHtml(p.playerName)}</div>`:'';
    const winnerCount = players.filter(pl=>pl.winner).length;
    const multiWin = winnerCount > 1;
    const modeUnique = !!(singleWinner || (elimPoints!==null && !lastLoser));
    const isChampCard = p.winRank===1 && modeUnique && !multiWin;
    const winIcon = isChampCard ? '🏆' : '🏁';
    const winLabel = isChampCard ? t('winner') : t('finisher');
    const winRankStr=multiWin?`<div class="win-rank">#${p.winRank||'?'}</div>`:'';
    tag.innerHTML=`<div class="win-icon">${winIcon}</div><div class="win-label">${winLabel}</div>${nameStr}${winRankStr}${scoreStr}`;
    inner.appendChild(tag);
  } else if(p.eliminated){
    const scoreWrap=$q<HTMLElement>('.score-wrap',zone);
    if(scoreWrap)scoreWrap.style.display='none';
    const sm=$q<HTMLElement>('.tap-sign-minus',zone);const sp=$q<HTMLElement>('.tap-sign-plus',zone);
    if(sm)sm.style.display='none';if(sp)sp.style.display='none';
    const ppE=$q<HTMLElement>('.pplayer',zone);
    if(ppE)ppE.style.display='none'; // masquer le prénom de la zone
    const tag=document.createElement('div');tag.className='elim-tag';
    const nameStr=p.playerName?`<div class="elim-name">${escapeHtml(p.playerName)}</div>`:'';
    const rankStr=p.elimRank?`<div class="elim-rank">#${p.elimRank}</div>`:'';
    const elimScore=p.finalScore!==undefined?p.finalScore:p.score;
    tag.innerHTML=`<div class="elim-icon">💀</div><div class="elim-label">${t('eliminated')}</div>${nameStr}${rankStr}<div class="tag-score">${fmtNum(elimScore)}</div>`;
    inner.appendChild(tag);
  }
  card.appendChild(inner);return card;
}

// ── FIT TEXTS ─────────────────────────────────────────────────────
export let _fitCache: Record<string,string>={};
export function fitCard(card: HTMLElement){
    const isLat=card.classList.contains('rot-l')||card.classList.contains('rot-r');
    const inner=$q<HTMLElement>('.card-inner',card);
    let visH: number,visW: number;
    if(isLat&&inner&&inner.offsetWidth>0&&inner.offsetHeight>0){
      const r=inner.getBoundingClientRect();
      visH=r.width;visW=r.height;
    } else {
      const r=card.getBoundingClientRect();
      visH=r.height;visW=r.width;
    }
    if(!visH||!visW||visH<10||visW<10)return;
    const cacheKey=`${visH}x${visW}x${$q<HTMLElement>('.score',card)?.textContent||''}`;
    if(_fitCache[card.id]===cacheKey)return;
    _fitCache[card.id]=cacheKey;

    const usH=visH*0.84,usW=visW*0.84;
    const pl=$q<HTMLElement>('.pplayer',card);
    const sc=$q<HTMLElement>('.score',card);
    const df=$q<HTMLElement>('.delta-flash',card);
    const sm=$q<HTMLElement>('.tap-sign-minus',card);
    const sp=$q<HTMLElement>('.tap-sign-plus',card);
    const ghost=$q<HTMLElement>('.pplayer-ghost',card);

    // Référence = plus petite dimension utile — cohérent avec tous les layouts
    const ref=Math.min(usH,usW);
    // Cap proportionnel au ref — grandes cartes (1-2j) peuvent afficher plus grand
    const cap=Math.min(ref*0.62,200);
    const scoreStr=sc?sc.textContent||'0':'0';
    const nChars=scoreStr.replace(/\s/g,'').length||1;
    const charRatio=nChars<=2?0.52:nChars<=3?0.38:nChars<=4?0.28:nChars<=5?0.22:0.18;
    // Contraindre par la largeur disponible — ratio 0.85 par char (plus conservateur)
    const scoreAvailW=usW*0.78;
    const maxByWidth=scoreAvailW/(nChars*0.85);
    let scoreSz=Math.max(12,Math.min(ref*charRatio,cap,maxByWidth));
    // Vérification après rendu : ajuster pour remplir l'espace quelle que soit la police
    if(sc){
      sc.style.fontSize=scoreSz+'px';
      const swrap=sc.closest<HTMLElement>('.score-wrap')||sc.parentElement;
      // Pas de marge : on remplit tout l'espace du wrap. Le bump déborde
      // dans la carte (overflow du .score-wrap retiré côté CSS).
      const availW=swrap?swrap.offsetWidth*0.98:usW*0.98;
      const availH=swrap?swrap.offsetHeight*0.98:usH*0.55;
      // Mesure sur le score RÉEL pour exploiter tout l'espace disponible.
      const fits=()=> sc.scrollWidth<=availW && sc.scrollHeight<=availH && scoreSz<=cap;
      let grow=0;
      while(fits()&&scoreSz<cap&&grow++<50){ scoreSz=Math.min(cap,scoreSz*1.05); sc.style.fontSize=scoreSz+'px'; }
      let tries=0;
      while((sc.scrollWidth>availW||sc.scrollHeight>availH)&&scoreSz>12&&tries++<25){
        scoreSz=Math.max(12,scoreSz*0.96); sc.style.fontSize=scoreSz+'px';
      }
    }
    if(df)df.style.fontSize=Math.max(8,scoreSz*0.42)+'px';
    const signSz=Math.max(10,Math.min(ref*0.18,Math.min(ref*0.18,scoreSz*0.55)));
    if(sm)sm.style.fontSize=signSz+'px';
    if(sp)sp.style.fontSize=signSz+'px';
    let nameSz=Math.max(8,Math.min(ref*0.13,32));
    if(pl){
      pl.style.whiteSpace='nowrap';
      if(isLat){
        pl.style.maxWidth=Math.round(visH*0.82)+'px';
        pl.style.width=Math.round(visH*0.82)+'px';
      } else {
        pl.style.maxWidth='90%';
        pl.style.width='90%';
      }
      // Réduction itérative si le nom déborde
      pl.style.fontSize=nameSz+'px';
      let nTries=0;
      while(pl.scrollWidth>pl.offsetWidth+2&&nameSz>7&&nTries++<8){
        nameSz=Math.max(7,nameSz*0.85);
        pl.style.fontSize=nameSz+'px';
      }
    }
    if(ghost)ghost.style.height=Math.max(8,nameSz)+'px';

    // Sizing des tags éliminé/vainqueur basé sur ref
    const tag=$q<HTMLElement>('.elim-tag,.win-tag',card);
    if(tag){
      const iconEl=$q<HTMLElement>('.elim-icon,.win-icon',tag);
      const labelEl=$q<HTMLElement>('.elim-label,.win-label',tag);
      const nameEl=$q<HTMLElement>('.elim-name',tag);
      const rankEl=$q<HTMLElement>('.elim-rank,.win-rank',tag);
      const scoreEl=$q<HTMLElement>('.tag-score',tag);
      const iconSz=Math.max(10,Math.min(ref*0.18,36));
      const labelSz=Math.max(8,Math.min(ref*0.1,18));
      const subSz=Math.max(7,Math.min(ref*0.075,13));
      if(iconEl)iconEl.style.fontSize=iconSz+'px';
      if(labelEl)labelEl.style.fontSize=labelSz+'px';
      if(nameEl)nameEl.style.fontSize=subSz+'px';
      if(rankEl)rankEl.style.fontSize=subSz+'px';
      if(scoreEl){
        const tagStr=scoreEl.textContent||'0';
        const tagChars=tagStr.replace(/\s/g,'').length||1;
        const tagRatio=tagChars<=2?0.45:tagChars<=3?0.32:tagChars<=4?0.24:tagChars<=5?0.19:0.15;
        let tagSz=Math.max(10,Math.min(ref*tagRatio,usW*0.7));
        scoreEl.style.fontSize=tagSz+'px';
        const tagAvailW=tag.offsetWidth*0.80||usW*0.80;
        let tagTries=0;
        while(scoreEl.scrollWidth>tagAvailW&&tagSz>10&&tagTries++<12){
          tagSz=Math.max(10,tagSz*0.88);
          scoreEl.style.fontSize=tagSz+'px';
        }
      }
    }
}
export function fitTexts(){
  $$<HTMLElement>('.pcard').forEach(card=>fitCard(card));
}

// ── FIX LATERAL ───────────────────────────────────────────────────
export function fixLateral(){
  _fitCache={};
  $$<HTMLElement>('.rot-0 .card-inner,.rot-180 .card-inner').forEach(inner=>{
    const pc=inner.parentElement as HTMLElement;const w=pc.offsetWidth,h=pc.offsetHeight;
    if(!w||!h)return;inner.style.width=w+'px';inner.style.height=h+'px';
  });
  $$<HTMLElement>('.rot-l .card-inner,.rot-r .card-inner').forEach(inner=>{
    const pc=inner.parentElement as HTMLElement;const w=pc.offsetWidth,h=pc.offsetHeight;
    if(!w||!h)return;inner.style.width=h+'px';inner.style.height=w+'px';
  });
}
export function onResize(){
  if($('game-screen').style.display==='flex'){
    fixLateral();setTimeout(fitTexts,50);
  }
  // Repositionner le modal s'il est ouvert
  const overlay=$opt<ScoreModalEl>('score-modal');
  if(overlay&&!overlay.classList.contains('hidden')&&overlay._modalRot&&modalPlayerIdx>=0&&players[modalPlayerIdx]){
    setTimeout(()=>openScoreModal(modalPlayerIdx,overlay._modalRot),50);
  }
}
window.addEventListener('resize',onResize);
window.addEventListener('orientationchange',()=>setTimeout(onResize,300));
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden && $('game-screen').style.display==='flex'){
    fixLateral();setTimeout(fitTexts,50);
  }
});
// Pas d'action supplémentaire sur orientationchange — les modaux g/d gèrent nativement

// ── ADJUST ────────────────────────────────────────────────────────
/** Réglages de plafonnement pris en compte par {@link computeClampedScore}. */
export interface ScoreLimits {
  bloquerMode: BloquerMode;
  startPoints: number;
  allowNeg: boolean;
  objectifMode: ObjectifMode;
  winPoints: number|null;
  maxPoints: number;
}
/** Résultat du calcul d'un ajustement de score borné. */
export interface ClampedAdjustment {
  /** score brut avant plafonnement (mémorisé pour le mode « bloquer ») */
  rawScore: number;
  /** score effectivement appliqué, après plafonnement */
  newScore: number;
  /** variation réellement appliquée (newScore − score précédent) */
  realDelta: number;
  /** variation brute avant plafonnement (score précédent → rawScore), pour l'historique */
  rawDelta: number;
}
/**
 * Calcule le score borné après application d'un delta, selon les réglages de
 * partie donnés (plafond « bloquer », plafond d'objectif, autorisation du
 * négatif). Fonction pure (aucun accès DOM ni état module) : factorise la
 * logique auparavant dupliquée entre `adjust()` (tap +/−) et
 * `confirmScoreModal()` (saisie manuelle) — voir docs/audit/DECISIONS-B.md.
 */
export function computeClampedScore(prevScore: number, delta: number, limits: ScoreLimits): ClampedAdjustment {
  const minVal=limits.bloquerMode==='min'?limits.startPoints:(limits.allowNeg||limits.objectifMode==='elim'||limits.objectifMode==='none'?-Infinity:(limits.objectifMode==='win'&&limits.winPoints!==null&&limits.winPoints<limits.startPoints?limits.winPoints:0));
  const capMax=limits.bloquerMode==='max'?limits.startPoints:(limits.maxPoints===Infinity?Infinity:limits.maxPoints);
  const rawScore=prevScore+delta; // score brut avant clamp
  const newScore=Math.min(capMax,Math.max(minVal,rawScore));
  const realDelta=newScore-prevScore;
  const rawDelta=rawScore-prevScore;
  return {rawScore,newScore,realDelta,rawDelta};
}
/** Réglages courants de plafonnement, à passer à {@link computeClampedScore}. */
function currentScoreLimits(): ScoreLimits {
  return {bloquerMode,startPoints,allowNeg,objectifMode,winPoints,maxPoints};
}
export function adjust(i: number,delta: number,zone?: HTMLElement|null){
  const p=players[i];if(p.eliminated||p.winner)return;
  const {rawScore,newScore,realDelta,rawDelta}=computeClampedScore(p.score,delta,currentScoreLimits());
  if(realDelta===0){
    flashZone(zone,'flash-neg');
    if(navigator.vibrate)navigator.vibrate([30,20,30]);
    return;
  }
  const _prevScore=p.score, _prevRawScore=p.rawScore; // snapshot AVANT modification
  saveUndo();p.score=newScore;p.rawScore=rawScore;
  window._lastAdjustPrev={playerIdx:i, score:_prevScore, rawScore:_prevRawScore};
  updateDisplay(i,zone,realDelta);
  flashZone(zone,realDelta>0?'flash-pos':'flash-neg');
  logGrouped(i,rawDelta);
}

export function scoreClass(score: number): string{
  if(elimPoints!==null){
    // Élimination par le bas (score descend vers elimPoints)
    if(elimPoints<startPoints){
      const range=startPoints-elimPoints;
      if(score<=elimPoints)return 'crit';
      if(score<=elimPoints+Math.floor(range*0.25))return 'low';
    }
    // Élimination par le haut (score monte vers elimPoints, ex: Skyjo)
    if(elimPoints>startPoints){
      const range=elimPoints-startPoints;
      if(score>=elimPoints)return 'crit';
      if(score>=elimPoints-Math.floor(range*0.25))return 'low';
    }
  } else {
    // Pas de coloration en mode No limit
    if(objectifMode==='none')return '';
    // Comportement original
    if(startPoints>0){
      if(score<=0)return 'crit';
      if(score<=Math.floor(startPoints*0.25))return 'low';
    } else if(score<0){return 'crit';}
  }
  return '';
}

// ── UPDATE DISPLAY ────────────────────────────────────────────────
export function updateDisplay(i: number,zone: HTMLElement|null|undefined,delta: number){
  const p=players[i];
  const sc=$opt(`sc-${i}`);
  if(!sc)return;
  sc.textContent=fmtNum(p.score);
  sc.className='score '+scoreClass(p.score);
  // AXE2 : rebond directionnel du chiffre (retire/reapplique pour rejouer l'anim)
  if(typeof delta==='number'&&delta!==0){
    const _bump=delta>0?'bump-up':'bump-down';
    sc.classList.remove('bump-up','bump-down');
    void sc.offsetWidth;
    sc.classList.add(_bump);
    sc.addEventListener('animationend',function _h(){sc.classList.remove('bump-up','bump-down');sc.removeEventListener('animationend',_h);});
  }

  // Invalider le cache de cette carte pour forcer le recalcul du fontSize
  const card=sc.closest<HTMLElement>('.pcard');
  if(card&&card.id)delete _fitCache[card.id];
  // Refitter uniquement cette carte (immédiat, pas de setTimeout)
  if(card)fitCard(card);

  // Victoire : atteindre winPoints — marquer immédiatement, continuer
  if(winPoints!==null&&!p.eliminated&&!p.winner){
    if((winPoints>=startPoints&&p.score>=winPoints)||(winPoints<startPoints&&p.score<=winPoints)){
      const winnerCount = players.filter(pl=>pl.winner).length;
      // Snapshot AVANT modification — score précédent via undo stack
      const _snapHistory=history.map(h=>({...h, entries:[...h.entries]}));
      const _snapRankCounter=rankCounter;
      rankCounter++;p.winner=true;p.winRank=winnerCount+1;
      p.finalScore=(p.rawScore!==undefined)?p.rawScore:p.score;

      if(navigator.vibrate)navigator.vibrate([80,40,80,40,120]);

      if(singleWinner){
        const winnerName=p.playerName||(t('player')+' '+(i+1));
        $('endgame-modal-icon').textContent='🏆';
        $('endgame-modal-title').textContent=winnerName;
        $('endgame-modal-sub').textContent=(t('singleWinnerConfirm')||'Fin de partie — les autres joueurs sont perdants. Confirmer ?');
        $('endgame-modal').classList.remove('hidden');
        window._pendingEndgame={type:'singleWinner', winnerIdx:i,
          _cancel:()=>{
            p.winner=false; p.winRank=undefined; p.finalScore=undefined;
            rankCounter=_snapRankCounter;
            const prev=window._lastAdjustPrev;
            if(prev&&prev.playerIdx===i){ p.score=prev.score; p.rawScore=prev.rawScore; }
            history.length=0; _snapHistory.forEach(h=>history.push(h));
          }};
        setTimeout(()=>{ renderGame(); saveGame(); },300);
        return;
      }

      const remaining=players.filter(pl=>!pl.eliminated&&!pl.winner);
      if(remaining.length===1&&lastLoser){
        const loser=remaining[0];
        const loserIdx=players.indexOf(loser);
        const winnerName=p.playerName||(t('player')+' '+(i+1));
        const loserName=loser.playerName||(t('player')+' '+(loserIdx+1));
        $('endgame-modal-icon').textContent='🏁';
        $('endgame-modal-title').textContent=winnerName;
        $('endgame-modal-sub').textContent=loserName+' '+(t('lastLoserConfirm')||'sera désigné perdant. Confirmer ?');
        $('endgame-modal').classList.remove('hidden');
        window._pendingEndgame={type:'lastLoser', winnerIdx:i, loserIdx,
          _cancel:()=>{
            p.winner=false; p.winRank=undefined; p.finalScore=undefined;
            rankCounter=_snapRankCounter;
            const prev=window._lastAdjustPrev;
            if(prev&&prev.playerIdx===i){ p.score=prev.score; p.rawScore=prev.rawScore; }
            history.length=0; _snapHistory.forEach(h=>history.push(h));
          }};
        setTimeout(()=>{ renderGame(); saveGame(); },300);
        return;
      }

      // Lancer l'animation (cas normal sans confirmation)
      // Vérifier si tous les joueurs sont maintenant vainqueurs → fin de partie
      const allDone=players.every(pl=>pl.winner||pl.eliminated);
      if(allDone){
        setTimeout(()=>{ renderGame(); saveGame(); },300);
        // Winner-modal à la fin de la dernière animation finisher
        window._afterFinAnim=function(){
          $('winner-name').textContent='';
          $('winner-sub').textContent='';
          showWinnerModal(false);
          localStorage.removeItem('scoretrack_save');
          window._afterFinAnim=null;
        };
      }
      playWinAnim(i);
      setTimeout(()=>{ renderGame(); saveGame(); },300);
      return;
    }
  }

  // Élimination : atteindre elimPoints
  if(elimPoints!==null&&!p.eliminated){
    const triggered=(elimPoints<=startPoints&&p.score<=elimPoints)||(elimPoints>startPoints&&p.score>=elimPoints);
    if(triggered){
      if(navigator.vibrate)navigator.vibrate([50,30,80]);
      p.finalScore=(p.rawScore!==undefined)?p.rawScore:p.score;
      const alive=players.filter(pl=>!pl.eliminated&&!pl.winner);
      if(alive.length<=2){
        elimPending=i;
        $('elim-confirm-name').textContent=p.playerName||`${t('player')} ${i+1}`;
        $('elim-modal').classList.remove('hidden');
      } else {
        elimDirect(i);
      }
      return;
    }
  }

  // En mode No limit (objectifMode==='none'), pas d'élimination automatique
}

// ── ÉLIMINATION ───────────────────────────────────────────────────

// ── ÉLIMINATION DIRECTE (sans confirmation) ──────────────────────
export function elimDirect(i: number){
  rankCounter++;
  players[i].eliminated=true;
  players[i].elimRank=rankCounter;
  // Capturer le score final avant animation
  if(players[i].finalScore===undefined) players[i].finalScore=players[i].score;
  // Poser _afterElimAnim AVANT de lancer l'animation
  window._afterElimAnim=function(){
    window._afterElimAnim=null;
    renderGame();saveGame();
    const alive=players.filter(pl=>!pl.eliminated&&!pl.winner);
    if(alive.length===1&&!alive[0].winner){
      rankCounter++;alive[0].winRank=1;alive[0].winner=true;
      if(alive[0].finalScore===undefined) alive[0].finalScore=alive[0].rawScore!==undefined?alive[0].rawScore:alive[0].score;
      renderGame();
      window._afterWinAnim=function(){
        $('winner-name').textContent=t('winner');
        $('winner-sub').textContent=(alive[0].playerName||'')+(alive[0].playerName?' · ':'')+fmtNum(alive[0].finalScore as number)+' pts';
        showWinnerModal(true);
        localStorage.removeItem('scoretrack_save');
        window._afterWinAnim=null;
      };
      playWinAnim(players.indexOf(alive[0]));
    }
  };
  playElimAnim(i);
  setTimeout(()=>{ renderGame();saveGame(); },300);
}
export function confirmElim(){
  $('elim-modal').classList.add('hidden');
  if(elimPending<0)return;
  const i=elimPending;elimPending=-1;
  elimDirect(i);
}
export function cancelElim(){
  $('elim-modal').classList.add('hidden');
  if(elimPending<0)return;
  // Remettre le score à 1 (undo)
  undoLast();
  elimPending=-1;
}

// ── FLASH ─────────────────────────────────────────────────────────
export function flashZone(z: HTMLElement|null|undefined,cls: string){if(!z||!z.classList)return;z.classList.add(cls);setTimeout(()=>z.classList.remove(cls),200);}
export function flashDelta(i: number,groupSum: number){
  if(players[i]&&(players[i].winner||players[i].eliminated))return;
  const el=$opt(`df-${i}`);if(!el)return;
  const s=groupSum>0?'+':'';
  el.textContent=s+fmtNum(groupSum);
  // Gain = vert, perte = rouge
  el.style.color=groupSum>0?'var(--green)':'var(--red)';
  el.style.textShadow=groupSum>0?'0 0 8px var(--green)':'0 0 8px var(--red)';
  el.classList.remove('go');void el.offsetWidth;el.classList.add('go');
}

// ── LOG GROUPÉ ────────────────────────────────────────────────────
export function logGrouped(pi: number,delta: number){
  // Toujours forcer fermeture du groupe ouvert avant d'en créer un nouveau via modal
  let group=history.find(h=>h.playerIdx===pi&&h.open);
  if(!group){
    actionCounter++;
    group={playerIdx:pi,who:players[pi].playerName,entries:[],open:true,rank:actionCounter};
    history.unshift(group);
  }
  group.entries.push({delta});
  const sum=group.entries.reduce((s,e)=>s+e.delta,0);
  // Durée du flash proportionnelle au nombre de taps
  flashDelta(pi,sum);
  if(groupTimers[pi])clearTimeout(groupTimers[pi]);
  groupTimers[pi]=setTimeout(()=>{group!.open=false;},GROUP_DELAY);
  saveGame();
}

// ── MODAL SCORE MANUEL ────────────────────────────────────────────
export function openScoreModal(pi: number, forceRot?: CardRot){
  if(window._modalJustClosed) return;
  const p=players[pi];if(!p||p.eliminated||p.winner)return;
  // Toujours fermer le groupe ouvert pour cet index
  const openGroup=history.find(h=>h.playerIdx===pi&&h.open);
  if(openGroup){openGroup.open=false;if(groupTimers[pi]){clearTimeout(groupTimers[pi]);delete groupTimers[pi];}}
  modalPlayerIdx=pi;modalValue='0';modalSign=bloquerMode==='max'?-1:1;
  $('score-modal-player').textContent=(p.playerName||`${t('player')} ${pi+1}`)+' — '+fmtNum(p.score);
  updateModalDisplay();
  setSign(modalSign);
  // Orienter : forcé par le swipe, ou rotation de la carte pour l'appui long
  const rot: CardRot=forceRot||(p.rot||'rot-0');
  const overlay=$<ScoreModalEl>('score-modal');
  const rotEl=$('modal-content-rotatable');
  const box=$q<HTMLElement>('.modal-box',overlay);
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
  const _scoreDisp = $q<HTMLElement>('.modal-score-display',overlay);
  const _player    = $q<HTMLElement>('.modal-player',overlay);
  const _title     = $q<HTMLElement>('.modal-title',overlay);
  const _handle    = $q<HTMLElement>('.modal-handle',overlay);
  if(_scoreDisp){ _scoreDisp.style.fontSize=`${Math.round(44*_p)}px`; _scoreDisp.style.minHeight=`${Math.round(52*_p)}px`; }
  if(_player)    _player.style.fontSize=`${Math.round(22*_p)}px`;
  if(_title)     _title.style.fontSize=`${Math.round(14*_p)}px`;
  if(_handle)    _handle.style.padding=`${Math.round(4*_p)}px ${Math.round(40*_p)}px`;
  $$<HTMLElement>('.key-btn',overlay).forEach(k=>{ k.style.padding=`${Math.round(5*_p)}px ${Math.round(3*_p)}px`; k.style.fontSize=`${Math.round(24*_p)}px`; });
  $$<HTMLElement>('.sign-btn',overlay).forEach(b=>{ b.style.padding=`${Math.round(4*_p)}px`; b.style.fontSize=`${Math.round(16*_p)}px`; });
  $$<HTMLElement>('.modal-btn',overlay).forEach(b=>{ b.style.padding=`${Math.round(10*_p)}px`; b.style.fontSize=`${Math.round(14*_p)}px`; });

  if(rot==='rot-180'){
    overlay.classList.add('rot-180');
    overlay.style.alignItems='flex-start';
    rotEl.style.transform='rotate(180deg)';
    {
      const side=Math.min(window.innerWidth,window.innerHeight,320), p=side/390;
      if(box){box.style.width=side+'px';box.style.maxWidth=side+'px';box.style.maxHeight=side+'px';box.style.overflowY='auto';box.style.display='';box.style.flexDirection='';box.style.height='';box.style.transform='';box.style.transformOrigin='';box.style.position='';}
      rotEl.style.padding=`${Math.round(6*p)}px ${Math.round(12*p)}px ${Math.round(12*p)}px`;rotEl.style.display='';rotEl.style.flexDirection='';rotEl.style.flex='';rotEl.style.minHeight='';rotEl.style.overflow='';
      const ttl=$q<HTMLElement>('.modal-title',overlay),plr=$q<HTMLElement>('.modal-player',overlay),scd=$q<HTMLElement>('.modal-score-display',overlay),hdl=$q<HTMLElement>('.modal-handle',overlay),sgr=$q<HTMLElement>('.modal-sign-row',overlay);
      if(hdl){hdl.style.padding=`${Math.round(4*p)}px 40px`;hdl.style.marginBottom=`${Math.round(4*p)}px`;}
      if(ttl)ttl.style.marginBottom=`${Math.round(2*p)}px`;if(plr)plr.style.marginBottom=`${Math.round(4*p)}px`;
      if(scd){scd.style.fontSize=`${Math.round(44*p)}px`;scd.style.marginBottom=`${Math.round(6*p)}px`;scd.style.minHeight=`${Math.round(52*p)}px`;}
      if(sgr)sgr.style.marginBottom=`${Math.round(6*p)}px`;
      $$<HTMLElement>('.key-btn',overlay).forEach(k=>{k.style.padding=`${Math.round(5*p)}px ${Math.round(3*p)}px`;k.style.fontSize=`${Math.round(24*p)}px`;k.style.minHeight='';k.style.height='';});
      $$<HTMLElement>('.modal-btn',overlay).forEach(b=>{b.style.padding=`${Math.round(10*p)}px`;b.style.fontSize=`${Math.round(14*p)}px`;});
      $$<HTMLElement>('.sign-btn',overlay).forEach(b=>{b.style.padding=`${Math.round(4*p)}px`;b.style.fontSize=`${Math.round(16*p)}px`;});
      const kp=$q<HTMLElement>('.modal-keypad',overlay);if(kp){kp.style.marginBottom='6px';kp.style.flex='';kp.style.height='';kp.style.minHeight='';kp.style.overflow='';kp.style.gridTemplateRows='';kp.style.gap='';}
    }
  } else if(rot==='rot-0'){
    {
      const side=Math.min(window.innerWidth,window.innerHeight,320), p=side/390;
      if(box){box.style.width=side+'px';box.style.maxWidth=side+'px';box.style.maxHeight=side+'px';box.style.overflowY='auto';box.style.display='';box.style.flexDirection='';box.style.height='';box.style.transform='';box.style.transformOrigin='';box.style.position='';}
      rotEl.style.padding=`${Math.round(6*p)}px ${Math.round(12*p)}px ${Math.round(12*p)}px`;rotEl.style.display='';rotEl.style.flexDirection='';rotEl.style.flex='';rotEl.style.minHeight='';rotEl.style.overflow='';
      const ttl=$q<HTMLElement>('.modal-title',overlay),plr=$q<HTMLElement>('.modal-player',overlay),scd=$q<HTMLElement>('.modal-score-display',overlay),hdl=$q<HTMLElement>('.modal-handle',overlay),sgr=$q<HTMLElement>('.modal-sign-row',overlay);
      if(hdl){hdl.style.padding=`${Math.round(4*p)}px 40px`;hdl.style.marginBottom=`${Math.round(4*p)}px`;}
      if(ttl)ttl.style.marginBottom=`${Math.round(2*p)}px`;if(plr)plr.style.marginBottom=`${Math.round(4*p)}px`;
      if(scd){scd.style.fontSize=`${Math.round(44*p)}px`;scd.style.marginBottom=`${Math.round(6*p)}px`;scd.style.minHeight=`${Math.round(52*p)}px`;}
      if(sgr)sgr.style.marginBottom=`${Math.round(6*p)}px`;
      $$<HTMLElement>('.key-btn',overlay).forEach(k=>{k.style.padding=`${Math.round(5*p)}px ${Math.round(3*p)}px`;k.style.fontSize=`${Math.round(24*p)}px`;k.style.minHeight='';k.style.height='';});
      $$<HTMLElement>('.modal-btn',overlay).forEach(b=>{b.style.padding=`${Math.round(10*p)}px`;b.style.fontSize=`${Math.round(14*p)}px`;});
      $$<HTMLElement>('.sign-btn',overlay).forEach(b=>{b.style.padding=`${Math.round(4*p)}px`;b.style.fontSize=`${Math.round(16*p)}px`;});
      const kp=$q<HTMLElement>('.modal-keypad',overlay);if(kp){kp.style.marginBottom='6px';kp.style.flex='';kp.style.height='';kp.style.minHeight='';kp.style.overflow='';kp.style.gridTemplateRows='';kp.style.gap='';}
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
    const title=$q<HTMLElement>('.modal-title',overlay);
    const player=$q<HTMLElement>('.modal-player',overlay);
    const scoreDisp=$q<HTMLElement>('.modal-score-display',overlay);
    const handle=$q<HTMLElement>('.modal-handle',overlay);
    const signRow=$q<HTMLElement>('.modal-sign-row',overlay);
    
    if(handle){ handle.style.padding=`${Math.round(4*p)}px 40px`; handle.style.marginBottom=`${Math.round(4*p)}px`; }
    if(title){ title.style.marginBottom=`${Math.round(2*p)}px`; } if(player){ player.style.fontSize=`${Math.round(22*p)}px`; player.style.marginBottom=`${Math.round(4*p)}px`; }
    if(scoreDisp){ scoreDisp.style.fontSize=`${Math.round(44*p)}px`; scoreDisp.style.marginBottom=`${Math.round(6*p)}px`; scoreDisp.style.minHeight=`${Math.round(52*p)}px`; }
    if(signRow){ signRow.style.marginBottom=`${Math.round(6*p)}px`; }
    $$<HTMLElement>('.key-btn',overlay).forEach(k=>{ k.style.padding=`${Math.round(5*p)}px ${Math.round(3*p)}px`; k.style.fontSize=`${Math.round(24*p)}px`; k.style.minHeight=''; k.style.height=''; });
    $$<HTMLElement>('.modal-btn',overlay).forEach(b=>{ b.style.padding=`${Math.round(10*p)}px`; b.style.fontSize=`${Math.round(14*p)}px`; });
    $$<HTMLElement>('.sign-btn',overlay).forEach(b=>{ b.style.padding=`${Math.round(4*p)}px`; b.style.fontSize=`${Math.round(16*p)}px`; });
    const keypad=$q<HTMLElement>('.modal-keypad',overlay);
    if(keypad){ keypad.style.marginBottom='6px'; keypad.style.flex=''; keypad.style.height=''; keypad.style.minHeight=''; keypad.style.overflow=''; keypad.style.gridTemplateRows=''; keypad.style.gap=''; }
  }
  // (rot top/bottom non utilisé)
  // Afficher backdrop et modal
  const bd=$opt('modal-backdrop');
  if(bd){ bd.classList.remove('hidden'); bd.style.background='rgba(20,14,8,0.88)'; }
  overlay._modalRot = rot;
  overlay.classList.remove('hidden');
}
export function closeScoreModal(){
  const overlay=$<ScoreModalEl>('score-modal');
  const backdrop=$opt('modal-backdrop');
  overlay._dragging=false;
  window._modalJustClosed=true;
  setTimeout(()=>{ window._modalJustClosed=false; }, 350);
  overlay.classList.add('hidden');
  if(backdrop){ backdrop.classList.add('hidden'); backdrop.style.background=''; }
  // Reset complet pour la prochaine ouverture
  overlay.removeAttribute('style');
  overlay.classList.remove('rot-180');
  const rotEl=$opt('modal-content-rotatable');
  if(rotEl)rotEl.removeAttribute('style');
  const box=$q<HTMLElement>('.modal-box',overlay);
  if(box)box.removeAttribute('style');
  $$<HTMLElement>('.key-btn,.modal-btn,.sign-btn',overlay).forEach(el=>el.removeAttribute('style'));
  const els=['.modal-title','.modal-player','.modal-score-display','.modal-handle','.modal-sign-row','.modal-keypad','.modal-confirm-row'];
  els.forEach(sel=>{const el=overlay.querySelector(sel);if(el)el.removeAttribute('style');});
}

// ── Drag-to-close modal ─────────────────────────────────────────
(function initModalDrag(){
  const overlay = $<ScoreModalEl>('score-modal');
  const mBox    = $q<HTMLElement>('.modal-box',overlay);
  const mHandle = $q<HTMLElement>('.modal-handle',overlay);
  if(!mBox || !mHandle) return;

  let _active=false, _sx=0, _sy=0, _lastD=0, _lastT=0, _vel=0;
  let _origTop='', _origLeft='';

  const backdrop=$opt('modal-backdrop');
  if(backdrop){
    backdrop.addEventListener('touchstart',e=>{
      if(!overlay.classList.contains('hidden')){e.preventDefault();closeScoreModal();}
    },{passive:false});
    backdrop.addEventListener('click',()=>{
      if(!overlay.classList.contains('hidden'))closeScoreModal();
    });
  }

  function getRot(): CardRot{ return overlay._modalRot||'rot-0'; }

  function getD(touches: TouchList){
    const dx=touches[0].clientX-_sx, dy=touches[0].clientY-_sy;
    const r=getRot();
    if(r==='rot-0')   return dy;
    if(r==='rot-180') return -dy;
    if(r==='rot-l')   return -dx;
    if(r==='rot-r')   return dx;
    return dy;
  }

  function apply(d: number){
    const clamped=Math.max(0,d);
    const r=getRot();
    if(r==='rot-0'){
      const box=$q<HTMLElement>('.modal-box',overlay);
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
      const box=$q<HTMLElement>('.modal-box',overlay);
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
      const box=$q<HTMLElement>('.modal-box',overlay);
      if(box){ box.style.animation='none'; box.style.transition='transform 0.25s cubic-bezier(0.32,0.72,0,1)'; box.style.transform=''; }
    } else {
      overlay.style.transition='top 0.25s cubic-bezier(0.32,0.72,0,1), left 0.25s cubic-bezier(0.32,0.72,0,1)';
      overlay.style.top=_origTop;
      overlay.style.left=_origLeft;
    }
    if(backdrop){ backdrop.style.transition='background 0.25s ease'; backdrop.style.background='rgba(20,14,8,0.88)'; }
  }

  // Bloquer les clics sur boutons après un pinch-zoom
  let _wasPinch=false, _pinchBlockTimer: ReturnType<typeof setTimeout>|null=null;

  $q<HTMLElement>('.modal-box',overlay)!.addEventListener('touchstart', e=>{
    if(e.touches.length>=2){
      _wasPinch=true;
      clearTimeout(_pinchBlockTimer!); // clearTimeout(null) : sans effet
    }
  },{passive:true});

  $q<HTMLElement>('.modal-box',overlay)!.addEventListener('touchend', e=>{
    if(_wasPinch){
      e.preventDefault();
      e.stopPropagation();
      _pinchBlockTimer=setTimeout(()=>{ _wasPinch=false; },400);
    }
  },{passive:false});

  $q<HTMLElement>('.modal-box',overlay)!.addEventListener('click', e=>{
    if(_wasPinch){ e.stopPropagation(); e.preventDefault(); }
  },{capture:true});

  function startDrag(e: TouchEvent){
    if(overlay.classList.contains('hidden')) return;
    if(e.touches.length>1) return; // laisser le pinch-zoom
    // Exclure les touches sur keypad et boutons
    if((e.target as Element).closest('.modal-keypad,.modal-confirm-row,.modal-sign-row')) return;
    _active=true; _vel=0; _lastD=0; _lastT=performance.now();
    _sx=e.touches[0].clientX; _sy=e.touches[0].clientY;
    _origTop  = overlay.style.top  || '0px';
    _origLeft = overlay.style.left || '0px';
    const r=getRot();
    if(r==='rot-0'){
      const box=$q<HTMLElement>('.modal-box',overlay);
      if(box){ box.style.transition='none'; box.style.animation='none'; }
    } else {
      overlay.style.transition='none';
    }
    document.addEventListener('touchmove', onDragMove, {passive:false});
    document.addEventListener('touchend',  onDragEnd,  {passive:false});
  }

  function onDragMove(e: TouchEvent){
    if(!_active) return;
    e.preventDefault();
    const now=performance.now(), d=Math.max(0,getD(e.touches));
    const dt=now-_lastT; if(dt>0) _vel=(d-_lastD)/dt;
    _lastD=d; _lastT=now;
    apply(d);
  }

  function onDragEnd(e: TouchEvent){
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
  const _dragBox=$q<HTMLElement>('.modal-box',overlay);
  if(_dragBox) _dragBox.addEventListener('touchstart', startDrag, {passive:true});

  overlay.addEventListener('touchend', e=>{
    if(_active) return;
    const b=$q<HTMLElement>('.modal-box',overlay);
    if(b && !b.contains(e.target as Node)){ e.preventDefault(); closeScoreModal(); }
  },{passive:false});
})();

export function setSign(s: 1|-1){
  modalSign=s;
  $('sign-plus').classList.toggle('active',s===1);
  $('sign-minus').classList.toggle('active',s===-1);
  updateModalDisplay();
  if(parseInt(modalValue)>0) confirmScoreModal();
}
export function pressKey(k: string|number){
  if(k==='⌫')modalValue=modalValue.length>1?modalValue.slice(0,-1):'0';
  else if(k==='00')modalValue=modalValue==='0'?'0':modalValue+'00';
  else modalValue=modalValue==='0'?String(k):modalValue+k;
  if(modalValue.length>7)modalValue=modalValue.slice(0,7);
  updateModalDisplay();
}
export function updateModalDisplay(){
  const v=parseInt(modalValue)||0;
  const el=$('score-modal-display');
  el.textContent=(modalSign===1?'+':'-')+fmtNum(v);
  el.className='modal-score-display'+(modalSign===1?' pos':' neg');
}
export function confirmScoreModal(){
  const v=parseInt(modalValue)||0;if(v===0){closeScoreModal();return;}
  const delta=modalSign*v;saveUndo();
  const p=players[modalPlayerIdx];
  const prevScore=p.score;
  window._lastAdjustPrev={playerIdx:modalPlayerIdx, score:prevScore, rawScore:p.rawScore};
  const {rawScore,newScore,realDelta,rawDelta}=computeClampedScore(prevScore,delta,currentScoreLimits());
  p.score=newScore;
  p.rawScore=rawScore; // score brut avant clamp
  if(realDelta===0){closeScoreModal();return;}
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
  const btn=$<HTMLButtonElement>('undo-btn');let iv: ReturnType<typeof setInterval>|null=null,to: ReturnType<typeof setTimeout>|null=null;
  const start=(e: Event)=>{e.preventDefault();undoLast();to=setTimeout(()=>{iv=setInterval(undoLast,120);},500);};
  const stop=()=>{clearTimeout(to!);clearInterval(iv!);to=null;iv=null;}; // clear*(null) : sans effet
  btn.addEventListener('touchstart',start,{passive:false});btn.addEventListener('touchend',stop);btn.addEventListener('touchcancel',stop);
  btn.addEventListener('mousedown',start);btn.addEventListener('mouseup',stop);btn.addEventListener('mouseleave',stop);
})();

export function saveUndo(){
  undoStack.push(JSON.stringify({players,history,seatOrder,actionCounter}));
  if(undoStack.length>40)undoStack.shift();
  $<HTMLButtonElement>('undo-btn').disabled=false;
}
export function undoLast(){
  if(!undoStack.length)return;
  // Fermer le modal winner s'il est ouvert
  $('winner-modal').classList.add('hidden');
  $('elim-modal').classList.add('hidden');
  elimPending=-1;
  const s: UndoSnapshot=JSON.parse(undoStack.pop() as string);
  players=s.players;history=s.history;seatOrder=s.seatOrder;actionCounter=s.actionCounter;
  $<HTMLButtonElement>('undo-btn').disabled=undoStack.length===0;
  _fitCache={};
  renderGame();saveGame();
}

export function rotatePlayers(){
  if(players.length<2)return;saveUndo();
  const last=seatOrder.pop() as number;seatOrder.unshift(last);
  renderGame();
}

// ── RÉCAP ─────────────────────────────────────────────────────────
export function cancelEndgame(){
  $('endgame-modal').classList.add('hidden');
  const eg=window._pendingEndgame;
  if(eg&&eg._cancel) eg._cancel();
  window._pendingEndgame=null;
  renderGame(); saveGame();
}
export function confirmEndgame(){
  $('endgame-modal').classList.add('hidden');
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
      $('winner-name').textContent=t('winner');
      $('winner-sub').textContent=(p.playerName||'')+(p.playerName?' · ':'')+fmtNum(p.finalScore ?? p.rawScore ?? p.score)+' pts';
      showWinnerModal(true);
      localStorage.removeItem('scoretrack_save');
      window._afterWinAnim=null;
    };
    playWinAnim(eg.winnerIdx);
  }

  if(eg.type==='lastLoser'){
    const loser=players[eg.loserIdx];
    loser.finalScore=(loser.rawScore!==undefined)?loser.rawScore:loser.score;
    rankCounter++;loser.eliminated=true;loser.elimRank=rankCounter;
    renderGame(); saveGame();
    playWinAnim(eg.winnerIdx);
    // Après l'anim finisher (ou win si champion), lancer l'élim
    const afterWin=function(){
      window._afterWinAnim=null; window._afterFinAnim=null;
      playElimAnim(eg.loserIdx);
      window._afterElimAnim=function(){
        const loserName=loser.playerName||(t('player')+' '+(eg.loserIdx+1));
        $('winner-icon').textContent='💀';
        $('winner-name').textContent=loserName;
        $('winner-sub').textContent=fmtNum(loser.finalScore ?? loser.rawScore ?? loser.score)+' pts';
        $('winner-modal').classList.remove('hidden');
        localStorage.removeItem('scoretrack_save');
        window._afterElimAnim=null;
      };
    };
    window._afterWinAnim=afterWin;
    window._afterFinAnim=afterWin;
  }
}

export function showWinnerModal(isChampion: boolean){
  $('winner-icon').textContent=isChampion?'🏆':'🏁';
  $('winner-modal').classList.remove('hidden');
}
export function showRecap(){
  history.forEach(h=>{h.open=false;});
  Object.values(groupTimers).forEach(clearTimeout);groupTimers={};

  // i18n panneau PDF
  $('pdf-panel-title').textContent='⬇ '+(t('pdfBtnDl')||'Export PDF');
  $<HTMLInputElement>('pdf-game-name').placeholder=t('pdfNamePlaceholder')||'Nom de la partie (optionnel)';
  $('pdf-lbl-scores').textContent=t('pdfLblScores')||'Scores finaux';
  $('pdf-lbl-history').textContent=t('pdfLblHistory')||'Historique des actions';
  $('pdf-lbl-info').textContent=t('pdfLblInfo')||'Infos partie (preset, date)';
  $('btn-pdf-dl').textContent='📄 '+(t('pdfBtnDl')||'Télécharger PDF');

  let html='';
  players.forEach((p,pi)=>{
    const groups=history.filter(h=>h.playerIdx===pi).sort((a,b)=>a.rank-b.rank);
    if(!groups.length&&!p.eliminated&&!p.winner)return;
    const modeUniqueWinnerRecap = !!(singleWinner || lastLoser || (elimPoints!==null));
    const multiWin=players.filter(pl=>pl.winner).length>1;
    const isFinisherMode = multiWin || !modeUniqueWinnerRecap;
    let statusBadge='';
    if(p.winner){
      const icon=isFinisherMode?'🏁':'🏆';
      const label=isFinisherMode?(t('finisher')||'Finisher'):(t('winner')||'Winner');
      const rankStr=(multiWin||isFinisherMode)?' #'+p.winRank:'';
      statusBadge=`<div class="recap-status win">${icon} ${label}${rankStr}</div>`;
    }
    else if(p.eliminated){
      const showRank=players.length>2 && !lastLoser && !singleWinner;
      const ordinal = p.elimRank===1?t('elimFirst1'):((p.elimRank as number)+t('elimFirstN'));
      statusBadge=`<div class="recap-status elim">💀 ${t('eliminated')}${showRank?' · '+ordinal:''}</div>`;
    }
    const recapPlayerName=p.playerName?escapeHtml(p.playerName):(t('player')+' '+(pi+1));
    html+=`<div class="recap-player"><div class="recap-player-header"><div class="recap-player-dot" style="background:${COLORS[pi%12]};box-shadow:0 0 6px ${COLORS[pi%12]}"></div><div class="recap-player-name">${recapPlayerName}</div>${statusBadge}</div>`;
    groups.forEach(g=>{
      const sum=g.entries.reduce((s,e)=>s+e.delta,0);
      const cls=sum>0?'pos':'neg';const sign=sum>0?'+':'';
      html+=`<div class="recap-entry"><div class="recap-entry-rank">${t('recapRound')} ${g.rank}</div><div class="recap-delta ${cls}">${sign}${fmtNum(sum)}</div></div>`;
    });
    const displayScore=p.finalScore!==undefined?p.finalScore:p.score;
    html+=`<div class="recap-total"><div class="recap-total-val">${fmtNum(displayScore)}</div></div></div>`;
  });
  if(!html)html=`<div style="color:var(--muted2);text-align:center;margin-top:48px;font-family:Share Tech Mono,monospace;font-size:14px;">${t('recapEmpty')}</div>`;
  $('recap-body').innerHTML=html;
  $('recap-close-btn').onclick=()=>$('recap').classList.add('hidden');
  $('recap').classList.remove('hidden');
}


// ── NOUVELLE PARTIE — mêmes noms et réglages, direct au compteur ──
export function startNewGameSameSetup(){
  const savedNames = players.map(p => p.playerName || '');
  const cfg = lastGameConfig || settings.lastGameConfig;

  ['reset-modal','winner-modal','recap','score-modal','elim-modal','endgame-modal']
    .forEach(id => $(id).classList.add('hidden'));

  localStorage.removeItem('scoretrack_save');

  // Restaurer les réglages de la partie précédente
  if(cfg){
    numPlayers   = cfg.numPlayers;
    startPoints  = cfg.startPoints;
    bloquerMode  = cfg.bloquerMode || 'none';
    allowNeg     = cfg.allowNeg || false;
    singleWinner = cfg.singleWinner || false;
    lastLoser    = cfg.lastLoser || false;
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

  $('game-screen').style.display = 'flex';if(typeof diceUpdateFab==='function')diceUpdateFab();
  
  renderGame();
  saveGame();
}

// ── RESET ─────────────────────────────────────────────────────────
export function confirmReset(){
  ['reset-modal','winner-modal','recap','score-modal','elim-modal','endgame-modal'].forEach(id=>$(id).classList.add('hidden'));
  $('game-screen').style.display='none';if(typeof diceUpdateFab==='function')diceUpdateFab();
  localStorage.removeItem('scoretrack_save');
  numPlayers=0;startPoints=0;maxPoints=Infinity;allowNeg=false;elimPending=-1;
  elimPoints=null;winPoints=null;objectifMode='none';
  bloquerMode='none';rankCounter=0;
  selectObjectif('none');
  $<HTMLInputElement>('objectif-custom').value='';
  $$<HTMLElement>('#players-grid .player-chip').forEach(c=>c.classList.remove('on'));
  $$<HTMLElement>('#start-presets .points-chip').forEach(c=>{c.classList.remove('on');c.classList.remove('disabled');});
  $<HTMLInputElement>('points-custom').value='';
  $$<HTMLElement>('.preset-card').forEach(c=>c.classList.remove('on'));
  $<HTMLButtonElement>('go-btn').disabled=true;$<HTMLButtonElement>('go-btn').textContent=t('btnNext');
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
  const bar     = $('bar');
  const handle  = $('bar-handle-zone');
  const buttons = $('bar-buttons');
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
    const wrap = $('players-wrap');
    function loop(now: number){
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
    clearTimeout(_barTimer!);
  }
  function toggleBar(){ bar.classList.contains('open') ? snapClose() : snapOpen(); }

  // Auto-fermeture après 3s d'inactivité
  let _barTimer: ReturnType<typeof setTimeout>|null=null;
  function resetBarTimer(){
    clearTimeout(_barTimer!); // clearTimeout(null) : sans effet
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
    void $('players-wrap').offsetHeight;
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
  window.addEventListener('resize', () => { _openH=0; _fitCache={}; fitTexts(); });
})();

(function init(){
  const g=$('players-grid');
  for(let i=1;i<=12;i++){
    const d=document.createElement('div');d.className='player-chip';d.textContent=String(i);
    d.onclick=()=>{
      $$<HTMLElement>('#players-grid .player-chip').forEach(c=>c.classList.remove('on'));
      d.classList.add('on');numPlayers=i;checkGoBtn();
      selectedPresetIdx=-1;
      $$<HTMLElement>('.preset-card').forEach(c=>c.classList.remove('on'));
    };
    g.appendChild(d);
  }
  $$<HTMLElement>('#start-presets .points-chip').forEach(c=>{c.onclick=()=>{$$<HTMLElement>('#start-presets .points-chip').forEach(x=>x.classList.remove('on'));c.classList.add('on');startPoints=parseInt(c.dataset.val!);$<HTMLInputElement>('points-custom').value='';checkGoBtn();selectedPresetIdx=-1;$$<HTMLElement>('.preset-card').forEach(x=>x.classList.remove('on'));};});
  $<HTMLInputElement>('points-custom').addEventListener('input',function(){$$<HTMLElement>('#start-presets .points-chip').forEach(x=>x.classList.remove('on'));selectedPresetIdx=-1;$$<HTMLElement>('.preset-card').forEach(c=>c.classList.remove('on'));const v=parseInt(this.value);startPoints=isNaN(v)?-1:v;checkGoBtn();});
  const kp=$('modal-keypad');
  [7,8,9,4,5,6,1,2,3,'⌫',0,'00'].forEach(k=>{
    const b=document.createElement('button');b.className='key-btn'+(k==='⌫'?' del':'');b.textContent=String(k);
    b.addEventListener('touchstart', e => {
      if (e.touches.length > 1 || window._isZooming) return;
      e.preventDefault();
      pressKey(k);
    }, { passive: false });
    b.addEventListener('click',e=>{if(e.isTrusted&&!('ontouchstart' in window))pressKey(k);});kp.appendChild(b);
  });
  $<HTMLInputElement>('objectif-custom').addEventListener('input',()=>{selectedPresetIdx=-1;$$<HTMLElement>('.preset-card').forEach(c=>c.classList.remove('on'));
    $$<HTMLElement>('#objectif-presets .points-chip').forEach(c=>c.classList.remove('on'));
    checkGoBtn();
  });
  $<HTMLInputElement>('objectif-custom').disabled=true;
  $<HTMLInputElement>('objectif-custom').placeholder='—';
  $$<HTMLElement>('#objectif-presets .points-chip').forEach(c=>{c.style.pointerEvents='none';c.style.opacity='0.25';});
  loadSettings();
  setTimeout(()=>{
    const s=$('splash');
    s.classList.add('hidden');
    setTimeout(()=>s.remove(),500);
  },400);
})();


// Chip d'objectif / de points cliqué : oublie le préréglage sélectionné (appelé depuis le HTML).
export function clearPresetSelection(){
  selectedPresetIdx=-1;
  $$<HTMLElement>('.preset-card').forEach(c=>c.classList.remove('on'));
}
