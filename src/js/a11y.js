// ── ACCESSIBILITÉ : boutons non natifs, modales, clavier ──────────
// div cliquable → rôle bouton, focalisable, Entrée/Espace (gestion déléguée plus bas)
function _a11yBtn(el){
  if(!el)return el;
  if(!el.getAttribute('role'))el.setAttribute('role','button');
  if(!el.hasAttribute('tabindex'))el.tabIndex=0;
  _syncPressed(el);
  return el;
}
const _PRESSABLE='.player-chip,.points-chip,.objectif-chip,.preset-card,.theme-card,.lang-opt';
// Inactif = classe disabled ou pointer-events:none posé en ligne (puces d'objectif en mode « sans limite »)
const _isInactive=el=>el.classList.contains('disabled')||el.style.pointerEvents==='none';
function _syncPressed(el){
  if(!el.matches)return;
  if(el.getAttribute('role')&&el.tagName!=='BUTTON'&&(el.matches(_PRESSABLE)||el.classList.contains('win-option-row'))){
    const off=_isInactive(el);el.tabIndex=off?-1:0;
    if(el.matches(_PRESSABLE))el.setAttribute('aria-disabled',off?'true':'false');
  }
  if(!el.matches(_PRESSABLE))return;
  const on=el.classList.contains('on')||el.classList.contains('selected')||el.classList.contains('active');
  el.setAttribute('aria-pressed',on?'true':'false');
}
// Saisie : message texte + aria-invalid (pas seulement une bordure)
function validateCustomField(inp,re,msgKey){
  const raw=(inp.value||'').trim();
  const bad=(inp.validity&&inp.validity.badInput)||(raw!==''&&!re.test(raw));
  const err=document.getElementById(inp.id+'-err');
  if(bad){inp.setAttribute('aria-invalid','true');if(err)err.textContent=t(msgKey);}
  else{inp.removeAttribute('aria-invalid');if(err)err.textContent='';}
}
function openResetModal(){document.getElementById('reset-modal').classList.remove('hidden');}
function closeResetModal(){document.getElementById('reset-modal').classList.add('hidden');}
(function initA11y(){
  // Entrée / Espace sur les éléments role=button|switch non natifs
  document.addEventListener('keydown',e=>{
    const el=e.target;
    if(!el||!el.getAttribute||el.tagName==='BUTTON'||el.tagName==='INPUT'||el.tagName==='A')return;
    const r=el.getAttribute('role');
    if((r==='button'||r==='switch')&&(e.key==='Enter'||e.key===' ')){
      e.preventDefault();
      if(_isInactive(el))return; // puce désactivée : pas d'activation au clavier
      if(e.key===' '||!e.repeat)el.click();
    }
  });
  // Escape : ferme la modale ouverte via sa fonction d'annulation existante
  const visible=id=>{const el=document.getElementById(id);return el&&!el.classList.contains('hidden');};
  const shown=id=>{const el=document.getElementById(id);return el&&el.style.display&&el.style.display!=='none';};
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    if(document.getElementById('pro-popup')?.classList.contains('show')){_hpop();}
    else if(shown('fin-anim-overlay')){stopFinAnim();}
    else if(shown('win-anim-overlay')){stopWinAnim();}
    else if(shown('elim-anim-overlay')){stopElimAnim();}
    else if(visible('endgame-modal')){cancelEndgame();}
    else if(visible('elim-modal')){cancelElim();}
    else if(visible('score-modal')){closeScoreModal();}
    else if(visible('reset-modal')){closeResetModal();}
    else if(visible('recap')){document.getElementById('recap').classList.add('hidden');}
    else if(!document.getElementById('lang-dropdown')?.classList.contains('hidden')){closeLangDropdown();}
    else if(!document.getElementById('lang-dropdown-privacy')?.classList.contains('hidden')){closeLangDropdownPrivacy();}
    else return;
    e.preventDefault();
  });
  // Saisie clavier dans la modale de score (chiffres, retour arrière)
  document.addEventListener('keydown',e=>{
    if(!visible('score-modal')||e.ctrlKey||e.metaKey||e.altKey)return;
    if(/^[0-9]$/.test(e.key)){e.preventDefault();pressKey(Number(e.key));}
    else if(e.key==='Backspace'){e.preventDefault();pressKey('⌫');}
  });
  // Modales : focus déplacé à l'ouverture, rendu au déclencheur à la fermeture
  const MODALS=['score-modal','winner-modal','reset-modal','elim-modal','endgame-modal','recap','pro-popup'];
  const isOpen=el=>el.id==='pro-popup'?el.classList.contains('show'):!el.classList.contains('hidden');
  const state={};
  // Pile des modales ouvertes (seule la dernière compte) + arrière-plan inert
  const stack=[];let inerted=[];
  // Jamais inert : zone d'annonce, overlays d'animation (ils s'affichent par-dessus), bannière de MAJ
  const NO_INERT=['sr-status','fin-anim-overlay','win-anim-overlay','elim-anim-overlay','update-banner'];
  const topModal=()=>{for(let i=stack.length-1;i>=0;i--){const el=document.getElementById(stack[i]);if(el&&isOpen(el))return el;}return null;};
  function syncInert(){
    inerted.forEach(n=>{n.inert=false;});inerted=[];
    const m=topModal();if(!m)return;
    // Frères de la modale et de chacun de ses ancêtres (jamais un ancêtre lui-même)
    for(let n=m;n&&n.parentElement&&n!==document.body;n=n.parentElement){
      for(const sib of n.parentElement.children){
        if(sib===n||sib.inert||NO_INERT.includes(sib.id)||/^(SCRIPT|STYLE|LINK|META|TEMPLATE)$/.test(sib.tagName))continue;
        sib.inert=true;inerted.push(sib);
      }
    }
  }
  const focusables=m=>[...m.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
    .filter(e=>!e.disabled&&e.tabIndex>=0&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
  // Piège de focus : Tab / Maj+Tab bouclent dans la modale du dessus
  document.addEventListener('keydown',e=>{
    if(e.key!=='Tab'||e.ctrlKey||e.metaKey||e.altKey)return;
    const m=topModal();if(!m)return;
    const f=focusables(m);
    if(!f.length){e.preventDefault();return;}
    const first=f[0],last=f[f.length-1],a=document.activeElement;
    if(!m.contains(a)){e.preventDefault();(e.shiftKey?last:first).focus();}
    else if(e.shiftKey&&a===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&a===last){e.preventDefault();first.focus();}
  });
  const mo=new MutationObserver(muts=>{
    muts.forEach(m=>{
      const el=m.target;
      if(!el.id||!MODALS.includes(el.id)){_syncPressed(el);return;}
      const open=isOpen(el);
      if(open===state[el.id])return;
      state[el.id]=open;
      const i=stack.indexOf(el.id);if(i>=0)stack.splice(i,1);
      if(open){
        const a=document.activeElement;
        el._returnFocus=(a&&a!==document.body&&!el.contains(a))?{el:a,id:a.id}:null;
        stack.push(el.id);syncInert();
        requestAnimationFrame(()=>{
          if(!isOpen(el))return;
          const f=el.querySelector('[data-autofocus]')||el.querySelector('button,[href],input,[tabindex]:not([tabindex="-1"])');
          if(f)f.focus({preventScroll:true});
        });
      } else {
        syncInert(); // retirer inert AVANT de rendre le focus
        const r=el._returnFocus;el._returnFocus=null;
        if(r&&el.contains(document.activeElement)||r&&document.activeElement===document.body){
          let tgt=r.el;
          if(!tgt.isConnected&&r.id)tgt=document.getElementById(r.id);
          if(tgt&&tgt.isConnected&&tgt.offsetParent!==null)tgt.focus({preventScroll:true});
        }
        // Une modale reste ouverte dessous : le focus y retourne s'il est resté dehors
        const t=topModal();
        if(t&&!t.contains(document.activeElement)){const f=focusables(t);if(f.length)f[0].focus({preventScroll:true});}
      }
    });
  });
  MODALS.forEach(id=>{const el=document.getElementById(id);if(el){state[id]=isOpen(el);if(state[id])stack.push(id);mo.observe(el,{attributes:true,attributeFilter:['class']});}});
  syncInert();
  // aria-pressed synchronisé avec les classes on/selected/active des chips
  mo.observe(document.body,{attributes:true,attributeFilter:['class','style'],subtree:true});
})();

