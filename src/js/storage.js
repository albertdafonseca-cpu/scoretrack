// ══════════════════════════════════════════════════════════════════
//  STOCKAGE ISOLÉ PAR APP — clés st:<APP_ID>:<nom>, aucun accès direct ailleurs
// ══════════════════════════════════════════════════════════════════
const APP_ID='light';
const K=n=>'st:'+APP_ID+':'+n;
const store={get(k){try{return localStorage.getItem(K(k))}catch(e){return null}},set(k,v){try{localStorage.setItem(K(k),v);return true}catch(e){return false}},del(k){try{localStorage.removeItem(K(k))}catch(e){}}};
function readJSON(k,fallback){try{const r=store.get(k);if(r===null||r===undefined)return fallback;const v=JSON.parse(r);return (v===null||v===undefined)?fallback:v;}catch(e){return fallback;}}
// Migration unique des anciennes clés partagées entre apps.
// Les anciennes clés ne sont PAS supprimées : les apps sœurs doivent pouvoir migrer aussi.
(function migrateLegacyStorage(){
  try{
    if(store.get('migrated'))return;
    const legacy={save:'scoretrack_save',settings:'scoretrack_settings',profiles:'scoretrack_profiles',privacy:'st_privacy_accepted'};
    Object.keys(legacy).forEach(k=>{
      if(store.get(k)!==null)return;
      let old=null;try{old=localStorage.getItem(legacy[k]);}catch(e){}
      if(old!==null)store.set(k,old);
    });
    store.set('migrated','1');
  }catch(e){}
})();
function saveSettings(){store.set('settings',JSON.stringify(settings));}
// Efface uniquement les données de cette app (sauf le drapeau de migration,
// pour ne pas ré-importer les anciennes données partagées)
function clearAppStorage(){['save','settings','profiles','privacy'].forEach(k=>store.del(k));}

// ── i18n state & helpers ──────────────────────────────────────────
function _detectLang(){
  const nav=(navigator.language||navigator.userLanguage||'en').toLowerCase();
  const avail=['en','fr','es','de','it','pt','nl','pl','ru','zh','ja','ko','ar','tr','sv','da','fi','nb'];
  if(avail.includes(nav)) return nav;
  const prefix=nav.split('-')[0];
  if(avail.includes(prefix)) return prefix;
  if(prefix==='no'||prefix==='nn') return 'nb';
  if(prefix==='zh') return 'zh';
  return 'en';
}
let currentLang = 'en';

function t(key){ return (T[currentLang]&&T[currentLang][key]) || T['en'][key] || key; }

