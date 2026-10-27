function _spop(){document.getElementById('pro-popup').classList.add('show');}
function _hpop(){document.getElementById('pro-popup').classList.remove('show');}
function _lk(el){
  // Désactive visuellement et remplace les handlers par le popup
  if(!el||el._lkDone)return;
  el._lkDone=true;
  el.classList.add('lk-disabled');
  // lk-locked : pointer-events:auto !important bat tout style inline ultérieur
  el.classList.add('lk-locked');
  // Remplacer onclick inline (desktop)
  el.onclick=(e)=>{e.stopPropagation();_spop();};
  // iOS : ontouchstart mémorise la position, ontouchend vérifie que c'est un tap (pas un swipe)
  el.ontouchstart=(e)=>{
    const t=e.touches[0];
    el._lkTx=t.clientX; el._lkTy=t.clientY;
  };
  el.ontouchend=(e)=>{
    const t=e.changedTouches[0];
    const dx=Math.abs(t.clientX-(el._lkTx||0));
    const dy=Math.abs(t.clientY-(el._lkTy||0));
    if(dx<10&&dy<10){e.preventDefault();e.stopPropagation();_spop();}
  };
}
function _lkId(id){_lk(document.getElementById(id));}
function _lkAll(ids){ids.forEach(_lkId);}