(function init(){
  const g=document.getElementById('players-grid');
  for(let i=1;i<=12;i++){
    const d=document.createElement('div');d.className='player-chip';d.textContent=i;_a11yBtn(d);
    d.onclick=()=>{
      document.querySelectorAll('#players-grid .player-chip').forEach(c=>c.classList.remove('on'));
      d.classList.add('on');numPlayers=i;checkGoBtn();
      selectedPresetIdx=-1;
      document.querySelectorAll('.preset-card').forEach(c=>c.classList.remove('on'));
    };
    g.appendChild(d);
  }
  document.querySelectorAll('#start-presets .points-chip').forEach(c=>{c.onclick=()=>{document.querySelectorAll('#start-presets .points-chip').forEach(x=>x.classList.remove('on'));c.classList.add('on');startPoints=parseInt(c.dataset.val);document.getElementById('points-custom').value='';checkGoBtn();selectedPresetIdx=-1;document.querySelectorAll('.preset-card').forEach(x=>x.classList.remove('on'));};});
  document.getElementById('points-custom').addEventListener('input',function(){validateCustomField(this,/^\d+$/,'errStartPoints');});
  document.getElementById('objectif-custom').addEventListener('input',function(){validateCustomField(this,/^-?\d+$/,'errObjectif');});
  // Chips statiques : rôle bouton + clavier
  document.querySelectorAll('#start-presets .points-chip,#objectif-presets .points-chip,.objectif-chip').forEach(_a11yBtn);
  document.getElementById('points-custom').addEventListener('input',function(){document.querySelectorAll('#start-presets .points-chip').forEach(x=>x.classList.remove('on'));selectedPresetIdx=-1;document.querySelectorAll('.preset-card').forEach(c=>c.classList.remove('on'));const v=parseInt(this.value);startPoints=isNaN(v)?-1:v;checkGoBtn();});
  const kp=document.getElementById('modal-keypad');
  [7,8,9,4,5,6,1,2,3,'⌫',0,'00'].forEach(k=>{
    const b=document.createElement('button');b.className='key-btn'+(k==='⌫'?' del':'');b.textContent=k;
    b.addEventListener('touchstart', e => {
      if (e.touches.length > 1 || window._isZooming) return;
      e.preventDefault();
      pressKey(k);
    }, { passive: false });
    b.addEventListener('click',e=>{if(e.isTrusted&&!('ontouchstart' in window))pressKey(k);});kp.appendChild(b);
  });
  document.getElementById('objectif-custom').addEventListener('input',()=>{selectedPresetIdx=-1;document.querySelectorAll('.preset-card').forEach(c=>c.classList.remove('on'));
    document.querySelectorAll('#objectif-presets .points-chip').forEach(c=>c.classList.remove('on'));
    checkGoBtn();
  });
  document.getElementById('objectif-custom').disabled=true;
  document.getElementById('objectif-custom').placeholder='—';
  document.querySelectorAll('#objectif-presets .points-chip').forEach(c=>{if(!c._lkDone){c.style.pointerEvents='none';c.style.opacity='0.25';}});
  loadSettings();
  setTimeout(()=>{
    const s=document.getElementById('splash');
    s.classList.add('hidden');
    setTimeout(()=>s.remove(),500);
  },400);
})();
