import { LANGS, T } from './i18n/translations';
import type { LangCode, TranslationKey } from './i18n/translations';
import { checkGoBtn, renderPresets, renderThemeGrid, settings } from './game';
import { $opt } from './dom';
import type { Settings } from './types';

/** Clé de traduction : une clé connue (autocomplétion) ou une clé construite
 *  dynamiquement (`nameKey` des presets et des thèmes) ; `t()` renvoie la clé
 *  elle-même quand elle est inconnue. */
export type TKey = TranslationKey | (string & {});

/** Bouton portant l'état d'un libellé « flash » (`_flashBtnLabel`). */
interface FlashBtn extends HTMLElement {
  _flashTimer?: ReturnType<typeof setTimeout> | null;
  _flashOrig?: string | null;
}

// ── i18n state & helpers ──────────────────────────────────────────
/** Langue du navigateur ; renvoie un code de langue (voir rapport : « no » n'est
 *  pas dans `LangCode`, d'où le type `string`). */
export function _detectLang(): string {
  const nav=(navigator.language||navigator.userLanguage||'en').toLowerCase();
  const avail=['en','fr','es','de','it','pt','nl','pl','ru','zh','ja','ko','ar','tr','sv','da','fi','nb'];
  if(avail.includes(nav)) return nav;
  const prefix=nav.split('-')[0];
  if(avail.includes(prefix)) return prefix;
  if(prefix==='no'||prefix==='nn') return 'nb'; // norvégien : la table est « nb »
  return 'en';
}
export let currentLang: LangCode = 'en';

export function t(key: TKey): string {
  const k = key as TranslationKey; // clé dynamique éventuelle : le repli `|| key` couvre l'absence
  return (T[currentLang]&&T[currentLang][k]) || T['en'][k] || key;
}

/** Numéro de version affiché dans la politique de confidentialité, lu depuis
 *  la source unique <meta name="app-version"> (celle qui invalide le cache du
 *  service worker) : pas de numéro à maintenir séparément à chaque build. */
export function appVersion(): string {
  return document.querySelector('meta[name="app-version"]')?.getAttribute('content') || '';
}

export function applyLang(code: LangCode){
  currentLang = code;
  document.documentElement.lang = code;
  const lang = LANGS.find(l=>l.code===code) || LANGS[0];
  // Bouton drapeau
  const btn = $opt('lang-flag-btn');
  if(btn) (btn.firstChild as ChildNode).textContent = lang.flag;
  const btnP = $opt('lang-flag-btn-privacy');
  if(btnP) (btnP.firstChild as ChildNode).textContent = lang.flag;

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
  _checkGoBtn_refresh();
  _setBtnLabel('btn-savedefault',    t('btnSaveDefault'));
  updateRestoreBtn(); // gère restore ET clear selon defSaved
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
  _setText('privacy-date',        t('privacyDate').replace('{v}', appVersion()));
  _setText('btn-privacy-txt',     t('btnPrivacy'));
  _setText('btn-privacy-accept',   t('btnGotIt'));
  // Accessibilité : libellés accessibles des boutons ne portant qu'une icône
  // ou un symbole (aucun texte visible pour les lecteurs d'écran), traduits
  // avec le reste de l'interface.
  _setAriaLabel('theme-gear-btn',      t('btnTheme'));
  _setAriaLabel('lang-flag-btn',       t('ariaLangPicker'));
  _setAriaLabel('lang-flag-btn-privacy', t('ariaLangPicker'));
  _setAriaLabel('theme-back-btn',      t('ariaBack'));
  _setAriaLabel('privacy-back-btn',    t('ariaBack'));
  _setAriaLabel('dice-faces-minus',    t('ariaDiceFacesPrev'));
  _setAriaLabel('dice-faces-plus',     t('ariaDiceFacesNext'));
  _setAriaLabel('dice-count-minus',    t('ariaDiceCountMinus'));
  _setAriaLabel('dice-count-plus',     t('ariaDiceCountPlus'));
  _setAriaLabel('score-modal-confirm-btn', t('btnConfirm'));
  _setAriaLabel('score-modal-cancel-btn',  t('btnCancel'));
  _setAriaLabel('recap-close-btn',     t('ariaClose'));
  renderThemeGrid();
}
export function _setAriaLabel(id: string, val: string){
  const el=$opt(id); if(!el) return;
  el.setAttribute('aria-label', val);
}
export function _setText(id: string, val: string, isHtml=false){
  const el=$opt(id); if(!el) return;
  if(isHtml) el.innerHTML=val; else el.textContent=val;
}
export function _setBtnLabel(id: string, v: string){const el=$opt(id);if(!el)return;const lbl=el.querySelector('.btn-label');if(lbl)lbl.innerHTML=v;else el.textContent=v;}
export function _getFooterBtn(e?: Event | null): HTMLElement | null {const t=(e?.currentTarget||e?.target) as HTMLElement | null;if(!t)return null;return(typeof t.closest==='function'?t.closest('button'):null)||t;}
export function updateRestoreBtn(){
  const btnR=$opt<FlashBtn>('btn-restoredefault');
  const btnC=$opt<FlashBtn>('btn-cleardefault');
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
export function _flashBtnLabel(btn: FlashBtn | null, msg: string, ms?: number){
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
    else lbl.innerHTML=orig as string; // `_flashOrig` a été posé avant le minuteur
  },ms||1500);
}
export function _setLabel(id: string, val: string){
  const el=$opt(id); if(!el) return;
  el.textContent=val;
}
export function _setPlaceholder(id: string, val: string){
  const el=$opt<HTMLInputElement>(id); if(!el) return;
  el.placeholder=val;
}
export function _checkGoBtn_refresh(){
  // Re-appliquer le texte du bouton go selon l'état courant
  checkGoBtn();
  // Bouton Lancer sur la page names
  _setText('names-go-btn', t('btnLaunch'));
}

