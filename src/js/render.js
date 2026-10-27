// ── RENDER ────────────────────────────────────────────────────────
function renderGame(){
  const wrap=document.getElementById('players-wrap');
  const _focusId=(document.activeElement&&wrap.contains(document.activeElement))?document.activeElement.id:null;
  wrap.innerHTML='';
  wrap.style.visibility='hidden';
  const n=players.length;
  const s=seatOrder;
  let cols,rows,placements;

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
    let cell;
    if(i===-1){
      cell=document.createElement('div');
      cell.style.cssText='background:var(--bg2);overflow:hidden;min-width:0;min-height:0;';
    } else {
      cell=buildCard(i,rot);
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
      const cards=wrap.querySelectorAll('.pcard');
      const ready=[...cards].every(c=>{
        const inner=c.querySelector('.card-inner');
        return inner&&inner.offsetWidth>0&&inner.offsetHeight>0;
      });
      if(ready){
        if(window._barInit) window._barInit();
        _fitCache={};fitTexts();wrap.style.visibility='';
        if(_focusId){const f=document.getElementById(_focusId);if(f)f.focus({preventScroll:true});}
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
function buildCard(pi,rot){
  if(pi===undefined||pi===null||!players[pi])return document.createElement('div');
  const p=players[pi];
  const card=document.createElement('div');card.className=`pcard color-${(pi%COLORS.length)+1} ${rot}${p.eliminated?' elim':''}`;card.id=`card-${pi}`;
  card.style.setProperty('--pc',pColor(pi));
  // Accessibilité : carte focalisable, nom + score annoncés, contrôle clavier
  card.tabIndex=0;card.setAttribute('role','group');card.setAttribute('aria-label',cardLabel(pi));card.setAttribute('aria-description',t('cardHint'));
  p.rot=rot; // mémoriser la rotation pour le modal
  const inner=document.createElement('div');inner.className='card-inner';inner.id=`inner-${pi}`;
  const cls=scoreClass(p.score);
  const shapeHtml=`<span class="pshape" aria-hidden="true">${pShape(pi)}</span>`;
  const nameHtml=p.playerName?`<div class="pplayer">${shapeHtml}${esc(p.playerName)}</div>`:`<div class="pplayer">${shapeHtml}</div>`;
  const zone=document.createElement('div');zone.className='tap-zone';
  zone.innerHTML=`${nameHtml}<div class="score-wrap"><span class="score ${cls}" id="sc-${pi}">${fmtNum(p.score)}</span><span class="delta-flash" id="df-${pi}"></span></div><span class="tap-sign-minus" aria-hidden="true">－</span><span class="tap-sign-plus" aria-hidden="true">＋</span>`;

  const getIsPlus=(e,isTouch)=>{
    const rect=card.getBoundingClientRect();
    const cx=isTouch?e.changedTouches[0].clientX:e.clientX;
    const cy=isTouch?e.changedTouches[0].clientY:e.clientY;
    if(rot==='rot-l')   return(cy-rect.top)>=rect.height/2;
    if(rot==='rot-r')   return(cy-rect.top)<rect.height/2;
    if(rot==='rot-180') return(cx-rect.left)<rect.width/2;
    return(cx-rect.left)>=rect.width/2;
  };

  let holdTimer=null,didHold=false;
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
      let swipeRot;
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
  // Clavier : + / ↑ = +1, - / ↓ = −1, Entrée = saisie manuelle
  card.addEventListener('keydown',e=>{
    if(e.target!==card||e.altKey||e.ctrlKey||e.metaKey)return;
    if(e.key==='+'||e.key==='ArrowUp'){e.preventDefault();adjust(pi,+1,zone);}
    else if(e.key==='-'||e.key==='ArrowDown'){e.preventDefault();adjust(pi,-1,zone);}
    else if(e.key==='Enter'){e.preventDefault();openScoreModal(pi);}
  });

  // Désactiver les interactions pour les cartes hors jeu
  if(p.winner||p.eliminated){
    zone.style.pointerEvents='none';
    // Masquer le delta-flash
    const df=zone.querySelector('.delta-flash');
    if(df)df.style.display='none';
  }

  inner.appendChild(zone);
  if(p.winner&&!p.eliminated){
    const scoreWrap=zone.querySelector('.score-wrap');
    if(scoreWrap)scoreWrap.style.display='none';
    const sm=zone.querySelector('.tap-sign-minus');const sp=zone.querySelector('.tap-sign-plus');
    if(sm)sm.style.display='none';if(sp)sp.style.display='none';
    const dfW=zone.querySelector('.delta-flash');
    if(dfW)dfW.style.display='none';
    const ppW=zone.querySelector('.pplayer');
    if(ppW)ppW.style.display='none'; // masquer le prénom de la zone
    card.classList.add('win');
    const tag=document.createElement('div');tag.className='win-tag';
    const winScore=p.finalScore!==undefined?p.finalScore:null;
    const scoreStr=winScore!==null?`<div class="tag-score">${fmtNum(winScore)}</div>`:'';
    const nameStr=p.playerName?`<div class="elim-name">${esc(p.playerName)}</div>`:'';
    const winnerCount = players.filter(pl=>pl.winner).length;
    const multiWin = winnerCount > 1;
    const modeUnique = !!(singleWinner || (elimPoints!==null && !lastLoser));
    const isChampCard = p.winRank===1 && modeUnique && !multiWin;
    const winIcon = isChampCard ? '🏆' : '🏁';
    const winLabel = isChampCard ? t('winner') : t('finisher');
    const winRankStr=multiWin?`<div class="win-rank">#${esc(p.winRank||'?')}</div>`:'';
    tag.innerHTML=`<div class="win-icon" aria-hidden="true">${winIcon}</div><div class="win-label">${winLabel}</div>${nameStr}${winRankStr}${scoreStr}`;
    inner.appendChild(tag);
  } else if(p.eliminated){
    const scoreWrap=zone.querySelector('.score-wrap');
    if(scoreWrap)scoreWrap.style.display='none';
    const sm=zone.querySelector('.tap-sign-minus');const sp=zone.querySelector('.tap-sign-plus');
    if(sm)sm.style.display='none';if(sp)sp.style.display='none';
    const ppE=zone.querySelector('.pplayer');
    if(ppE)ppE.style.display='none'; // masquer le prénom de la zone
    const tag=document.createElement('div');tag.className='elim-tag';
    const nameStr=p.playerName?`<div class="elim-name">${esc(p.playerName)}</div>`:'';
    const rankStr=p.elimRank?`<div class="elim-rank">#${esc(p.elimRank)}</div>`:'';
    const elimScore=p.finalScore!==undefined?p.finalScore:p.score;
    tag.innerHTML=`<div class="elim-icon" aria-hidden="true">💀</div><div class="elim-label">${t('eliminated')}</div>${nameStr}${rankStr}<div class="tag-score">${fmtNum(elimScore)}</div>`;
    inner.appendChild(tag);
  }
  card.appendChild(inner);return card;
}

// ── ACCESSIBILITÉ : libellés et annonces ──────────────────────────
function cardLabel(i){
  const p=players[i];if(!p)return '';
  const sc=p.finalScore!==undefined&&(p.winner||p.eliminated)?p.finalScore:p.score;
  let l=pName(i)+', '+fmtNum(sc)+' '+t('points');
  if(p.winner)l+=', '+t('winner');else if(p.eliminated)l+=', '+t('eliminated');
  return l;
}
let _announceTimer=null;
function announce(msg){
  const el=document.getElementById('sr-status');if(!el)return;
  el.textContent='';clearTimeout(_announceTimer);
  _announceTimer=setTimeout(()=>{el.textContent=msg;},50);
}
const _reducedMotion=()=>{try{return window.matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){return false;}};

// ── FIT TEXTS ─────────────────────────────────────────────────────
let _fitCache={};
function fitCard(card){
    const isLat=card.classList.contains('rot-l')||card.classList.contains('rot-r');
    const inner=card.querySelector('.card-inner');
    let visH,visW;
    if(isLat&&inner&&inner.offsetWidth>0&&inner.offsetHeight>0){
      const r=inner.getBoundingClientRect();
      visH=r.width;visW=r.height;
    } else {
      const r=card.getBoundingClientRect();
      visH=r.height;visW=r.width;
    }
    if(!visH||!visW||visH<10||visW<10)return;
    const cacheKey=`${visH}x${visW}x${card.querySelector('.score')?.textContent||''}`;
    if(_fitCache[card.id]===cacheKey)return;
    _fitCache[card.id]=cacheKey;

    const usH=visH*0.84,usW=visW*0.84;
    const pl=card.querySelector('.pplayer');
    const sc=card.querySelector('.score');
    const df=card.querySelector('.delta-flash');
    const sm=card.querySelector('.tap-sign-minus');
    const sp=card.querySelector('.tap-sign-plus');
    const ghost=card.querySelector('.pplayer-ghost');

    // Référence = plus petite dimension utile — cohérent avec tous les layouts
    const ref=Math.min(usH,usW);
    // Cap proportionnel au ref — grandes cartes (1-2j) peuvent afficher plus grand
    const cap=Math.min(ref*0.55,180);
    const scoreStr=sc?sc.textContent||'0':'0';
    const nChars=scoreStr.replace(/\s/g,'').length||1;
    const charRatio=nChars<=2?0.52:nChars<=3?0.38:nChars<=4?0.28:nChars<=5?0.22:0.18;
    // Contraindre par la largeur disponible — ratio 0.85 par char (plus conservateur)
    const scoreAvailW=usW*0.78;
    const maxByWidth=scoreAvailW/(nChars*0.85);
    let scoreSz=Math.max(12,Math.min(ref*charRatio,cap,maxByWidth));
    // Vérification après rendu : si le score déborde, réduire itérativement
    if(sc){
      sc.style.fontSize=scoreSz+'px';
      const swrap=sc.closest('.score-wrap')||sc.parentElement;
      const availW=swrap?swrap.offsetWidth*0.90:usW*0.90;
      let tries=0;
      while(sc.scrollWidth>availW&&scoreSz>12&&tries++<12){
        scoreSz=Math.max(12,scoreSz*0.88);
        sc.style.fontSize=scoreSz+'px';
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
    const tag=card.querySelector('.elim-tag,.win-tag');
    if(tag){
      const iconEl=tag.querySelector('.elim-icon,.win-icon');
      const labelEl=tag.querySelector('.elim-label,.win-label');
      const nameEl=tag.querySelector('.elim-name');
      const rankEl=tag.querySelector('.elim-rank,.win-rank');
      const scoreEl=tag.querySelector('.tag-score');
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
function fitTexts(){
  document.querySelectorAll('.pcard').forEach(card=>fitCard(card));
}

// ── FIX LATERAL ───────────────────────────────────────────────────
function fixLateral(){
  _fitCache={};
  document.querySelectorAll('.rot-0 .card-inner,.rot-180 .card-inner').forEach(inner=>{
    const pc=inner.parentElement;const w=pc.offsetWidth,h=pc.offsetHeight;
    if(!w||!h)return;inner.style.width=w+'px';inner.style.height=h+'px';
  });
  document.querySelectorAll('.rot-l .card-inner,.rot-r .card-inner').forEach(inner=>{
    const pc=inner.parentElement;const w=pc.offsetWidth,h=pc.offsetHeight;
    if(!w||!h)return;inner.style.width=h+'px';inner.style.height=w+'px';
  });
}
function onResize(){
  if(document.getElementById('game-screen').style.display==='flex'){
    fixLateral();setTimeout(fitTexts,50);
  }
  // Repositionner le modal s'il est ouvert
  const overlay=document.getElementById('score-modal');
  if(overlay&&!overlay.classList.contains('hidden')&&overlay._modalRot&&modalPlayerIdx>=0&&players[modalPlayerIdx]){
    setTimeout(()=>openScoreModal(modalPlayerIdx,overlay._modalRot),50);
  }
}
let _resizeTimer=null;
window.addEventListener('resize',()=>{clearTimeout(_resizeTimer);_resizeTimer=setTimeout(onResize,150);});
window.addEventListener('orientationchange',()=>setTimeout(onResize,300));
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden && document.getElementById('game-screen').style.display==='flex'){
    fixLateral();setTimeout(fitTexts,50);
  }
});
// Pas d'action supplémentaire sur orientationchange — les modaux g/d gèrent nativement

// ── ADJUST ────────────────────────────────────────────────────────
function adjust(i,delta,zone){
  const p=players[i];if(p.eliminated||p.winner)return;
  const minVal=bloquerMode==='min'?startPoints:(allowNeg||objectifMode==='elim'||objectifMode==='none'?-Infinity:(objectifMode==='win'&&winPoints!==null&&winPoints<startPoints?winPoints:0));
  const capMax=bloquerMode==='max'?startPoints:(maxPoints===Infinity?Infinity:maxPoints);
  const rawScore=p.score+delta; // score brut avant clamp
  const newScore=Math.min(capMax,Math.max(minVal,rawScore));
  const realDelta=newScore-p.score;
  if(realDelta===0){
    flashZone(zone,'flash-neg');
    if(navigator.vibrate)navigator.vibrate([30,20,30]);
    return;
  }
  const rawDelta=rawScore-(newScore-realDelta);
  const _prevScore=p.score, _prevRawScore=p.rawScore; // snapshot AVANT modification
  saveUndo();p.score=newScore;p.rawScore=rawScore;
  window._lastAdjustPrev={playerIdx:i, score:_prevScore, rawScore:_prevRawScore};
  updateDisplay(i,zone,realDelta);
  flashZone(zone,realDelta>0?'flash-pos':'flash-neg');
  logGrouped(i,rawDelta);
}

function scoreClass(score){
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
function updateDisplay(i,zone,delta){
  const p=players[i];
  const sc=document.getElementById(`sc-${i}`);
  if(!sc)return;
  sc.textContent=fmtNum(p.score);
  sc.className='score '+scoreClass(p.score);
  const _card=document.getElementById(`card-${i}`);if(_card)_card.setAttribute('aria-label',cardLabel(i));
  if(delta)announce(pName(i)+' '+(delta>0?'+':'')+fmtNum(delta)+', '+t('total')+' '+fmtNum(p.score)+(scoreClass(p.score)==='crit'?', '+t('srCrit'):''));

  // Invalider le cache de cette carte pour forcer le recalcul du fontSize
  const card=sc.closest('.pcard');
  if(card&&card.id)delete _fitCache[card.id];
  // Refitter uniquement cette carte (immédiat, pas de setTimeout)
  if(card)fitCard(card);

  // Victoire : atteindre winPoints — marquer immédiatement, continuer
  if(winPoints!==null&&!p.eliminated&&!p.winner){
    if((winPoints>=startPoints&&p.score>=winPoints)||(winPoints<startPoints&&p.score<=winPoints)){
      const winnerCount = players.filter(pl=>pl.winner).length;
      // Snapshot AVANT modification — score précédent via undo stack
      const _snapScore=p.score, _snapRawScore=p.rawScore;
      const _snapHistory=history.map(h=>({...h, entries:[...h.entries]}));
      const _snapRankCounter=rankCounter;
      rankCounter++;p.winner=true;p.winRank=winnerCount+1;
      p.finalScore=(p.rawScore!==undefined)?p.rawScore:p.score;
      announce(pName(i)+' : '+t('winner'));

      if(navigator.vibrate)navigator.vibrate([80,40,80,40,120]);

      if(singleWinner){
        const winnerName=p.playerName||(t('player')+' '+(i+1));
        document.getElementById('endgame-modal-icon').textContent='🏆';
        document.getElementById('endgame-modal-title').textContent=winnerName;
        document.getElementById('endgame-modal-sub').textContent=(t('singleWinnerConfirm')||'Fin de partie — les autres joueurs sont perdants. Confirmer ?');
        document.getElementById('endgame-modal').classList.remove('hidden');
        window._pendingEndgame={type:'singleWinner', winnerIdx:i,
          _cancel:()=>{
            p.winner=false; p.winRank=undefined; p.finalScore=undefined;
            rankCounter=_snapRankCounter;
            const prev=window._lastAdjustPrev;
            if(prev&&prev.playerIdx===i){ p.score=prev.score; p.rawScore=prev.rawScore; }
            history.length=0; _snapHistory.forEach(h=>history.push(h));
          }};
        setTimeout(()=>{ renderGame(); },300); // pas de sauvegarde avant confirmation
        return;
      }

      const remaining=players.filter(pl=>!pl.eliminated&&!pl.winner);
      if(remaining.length===1&&lastLoser){
        const loser=remaining[0];
        const loserIdx=players.indexOf(loser);
        const winnerName=p.playerName||(t('player')+' '+(i+1));
        const loserName=loser.playerName||(t('player')+' '+(loserIdx+1));
        document.getElementById('endgame-modal-icon').textContent='🏁';
        document.getElementById('endgame-modal-title').textContent=winnerName;
        document.getElementById('endgame-modal-sub').textContent=loserName+' '+(t('lastLoserConfirm')||'sera désigné perdant. Confirmer ?');
        document.getElementById('endgame-modal').classList.remove('hidden');
        window._pendingEndgame={type:'lastLoser', winnerIdx:i, loserIdx,
          _cancel:()=>{
            p.winner=false; p.winRank=undefined; p.finalScore=undefined;
            rankCounter=_snapRankCounter;
            const prev=window._lastAdjustPrev;
            if(prev&&prev.playerIdx===i){ p.score=prev.score; p.rawScore=prev.rawScore; }
            history.length=0; _snapHistory.forEach(h=>history.push(h));
          }};
        setTimeout(()=>{ renderGame(); },300); // pas de sauvegarde avant confirmation
        return;
      }

      // Lancer l'animation (cas normal sans confirmation)
      // Vérifier si tous les joueurs sont maintenant vainqueurs → fin de partie
      const allDone=players.every(pl=>pl.winner||pl.eliminated);
      if(allDone){
        // Winner-modal à la fin de la dernière animation finisher
        window._afterFinAnim=function(){
          document.getElementById('winner-name').textContent='';
          document.getElementById('winner-sub').textContent='';
          showWinnerModal(false);
          store.del('save');
          window._afterFinAnim=null;
        };
      }
      if(window.playWinAnim) playWinAnim(i);
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
        document.getElementById('elim-confirm-name').textContent=p.playerName||`${t('player')} ${i+1}`;
        document.getElementById('elim-modal').classList.remove('hidden');
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
function elimDirect(i){
  announce(pName(i)+' : '+t('eliminated'));
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
      announce(pName(players.indexOf(alive[0]))+' : '+t('winner'));
      if(alive[0].finalScore===undefined) alive[0].finalScore=alive[0].rawScore!==undefined?alive[0].rawScore:alive[0].score;
      renderGame();
      window._afterWinAnim=function(){
        document.getElementById('winner-name').textContent=t('winner');
        document.getElementById('winner-sub').textContent=(alive[0].playerName||'')+(alive[0].playerName?' · ':'')+fmtNum(alive[0].finalScore)+' pts';
        showWinnerModal(true);
        store.del('save');
        window._afterWinAnim=null;
      };
      if(window.playWinAnim) playWinAnim(players.indexOf(alive[0]));
    }
  };
  if(window.playElimAnim) playElimAnim(i);
  setTimeout(()=>{ renderGame();saveGame(); },300);
}
function confirmElim(){
  document.getElementById('elim-modal').classList.add('hidden');
  if(elimPending<0)return;
  const i=elimPending;elimPending=-1;
  elimDirect(i);
}
function cancelElim(){
  document.getElementById('elim-modal').classList.add('hidden');
  if(elimPending<0)return;
  // Remettre le score à 1 (undo)
  undoLast();
  elimPending=-1;
}

// ── FLASH ─────────────────────────────────────────────────────────
function flashZone(z,cls){z.classList.add(cls);setTimeout(()=>z.classList.remove(cls),200);}
function flashDelta(i,groupSum){
  if(players[i]&&(players[i].winner||players[i].eliminated))return;
  const el=document.getElementById(`df-${i}`);if(!el)return;
  // Glyphe + signe en plus de la couleur (daltonisme) : ▲ gain bleu, ▼ perte orange
  el.textContent=(groupSum>0?'▲ +':groupSum<0?'▼ ':'')+fmtNum(groupSum);
  const _c=groupSum>0?'var(--card-green,var(--green))':'var(--card-red,var(--red))';
  el.style.color=_c;
  el.style.textShadow='0 0 8px '+_c;
  el.classList.remove('go');void el.offsetWidth;el.classList.add('go');
}

// ── LOG GROUPÉ ────────────────────────────────────────────────────
function logGrouped(pi,delta){
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
  groupTimers[pi]=setTimeout(()=>{group.open=false;},GROUP_DELAY);
  saveGame();
}