function applyLang(code){
  currentLang = code;
  document.documentElement.lang = code;
  const lang = LANGS.find(l=>l.code===code) || LANGS[0];
  // Bouton drapeau
  const btn = document.getElementById('lang-flag-btn');
  if(btn) btn.firstChild.textContent = lang.flag;
  const btnP = document.getElementById('lang-flag-btn-privacy');
  if(btnP) btnP.firstChild.textContent = lang.flag;

  // dir RTL pour arabe
  document.documentElement.setAttribute('dir', code==='ar' ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', code);

  // Setup page
  _setText('logo-sub',            t('appSub'));
  _setText('restore-banner-text', t('restoreTitle')+'<br>'+t('restoreSub'), true);
  _setText('restore-btn-yes',     t('restoreYes'));
  _setText('restore-btn-no',      t('restoreNo'));
  _setLabel('label-presets',      t('labelPresets'));
  _setLabel('label-custom',       t('labelCustom'));
  _setLabel('label-players',      t('labelPlayers'));
  _setLabel('label-start',        t('labelStart'));
  _setLabel('label-gainloss',     t('labelGainLoss'));
  _setLabel('label-endgame',      t('labelEndGame'));
  _setLabel('label-single-winner',    t('labelSingleWinner')||'Fin dès la première victoire');
  _setText('label-single-winner-sub', t('labelSingleWinnerSub')||'Les autres joueurs sont automatiquement perdants');
  _setLabel('label-last-loser',       t('labelLastLoser')||'Dernier joueur perdant');
  _setText('label-last-loser-sub',    t('labelLastLoserSub')||'Le dernier non-vainqueur est automatiquement éliminé');
  _setText('obj-win',             t('btnWin'));
  _setText('obj-elim',            t('btnElim'));
  _setText('obj-none',            t('btnNoLimit'));
  _setPlaceholder('points-custom',t('placeholderOther'));
  _setPlaceholder('objectif-custom',t('placeholderOther'));
  _setAriaLabel('points-custom',t('labelStart'));
  _setAriaLabel('objectif-custom',t('labelEndGame'));
  _checkGoBtn_refresh();
  _setBtnLabel('btn-savedefault',    t('btnSaveDefault'));
  updateRestoreBtn();
  if(!IS_PRO) setTimeout(initLight,0); // gère restore ET clear selon defSaved
  // Names page
  _setText('names-title',         t('namesTitle'));
  _setText('names-sub',           t('namesSub'));
  _setText('btn-shuffle',         t('btnShuffle'));
  _setText('btn-memorize',        t('btnMemorize'));
  _setText('btn-clearnames',      t('btnClear'));
  _setText('names-go-btn',        t('btnLaunch'));
  _setText('btn-clearfields',     t('btnClearFields'));
  _setText('btn-back-names',      t('btnBack'));
  // Game bar
  _setLabel('bar-undo-label',     t('btnUndo'));
  _setLabel('bar-rotate-label',   t('btnRotate'));
  _setLabel('bar-recap-label',    t('btnRecap'));
  _setLabel('bar-theme-label',    t('btnTheme'));
  _setLabel('bar-reset-label',    t('btnReset'));
  // Score modal
  _setText('sign-minus',          t('btnLoss'));
  _setText('sign-plus',           t('btnGain'));
  // Winner modal
  _setText('btn-seerecap',        t('btnSeeRecap'));
  _setText('btn-newgame',         t('btnNewGame'));
  _setText('btn-returnmenu',      t('btnReturnMenu'));
  // Reset modal
  _setText('reset-btn-newgame',   t('btnNewGame'));
  _setText('reset-btn-menu',      t('btnReturnMenu'));
  _setText('reset-btn-back',      t('btnBack')||'Retour au jeu');
  // Elim modal
  _setText('elim-confirm-sub',    t('elimSub'));
  _setText('btn-cancel-elim',     t('btnCancel'));
  _setText('btn-elim-confirm-txt',t('btnConfirm'));
  // Endgame modal
  _setText('endgame-modal-confirm-btn', t('btnConfirm'));
  _setText('endgame-btn-cancel',        t('btnCancel'));
  // Recap
  _setText('recap-title-txt',     t('recapTitle'));
  // Settings
  _setText('settings-title-txt',  t('settingsTitle'));
  _setLabel('label-theme',        t('labelTheme'));
  // Privacy
  _setText('privacy-title-txt',   t('privacyTitle'));
  _setText('privacy-intro',       t('privacyIntro'));
  _setText('privacy-s1t',         t('privacyS1t'));
  _setText('privacy-s1',          t('privacyS1'));
  _setText('privacy-s2t',         t('privacyS2t'));
  _setText('privacy-s2',          t('privacyS2'));
  _setText('privacy-s3t',         t('privacyS3t'));
  _setText('privacy-s3',          t('privacyS3'));
  _setText('privacy-s4t',         t('privacyS4t'));
  _setText('privacy-s4',          t('privacyS4'));
  _setText('privacy-s5t',         t('privacyS5t'));
  _setText('btn-cleardata',       t('btnDeleteData'));
  _setText('privacy-date',        t('privacyDate'));
  _setText('btn-privacy-txt',     t('btnPrivacy'));
  _setText('btn-privacy-accept',   t('btnGotIt'));
  // Libellés accessibles des boutons icône
  _setAriaLabel('btn-theme-gear',     t('ariaTheme'));
  _setAriaLabel('lang-flag-btn',      t('ariaLang'));
  _setAriaLabel('lang-flag-btn-privacy', t('ariaLang'));
  _setAriaLabel('settings-back-btn',  t('ariaBack'));
  _setAriaLabel('privacy-back-btn',   t('ariaBack'));
  _setAriaLabel('recap-close-btn',    t('ariaClose'));
  _setAriaLabel('score-modal-ok',     t('ariaConfirm'));
  _setAriaLabel('score-modal-cancel', t('ariaCancel'));
  ['fin-anim-overlay','win-anim-overlay','elim-anim-overlay'].forEach(id=>_setAriaLabel(id,t('ariaSkipAnim')));
  document.querySelectorAll('.key-btn.del').forEach(b=>b.setAttribute('aria-label',t('ariaDeleteKey')));
  renderThemeGrid();
}
function _setText(id, val, isHtml=false){
  const el=document.getElementById(id); if(!el) return;
  if(isHtml) el.innerHTML=val; else el.textContent=val;
}
function _setBtnLabel(id,v){const el=document.getElementById(id);if(!el)return;const lbl=el.querySelector('.btn-label');if(lbl)lbl.innerHTML=v;else el.textContent=v;}
function _getFooterBtn(e){const t=e?.currentTarget||e?.target;if(!t)return null;return(typeof t.closest==='function'?t.closest('button'):null)||t;}
function initLight(){
  // Joueurs : 1 et 5-12
  document.querySelectorAll('#players-grid .player-chip').forEach(c=>{
    const n=parseInt(c.textContent);
    if(n<2||n>4) _lk(c);
  });
  // Starting points chips : toutes (saisie manuelle uniquement)
  document.querySelectorAll('#start-presets .points-chip').forEach(c=>_lk(c));
  // Victory chips : toutes sauf 0
  document.querySelectorAll('#objectif-presets .points-chip').forEach(c=>{
    if(parseInt(c.dataset.oval??c.textContent)!==0) _lk(c);
  });
  // Fin de jeu : Défaite + No Limit
  _lkAll(['obj-elim','obj-none']);
  // First Win : verrouiller la row entière (pas juste le toggle)
  const _swT=document.getElementById('toggle-single-winner');
  const swRow=_swT&&_swT.closest?_swT.closest('.win-option-row'):null;
  if(swRow) _lk(swRow); else if(_swT) _lk(_swT);
  // Last Loser
  _lkId('row-last-loser');
  // Boutons noms
  setTimeout(()=>_lkAll(['btn-savedefault','btn-shuffle','btn-clearnames']),50);
  // Thème Cyber forcé
  applyTheme('cyber'); selectedTheme='cyber'; settings.theme='cyber';
  saveSettings();
  // Starting points : chips visibles et verrouillées (lk-disabled), saisie manuelle à 20
  const pc=document.getElementById('points-custom');
  if(pc&&!pc.value){pc.value='20'; startPoints=20;}
  // Fin de jeu : forcer Victoire à 0
  if(objectifMode!=='win'){
    selectObjectif('win');
    const c0=document.querySelector('#objectif-presets .points-chip[data-oval="0"]');
    if(c0) c0.click();
    if(c0) _lk(c0);  // chip 0 verrouillée aussi (popup Pro au clic)
  }
}
function updateRestoreBtn(){
  const btnR=document.getElementById('btn-restoredefault');
  const btnC=document.getElementById('btn-cleardefault');
  if(btnR){
    const lbl=btnR.querySelector('.btn-label');
    if(lbl){
      const newLabel=settings.defSaved ? t('btnRestoreDefault') : t('btnNoSaved');
      if(btnR._flashTimer){ btnR._flashOrig=newLabel; }
      else { lbl.innerHTML=newLabel; }
    }
    btnR.classList.toggle('btn-inactive',!settings.defSaved);
  }
  if(btnC){
    btnC.classList.toggle('btn-inactive',!settings.defSaved);
    const lblC=btnC.querySelector('.btn-label');
    if(lblC){const newLabelC=settings.defSaved?t('btnClearDefault'):t('btnNoClear');if(btnC._flashTimer){btnC._flashOrig=newLabelC;}else{lblC.innerHTML=newLabelC;}}
  }
}
function _flashBtnLabel(btn,msg,ms){
  if(!btn)return;
  const lbl=btn.querySelector('.btn-label')||btn;
  if(btn._flashTimer){clearTimeout(btn._flashTimer);}
  if(!btn._flashOrig) btn._flashOrig=lbl.innerHTML;
  lbl.innerHTML=msg;
  btn._flashTimer=setTimeout(()=>{
    const orig=btn._flashOrig;
    btn._flashTimer=null;
    btn._flashOrig=null;
    if(btn.id==='btn-restoredefault') updateRestoreBtn();
    else lbl.innerHTML=orig;
  },ms||1500);
}
function _setLabel(id, val){
  const el=document.getElementById(id); if(!el) return;
  el.textContent=val;
}
function _setPlaceholder(id, val){
  const el=document.getElementById(id); if(!el) return;
  el.placeholder=val;
}
function _setAriaLabel(id, val){
  const el=document.getElementById(id); if(!el) return;
  el.setAttribute('aria-label', val);
}
function _checkGoBtn_refresh(){
  // Re-appliquer le texte du bouton go selon l'état courant
  checkGoBtn();
  // Bouton Lancer sur la page names
  _setText('names-go-btn', t('btnLaunch'));
}

function renderLangDropdown(){
  const dd=document.getElementById('lang-dropdown');
  if(!dd)return;
  dd.innerHTML='';
  LANGS.forEach(l=>{
    const opt=document.createElement('div');
    const _ll=['fr','en','pt'].includes(l.code);
    opt.className='lang-opt'+(l.code===currentLang?' active':'')+(!IS_PRO&&!_ll?' lk-lang':'');_a11yBtn(opt);opt.setAttribute('lang',l.code);
    opt.innerHTML=`<span class="lang-opt-flag">${l.flag}</span><span class="lang-opt-name">${l.name}</span>${l.code===currentLang?'<span class="lang-opt-check">✓</span>':''}`;
    opt.addEventListener('click',e=>{
      e.stopPropagation();
      closeLangDropdown();
      if(l.code===currentLang)return;
      if(!IS_PRO&&!['fr','en','pt'].includes(l.code)){_spop();return;}
      currentLang=l.code;
      settings.lang=l.code;
      saveSettings();
      applyLang(l.code);
      renderPresets();
    });
    dd.appendChild(opt);
  });
}
function toggleLangDropdown(){
  const dd=document.getElementById('lang-dropdown');
  if(!dd)return;
  if(dd.classList.contains('hidden')){
    renderLangDropdown();
    dd.classList.remove('hidden');
    setTimeout(()=>document.addEventListener('click',closeLangDropdownOutside,{once:true}),10);
  } else {
    closeLangDropdown();
  }
}
function closeLangDropdown(){
  document.getElementById('lang-dropdown')?.classList.add('hidden');
}
function closeLangDropdownOutside(e){
  if(!document.getElementById('lang-picker')?.contains(e.target)) closeLangDropdown();
}
function renderLangDropdownPrivacy(){
  const dd=document.getElementById('lang-dropdown-privacy');
  if(!dd)return;
  dd.innerHTML='';
  const ALLOWED=['fr','en','pt'];
  LANGS.forEach(l=>{
    const opt=document.createElement('div');
    const _ll=ALLOWED.includes(l.code);
    opt.className='lang-opt'+(l.code===currentLang?' active':'')+(!IS_PRO&&!_ll?' lk-lang':'');_a11yBtn(opt);opt.setAttribute('lang',l.code);
    opt.innerHTML=`<span class="lang-opt-flag">${l.flag}</span><span class="lang-opt-name">${l.name}</span>${l.code===currentLang?'<span class="lang-opt-check">✓</span>':''}`;
    opt.addEventListener('click',e=>{
      e.stopPropagation();
      closeLangDropdownPrivacy();
      if(l.code===currentLang)return;
      if(!IS_PRO&&!ALLOWED.includes(l.code)){
        // Langue non autorisée : afficher privacy dans la langue choisie puis revenir en FR
        currentLang=l.code;
        applyLang(l.code);
        setTimeout(()=>{
          currentLang='fr';
          settings.lang='fr';
          saveSettings();
          applyLang('fr');
          renderPresets();
        },200);
        return;
      }
      currentLang=l.code;
      settings.lang=l.code;
      saveSettings();
      applyLang(l.code);
    });
    dd.appendChild(opt);
  });
}
function toggleLangDropdownPrivacy(){
  const dd=document.getElementById('lang-dropdown-privacy');
  if(!dd)return;
  if(dd.classList.contains('hidden')){
    renderLangDropdownPrivacy();
    dd.classList.remove('hidden');
    setTimeout(()=>document.addEventListener('click',closeLangDropdownPrivacyOutside,{once:true}),10);
  } else {
    closeLangDropdownPrivacy();
  }
}
function closeLangDropdownPrivacy(){
  document.getElementById('lang-dropdown-privacy')?.classList.add('hidden');
}
function closeLangDropdownPrivacyOutside(e){
  if(!document.getElementById('lang-picker-privacy')?.contains(e.target)) closeLangDropdownPrivacy();
}

const THEMES=[
  {id:'cyber',    nameKey:'themeCyberpunk',  bg:'#020d12',a:'#00ffe0',b:'#00bfff'},
  {id:'dark',     nameKey:'themeDark',       bg:'#0a0a0f',a:'#6c63ff',b:'#a78bfa'},
  {id:'neon-pink',nameKey:'themeNeonPink',   bg:'#0d0010',a:'#ff00cc',b:'#cc00ff'},
  {id:'arcade',   nameKey:'themeArcade',     bg:'#0a0800',a:'#ffdc00',b:'#ff8800'},
  {id:'nature',   nameKey:'themeNature',     bg:'#051208',a:'#50c850',b:'#88dd44'},
  {id:'sunset',   nameKey:'themeSunset',     bg:'#120508',a:'#ff6040',b:'#ffaa00'},
  {id:'ocean',    nameKey:'themeOcean',      bg:'#020810',a:'#0096ff',b:'#00ccff'},
  {id:'gold',     nameKey:'themeGold',       bg:'#0a0800',a:'#ddb800',b:'#ffee44'},
  {id:'sobre',    nameKey:'themeSobre',      bg:'#1c1c1e',a:'#e8e8e8',b:'#a0a0a0'},
  {id:'mono',     nameKey:'themeMono',       bg:'#080808',a:'#ffffff', b:'#aaaaaa'},
  {id:'light',    nameKey:'themeLight',      bg:'#f0f4ff',a:'#3355cc',b:'#5577ee'},
  {id:'mono-light',nameKey:'themeMonoLight', bg:'#ffffff', a:'#000000',b:'#444444'},
  {id:'ldm',      nameKey:'themeLdmNight',   bg:'#2e2418',a:'#f0c040',b:'#ffe070'},
  {id:'ldm-day',  nameKey:'themeLdmDay',     bg:'#f5f0e8',a:'#7a5500',b:'#9e7000'},
];

// Palette joueurs — Okabe-Ito adaptée (daltonisme) : source unique des couleurs de cartes.
// Joueurs 9-12 : mêmes teintes, formes creuses. Une forme par joueur (repère non chromatique).
const COLORS=[
  '#E69F00','#56B4E9','#2FC79A','#F0E442','#FF7A33','#E58FC0','#B9A4FF','#E8E8E8',
  '#E69F00','#56B4E9','#2FC79A','#F0E442',
];
const SHAPES=['●','■','▲','◆','★','✚','⬟','⬢','○','□','△','◇'];
const pColor=i=>COLORS[i%COLORS.length];
const pShape=i=>SHAPES[i%SHAPES.length];
const pName=i=>(players[i]&&players[i].playerName)||(t('player')+' '+(i+1));

// Préréglages de jeux
const GAME_PRESETS=[
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

let numPlayers=0,startPoints=0,maxPoints=Infinity,allowNeg=false;
let elimPoints=null,winPoints=null,objectifMode='none';
let bloquerMode='none';
let singleWinner=false, lastLoser=false;
let rankCounter=0;
let players=[],seatOrder=[],undoStack=[],history=[],actionCounter=0,groupTimers={};
const GROUP_DELAY=1500;
let modalPlayerIdx=-1,modalValue='0',modalSign=1;
const SETTINGS_DEFAULT={theme:'cyber',defPlayers:0,defStart:20,defMax:0,defNeg:false,defObjectifMode:'win',defObjectifVal:0,defSaved:false};
let settings={...SETTINGS_DEFAULT};
let selectedTheme='cyber',defPlayers=0,defStart=-1,defMax=0,defNeg=false;
let elimPending=-1; // index joueur en attente de confirmation d'élimination
let winPending=-1;
let lastGameConfig=null; // réglages de la dernière partie lancée

// ── ÉCHAPPEMENT HTML (prénoms, données stockées) ──────────────────
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ── FORMATAGE ─────────────────────────────────────────────────────
function fmtNum(n){
  if(Math.abs(n)<1000)return String(n);
  return n.toLocaleString('fr-FR');
}

// ── SETTINGS ──────────────────────────────────────────────────────
function loadSettings(){
  const raw=store.get('settings');
  const firstRun=!raw; // dépend de la clé isolée de cette app
  try{const s=JSON.parse(raw||'{}');if(s&&typeof s==='object'&&!Array.isArray(s))settings={...settings,...s};}catch(e){}

  if(firstRun){
    // Première ouverture : thème Dark + preset Loi du Milieu
    settings.theme='dark';
    applyTheme('dark');selectedTheme='dark';
  } else {
    applyTheme(settings.theme||'dark');
    selectedTheme=settings.theme||'dark';
  }

  // Langue persistée
  currentLang = settings.lang || _detectLang();
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

  if(store.get('save')&&restoreGame()){
    return; // reprendre la partie en cours (sauvegarde valide)
  }
  applyDefaults(firstRun);
  updateRestoreBtn();
}
function applyDefaults(firstRun){
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
let selectedPresetIdx = -1;
function applyPreset(idx){
  if(!IS_PRO&&GAME_PRESETS[idx]?.nameKey!=='presetLdm'){_spop();return;}
  const p=GAME_PRESETS[idx];if(!p)return;
  selectedPresetIdx = idx;
  document.querySelectorAll('.preset-card').forEach(c=>c.classList.remove('on'));
  const cards=document.querySelectorAll('.preset-card');
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
function highlightMatchingPreset(){
  const currentVal=getObjectifVal();
  document.querySelectorAll('.preset-card').forEach((card,idx)=>{
    const p=GAME_PRESETS[idx];if(!p)return;
    const match=p.players===numPlayers&&p.start===startPoints&&
      (p.objectifMode||'none')===objectifMode&&
      (p.objectifVal??null)===currentVal&&
      (p.singleWinner||false)===singleWinner&&
      (p.lastLoser||false)===lastLoser;
    card.classList.toggle('on',match);
  });
}