export function renderLangDropdown(){
  const dd=$opt('lang-dropdown');
  if(!dd)return;
  dd.innerHTML='';
  LANGS.forEach(l=>{
    const opt=document.createElement('div');
    opt.className='lang-opt'+(l.code===currentLang?' active':'');
    opt.innerHTML=`<span class="lang-opt-flag">${l.flag}</span><span class="lang-opt-name">${l.name}</span>${l.code===currentLang?'<span class="lang-opt-check">✓</span>':''}`;
    opt.addEventListener('click',e=>{
      e.stopPropagation();
      closeLangDropdown();
      if(l.code===currentLang)return;
      currentLang=l.code;
      (settings as Settings).lang=l.code;
      try{localStorage.setItem('scoretrack_settings',JSON.stringify(settings));}catch(err){}
      applyLang(l.code);
      renderPresets();
    });
    dd.appendChild(opt);
  });
}
export function toggleLangDropdown(){
  const dd=$opt('lang-dropdown');
  if(!dd)return;
  if(dd.classList.contains('hidden')){
    renderLangDropdown();
    dd.classList.remove('hidden');
    setTimeout(()=>document.addEventListener('click',closeLangDropdownOutside,{once:true}),10);
  } else {
    closeLangDropdown();
  }
}
export function closeLangDropdown(){
  $opt('lang-dropdown')?.classList.add('hidden');
}
export function closeLangDropdownOutside(e: MouseEvent){
  if(!$opt('lang-picker')?.contains(e.target as Node | null)) closeLangDropdown();
}
export function renderLangDropdownPrivacy(){
  const dd=$opt('lang-dropdown-privacy');
  if(!dd)return;
  dd.innerHTML='';
  LANGS.forEach(l=>{
    const opt=document.createElement('div');
    opt.className='lang-opt'+(l.code===currentLang?' active':'');
    opt.innerHTML=`<span class="lang-opt-flag">${l.flag}</span><span class="lang-opt-name">${l.name}</span>${l.code===currentLang?'<span class="lang-opt-check">✓</span>':''}`;
    opt.addEventListener('click',e=>{
      e.stopPropagation();
      closeLangDropdownPrivacy();
      if(l.code===currentLang)return;
      currentLang=l.code;
      (settings as Settings).lang=l.code;
      try{localStorage.setItem('scoretrack_settings',JSON.stringify(settings));}catch(err){}
      applyLang(l.code);
    });
    dd.appendChild(opt);
  });
}
export function toggleLangDropdownPrivacy(){
  const dd=$opt('lang-dropdown-privacy');
  if(!dd)return;
  if(dd.classList.contains('hidden')){
    renderLangDropdownPrivacy();
    dd.classList.remove('hidden');
    setTimeout(()=>document.addEventListener('click',closeLangDropdownPrivacyOutside,{once:true}),10);
  } else {
    closeLangDropdownPrivacy();
  }
}
export function closeLangDropdownPrivacy(){
  $opt('lang-dropdown-privacy')?.classList.add('hidden');
}
export function closeLangDropdownPrivacyOutside(e: MouseEvent){
  if(!$opt('lang-picker-privacy')?.contains(e.target as Node | null)) closeLangDropdownPrivacy();
}

// Changement de langue depuis un autre module (la liaison d'export est en lecture seule).
// Le code vient de localStorage ou de `_detectLang()` (chaîne libre) : cast vers `LangCode`,
// `t()` retombe sur `en` si la table n'existe pas.
export function setCurrentLang(code: string){ currentLang=code as LangCode; }
