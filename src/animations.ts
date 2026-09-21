import { t } from './i18n';
import { cancelElim, cancelEndgame, closeScoreModal, elimPoints, fmtNum, lastLoser, players, singleWinner } from './game';
import { closeDice } from './dice-ui';
import { $, $opt } from './dom';
import type { Player } from './types';

// Publiées par les IIFE ci-dessous (assignées à l'exécution, exportées comme liaisons vivantes).
export let playElimAnim: (playerIdx:number)=>void;
export let stopFinAnim: ()=>void;
export let playFinAnim: (playerIdx:number)=>void;
export let playWinAnim: (playerIdx:number)=>void;

/** Identifiant de requestAnimationFrame (null quand aucune trame n'est planifiée). */
type RafId = number | null;
/** Identifiant de setTimeout. */
type TimerId = ReturnType<typeof setTimeout>;
/** Couleur RVB (composantes 0..255). */
type RGB = [number, number, number];

// ── ANIMATION ÉLIMINATION ─────────────────────────────────────────
(function(){
  function easeInOut(t:number):number{ return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2; }
  function easeOut(t:number):number  { return 1-Math.pow(1-t,3); }

  // Rotation des textes selon la rotation de la carte
  const ROT_DEG: Record<string, number> = {'rot-0':0,'rot-180':180,'rot-l':90,'rot-r':-90};

  // Courbe taille : vitesse constante + 2 reculs
  interface Pullback { atSize:number; to:number; frames:number }
  const PULLBACKS: Pullback[]=[{atSize:0.28,to:0.10,frames:120},{atSize:0.55,to:0.22,frames:120}];
  function buildCurve(steps:number): Float32Array {
    const curve=new Float32Array(steps);
    const speed=1.0/(steps-PULLBACKS.reduce((s,p)=>s+p.frames,0));
    let size=0,pbIdx=0,inPB=false,pbFrom=0,pbTo=0,pbFrames=0,pbProg=0;
    for(let i=0;i<steps;i++){
      if(!inPB&&pbIdx<PULLBACKS.length&&size>=PULLBACKS[pbIdx].atSize){
        inPB=true;pbFrom=size;pbTo=PULLBACKS[pbIdx].to;
        pbFrames=PULLBACKS[pbIdx].frames;pbProg=0;pbIdx++;
      }
      if(inPB){
        pbProg++;
        curve[i]=pbFrom+(pbTo-pbFrom)*easeInOut(pbProg/pbFrames);
        if(pbProg>=pbFrames){size=pbTo;inPB=false;}
      } else { size+=speed; curve[i]=Math.min(size,1); }
    }
    return curve;
  }

  // Noise : remplacé par animation CSS (plus léger)
  function startNoise(totalDuration:number): void {
    const canvas=$<HTMLCanvasElement>('elim-anim-noise');
    const ctx=canvas.getContext('2d')!;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // Effet CSS via la classe — pas de manipulation pixel JS
    canvas.style.animation='elimNoisePulse '+totalDuration+'ms ease forwards';
    setTimeout(()=>{ canvas.style.animation=''; },totalDuration+100);
  }

  // Fragments — dessinés sur canvas (plus de divs DOM)
  /** Fragment (tête de mort) projeté à l'explosion du crâne. */
  interface Frag { cx:number; cy:number; angle:number; speed:number; rotDir:number; sz:number; startT:number }
  let frags: Frag[]=[], fragCanvas: HTMLCanvasElement|null=null, fragCtx: CanvasRenderingContext2D|null=null, fragRAF: RafId=null;
  function spawnFragments(cx:number,cy:number,rotDeg:number): void {
    frags=[];
    fragCanvas=$<HTMLCanvasElement>('elim-anim-noise');
    fragCanvas.width=window.innerWidth; fragCanvas.height=window.innerHeight;
    fragCtx=fragCanvas.getContext('2d');
    fragCanvas.style.animation='';
    fragCanvas.style.opacity='1';
    const rotRad=(rotDeg||0)*Math.PI/180;
    const N=28;
    for(let i=0;i<N;i++){
      const angle=(i/N)*Math.PI*2+(Math.random()-0.5)*0.6+rotRad;
      const speed=40+Math.random()*420;
      const rotDir=(Math.random()-0.5)*720;
      const sz=20+Math.random()*18;
      frags.push({cx,cy,angle,speed,rotDir,sz,startT:performance.now()});
    }
  }
  /** Petit crâne vectoriel dessiné à l'origine courante du contexte (déjà
   *  translaté/pivoté par l'appelant) — remplace l'ancien `fillText(...)`
   *  de l'émoji tête de mort (rendu non maîtrisé selon la plateforme,
   *  P1 #7). Simplifié à dessein
   *  pour un fragment minuscule qui tourne et s'estompe en 3 s (silhouette
   *  cohérente avec `ICON_SKULL` de `src/ui-icons.ts` — tête ronde, orbites,
   *  nez — sans reprendre son détail de mâchoire dentée, superflu à cette
   *  taille et cette vitesse) : voir docs/audit/DECISIONS-H.md §11 (round 3,
   *  H-critique-round2.md). Encre blanche + orbites/nez sombres pleins
   *  (pas de trou transparent façon `evenodd`) : reste lisible quel que
   *  soit ce qu'il y a derrière un fragment qui vole en tous sens, sans
   *  dépendre d'un fond particulier. */
  function drawFragSkull(ctx:CanvasRenderingContext2D, sz:number): void {
    const r=sz*0.5;
    ctx.fillStyle='#ffffff';
    ctx.beginPath(); ctx.arc(0,-r*0.08,r,0,Math.PI*2); ctx.fill();
    ctx.fillRect(-r*0.82,-r*0.08,r*1.64,r*0.72);
    ctx.fillStyle='#1a1a1a';
    ctx.beginPath(); ctx.arc(-r*0.4,-r*0.12,r*0.26,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(r*0.4,-r*0.12,r*0.26,0,Math.PI*2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r*0.13,r*0.16); ctx.lineTo(r*0.13,r*0.16); ctx.lineTo(0,r*0.48);
    ctx.closePath(); ctx.fill();
  }
  function animateFragments(): void {
    if(!fragCtx) return;
    const now=performance.now();
    // fragCanvas est toujours posé en même temps que fragCtx (spawnFragments)
    fragCtx.clearRect(0,0,fragCanvas!.width,fragCanvas!.height);
    let alive=false;
    // (fragCtx! : le rétrécissement de la garde ci-dessus ne se propage pas dans la fermeture)
    frags.forEach(f=>{
      const t=Math.min((now-f.startT)/3000,1);
      if(t>=1) return;
      alive=true;
      const dx=Math.cos(f.angle)*f.speed*easeOut(t);
      const dy=Math.sin(f.angle)*f.speed*easeOut(t);
      const sz=f.sz*(1-t*0.3);
      const alpha=1-Math.pow(t,1.5)*0.9;
      fragCtx!.save();
      fragCtx!.globalAlpha=alpha;
      fragCtx!.translate(f.cx+dx, f.cy+dy);
      fragCtx!.rotate(f.rotDir*t*Math.PI/180);
      drawFragSkull(fragCtx!, sz);
      fragCtx!.restore();
    });
    fragCtx.globalAlpha=1;
    if(alive){ fragRAF=requestAnimationFrame(animateFragments); }
    else{
      fragCtx.clearRect(0,0,fragCanvas!.width,fragCanvas!.height);
      frags=[]; fragRAF=null;
    }
  }

  // Timers et RAF
  let pending: TimerId[]=[], animRAF: RafId=null;
  function clearAll(): void {
    pending.forEach(id=>clearTimeout(id)); pending=[];
    if(animRAF){cancelAnimationFrame(animRAF);animRAF=null;}
    if(fragRAF){cancelAnimationFrame(fragRAF);fragRAF=null;}
    const canvas_noise=$opt<HTMLCanvasElement>('elim-anim-noise');
    if(canvas_noise){ canvas_noise.style.animation=''; if(fragCtx) fragCtx.clearRect(0,0,canvas_noise.width,canvas_noise.height); }
    frags=[];
  }

  function resetTexts(): void {
    const name =$('elim-anim-name');
    const msg  =$('elim-anim-msg');
    const score=$('elim-anim-score');
    [name,msg,score].forEach(el=>{
      el.style.transition='none'; el.style.opacity='0';
    });
    name.style.transform='scale(0.85)';
    msg.style.transform='translateY(8px)';
    score.style.transform='translateY(8px)';
  }

  function showTexts(): void {
    [{id:'elim-anim-name',delay:0},{id:'elim-anim-msg',delay:130},{id:'elim-anim-score',delay:260}]
    .forEach(({id,delay})=>{
      const tid=setTimeout(()=>{
        const el=$(id);
        el.style.transition='opacity 0.4s ease, transform 0.4s ease';
        el.style.opacity='1'; el.style.transform='none';
      },delay);
      pending.push(tid);
    });
  }

  const T_GROW=1800,T_FLASH=1950,T_TEXT=1950,T_FADE=4400,T_TOTAL=5000;
  function maxSize(): number { return Math.min(window.innerWidth,window.innerHeight)*1.60; }

  /** Retire les propriétés CSSOM individuelles muées pendant l'animation
   *  (fontSize/opacity/filter/transform), pour retomber sur les valeurs de
   *  la règle CSS #elim-anim-skull (css/app.css) — remplace l'ancien
   *  `skull.style.cssText=''`. Simplification de code (moins de propriétés
   *  à réaffecter au repos, cohérente avec la nouvelle règle CSS externe),
   *  PAS une exigence de la CSP : `style-src-attr 'unsafe-inline'`
   *  (vercel.json) autorise indifféremment `cssText=`/`setAttribute('style',…)`
   *  et les affectations de propriété individuelles — vérifié en pratique,
   *  voir docs/audit/BRIEF.md (fermeture de dette style-src). */
  function _resetSkullStyle(el: HTMLElement): void {
    el.style.fontSize=''; el.style.opacity=''; el.style.filter=''; el.style.transform='';
  }

  // Point d'entrée — appelé depuis elimDirect
  playElimAnim = function(playerIdx:number): void {
    clearAll();
    const p: Player = players[playerIdx];
    const cardEl  = $opt('card-'+playerIdx);
    // Rotation depuis la classe CSS de la carte (rot-0, rot-180, rot-l, rot-r)
    let rot = 'rot-0';
    if(cardEl){
      const match = cardEl.className.match(/rot-[^\s]+/);
      if(match) rot = match[0];
    }
    const rotDeg  = ROT_DEG[rot] || 0;
    const name    = p.playerName || (t('player')+' '+(playerIdx+1));
    const score = fmtNum(p.finalScore!==undefined ? p.finalScore : p.score);

    // Textes
    $('elim-anim-name').textContent  = name;
    $('elim-anim-msg').textContent   = t('elimAnimMsg')||'TU AS ÉCHOUÉ';
    $('elim-anim-score').textContent = score+' pts';

    // Rotation des textes selon la carte
    $('elim-anim-texts').style.transform = `rotate(${rotDeg}deg)`;

    resetTexts();

    // Origine du clip-path = centre de la carte
    const overlay = $('elim-anim-overlay');
    const skull   = $('elim-anim-skull');


    overlay.style.animation='';
    overlay.style.opacity='1';
    overlay.style.clipPath='';
    overlay.style.transition='none';
    overlay.style.display='flex';
    // position/z-index/line-height/transform-origin/font-size de départ/couleur
    // déjà posés par la règle CSS #elim-anim-skull (css/app.css) : seules les
    // propriétés réellement dynamiques sont mutées ici, par souci de
    // simplicité (moins de duplication avec la CSS) — la CSP
    // (`style-src-attr 'unsafe-inline'`, vercel.json) autorise de toute
    // façon aussi bien ceci que l'ancienne affectation `cssText=`, vérifié
    // en pratique (voir docs/audit/BRIEF.md, fermeture de dette style-src).
    skull.style.fontSize='4px';
    skull.style.opacity='1';
    skull.style.filter='none';
    skull.style.transform=`rotate(${rotDeg}deg)`;

    const curve   = buildCurve(1800);
    const startT  = performance.now();
    let fragSpawned=false, textShown=false, fadeDone=false;

    startNoise(T_TOTAL);

    function frame(now:number): void {
      const e=now-startT;

      if(e<T_GROW){
        const idx=Math.min(Math.floor((e/T_GROW)*curve.length),curve.length-1);
        const sz=curve[idx]*maxSize();
        skull.style.fontSize=Math.max(4,sz)+'px';
        skull.style.opacity='1';
        skull.style.filter=`drop-shadow(0 0 ${sz*0.02}px rgba(255,122,0,1))`;
        skull.style.transform=`rotate(${rotDeg}deg)`;

      } else if(e<T_FLASH){
        const ft=(e-T_GROW)/(T_FLASH-T_GROW);
        skull.style.fontSize=(maxSize()*(1+ft*0.08))+'px';
        skull.style.filter=`drop-shadow(0 0 40px rgba(255,255,255,${ft})) brightness(${1+ft*5})`;
        skull.style.opacity=String(1-ft);
        skull.style.transform=`rotate(${rotDeg}deg)`;
        if(!fragSpawned&&ft>0.4){
          fragSpawned=true;
          const r=skull.getBoundingClientRect();
          spawnFragments(r.left+r.width/2, r.top+r.height/2, rotDeg);
          requestAnimationFrame(animateFragments);
        }
      } else {
        skull.style.opacity='0';
      }

      if(e>=T_TEXT&&!textShown){ textShown=true; showTexts(); }

      if(e>=T_FADE&&!fadeDone){
        fadeDone=true;
        overlay.style.transition='none';
        overlay.style.animation='elimFadeOut 0.6s ease forwards';
        const tid=setTimeout(()=>{
          overlay.style.animation='';
          overlay.style.display='none';
          overlay.style.clipPath='';
          overlay.style.transition='';
          _resetSkullStyle(skull);
          frags=[];
          resetTexts();
          if(window._afterElimAnim) window._afterElimAnim();
        },650);
        pending.push(tid);
      }

      animRAF = e<T_TOTAL+100 ? requestAnimationFrame(frame) : null;
    }
    animRAF=requestAnimationFrame(frame);
  };

  window._stopElimAnim = function(): void {
    clearAll();
    const ov=$opt('elim-anim-overlay');
    if(ov){ ov.style.animation=''; ov.style.display='none'; ov.style.clipPath=''; ov.style.transition=''; }
    const skull=$opt('elim-anim-skull');
    if(skull) _resetSkullStyle(skull);
    if(window._afterElimAnim) window._afterElimAnim();
  };
})();

// ── STOP ANIMATIONS ───────────────────────────────────────────────
export function stopWinAnim(): void {
  if(window._stopWinAnim) window._stopWinAnim();
}
export function stopElimAnim(): void {
  if(window._stopElimAnim) window._stopElimAnim();
}

// ── ANIMATION FINISHER ────────────────────────────────────────────
(function(){
var _FIN_GLOWS=['rgba(0,255,224,0.7)','rgba(255,100,0,0.7)','rgba(180,100,255,0.7)',
                'rgba(255,220,0,0.7)','rgba(255,80,120,0.7)'];
/** Bolide de la course : halo (rgba) et vitesse. Round 3 (H-critique-round2.md,
 *  P1 nouveau) : le champ `e` (emoji du bolide, jamais utilisé qu'en filet de
 *  secours si le rendu vectoriel ci-dessous était indisponible) est retiré —
 *  le rendu vectoriel (`_finDrawFlag`-like, voir plus bas) est désormais
 *  toujours utilisé, voir l'ancien indicateur de détection de secours
 *  (retiré) plus bas. */
interface FinRacer { g:string; s:number }
/** Bolide en piste : position et décalage vertical en plus. */
interface FinMoto extends FinRacer { x:number; oY:number; /** posé à chaque trame (_finFrame) */ y?:number }
var _FIN_RACERS: FinRacer[]=[
  {g:_FIN_GLOWS[0],s:6.75},
  {g:_FIN_GLOWS[1],s:6.0},
  {g:_FIN_GLOWS[2],s:7.35},
  {g:_FIN_GLOWS[3],s:6.375},
  {g:_FIN_GLOWS[4],s:5.625},
  {g:_FIN_GLOWS[0],s:6.9},
  {g:_FIN_GLOWS[3],s:6.6},
];
var _FIN_CONF_COLORS=['#ff4466','#ffd700','#00ffe0','#ff8800','#cc66ff','#ffffff','#66ff88'];

function _finDrawFlag(ctx:CanvasRenderingContext2D,px:number,py:number,t:number,sz:number): void {
  ctx.save(); ctx.translate(px,py);
  ctx.strokeStyle='rgba(200,200,200,0.8)'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,sz*0.85); ctx.stroke();
  var cols=6,rows=4,cw=sz/cols,ch=(sz*0.55)/rows;
  for(var r=0;r<rows;r++) for(var c=0;c<cols;c++){
    var amp=c/cols*cw*0.8, wave=Math.sin(t*5+c*0.7)*amp;
    var x=c*cw, y=-sz*0.55+r*ch+wave;
    var nx=(c+1)*cw, ny=-sz*0.55+r*ch+Math.sin(t*5+(c+1)*0.7)*((c+1)/cols*cw*0.8);
    ctx.beginPath();
    ctx.moveTo(x,y); ctx.lineTo(nx,ny); ctx.lineTo(nx,ny+ch); ctx.lineTo(x,y+ch);
    ctx.closePath();
    ctx.fillStyle=(r+c)%2===0?'rgba(255,255,255,0.95)':'rgba(10,10,10,0.95)';
    ctx.fill();
  }
  ctx.restore();
}

/** Confetti du finisher. */
interface FinConfetti { x:number; y:number; vx:number; vy:number; rot:number; rotV:number; w:number; h:number; col:string; life:number; decay:number }
var _finConfetti: FinConfetti[]=[];
function _finSpawnConfetti(W:number): void {
  _finConfetti.push({
    x:Math.random()*W, y:-20,
    vx:(Math.random()-0.5)*2, vy:1.5+Math.random()*2,
    rot:Math.random()*Math.PI*2, rotV:(Math.random()-0.5)*0.2,
    w:6+Math.random()*8, h:4+Math.random()*5,
    col:_FIN_CONF_COLORS[Math.floor(Math.random()*_FIN_CONF_COLORS.length)],
    life:1, decay:0.004+Math.random()*0.003
  });
}
function _finDrawConfetti(ctx:CanvasRenderingContext2D,W:number,H:number): void {
  if(Math.random()<0.18) _finSpawnConfetti(W);
  for(var i=_finConfetti.length-1;i>=0;i--){
    var c=_finConfetti[i];
    c.x+=c.vx; c.y+=c.vy; c.vy+=0.04;
    c.rot+=c.rotV; c.life-=c.decay;
    if(c.y>H+20||c.life<=0){_finConfetti.splice(i,1);continue;}
    ctx.save();
    ctx.globalAlpha=c.life*0.85;
    ctx.translate(c.x,c.y); ctx.rotate(c.rot);
    ctx.fillStyle=c.col;
    ctx.fillRect(-c.w/2,-c.h/2,c.w,c.h);
    ctx.restore();
  }
  ctx.globalAlpha=1;
}

/** Étincelle derrière un bolide (g = halo rgba du bolide). */
interface FinSpark { x:number; y:number; vx:number; vy:number; life:number; decay:number; g:string }
var _finSparks: FinSpark[]=[];
function _finSpawnSpark(x:number,y:number,g:string): void {
  var a=Math.PI*0.5+Math.PI*(0.3+Math.random()*0.4), s=1+Math.random()*3;
  _finSparks.push({x:x,y:y,vx:Math.cos(a)*s-1.5,vy:Math.sin(a)*s,
    life:1,decay:0.07+Math.random()*0.04,g:g});
}
function _finDrawSparks(ctx:CanvasRenderingContext2D): void {
  for(var i=_finSparks.length-1;i>=0;i--){
    var s=_finSparks[i]; s.x+=s.vx; s.y+=s.vy; s.vy+=0.2; s.life-=s.decay;
    if(s.life<=0){_finSparks.splice(i,1);continue;}
    var rgb=s.g.match(/[\d.]+/g)!; // les halos sont des rgba(...) littéraux : toujours 4 nombres
    ctx.beginPath(); ctx.arc(s.x,s.y,Math.max(0,2.5*s.life),0,Math.PI*2);
    ctx.fillStyle='rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+','+s.life+')'; ctx.fill();
  }
}

function _finSetEl(id:string,opacity:number,transform?:string,transition?:string): void {
  var el=$opt(id); if(!el)return;
  el.style.transition=transition||'none'; el.style.opacity=String(opacity);
  if(transform!==undefined) el.style.transform=transform;
}
function _finResetTexts(): void {
  _finSetEl('fin-anim-name', 0,'scale(0.5)');
  _finSetEl('fin-anim-msg',  0,'translateY(12px)');
  _finSetEl('fin-anim-score',0,'translateY(12px)');
}

// Overlay / contexte du fondu : posés dans _finFrame avant la première trame de fondu
// (null! : pas de garde à l'exécution, comme en JS).
var _finFStart=0,_finFOverlay: HTMLElement=null!,_finFCtx: CanvasRenderingContext2D=null!,_finFW=0,_finFH=0;
function _finFadeFrame(now:number): void {
  var ft=Math.min((now-_finFStart)/600,1);
  _finFOverlay.style.opacity=String(1-ft);
  if(ft<1){ requestAnimationFrame(_finFadeFrame); }
  else{
    _finFOverlay.style.display='none'; _finFOverlay.style.opacity='1';
    _finFCtx.clearRect(0,0,_finFW,_finFH);
    _finSparks.length=0; _finConfetti.length=0; _finResetTexts();
    if(window._afterFinAnim) window._afterFinAnim();
  }
}

// Overlay, canvas et contexte : posés dans playFinAnim avant la première trame
// (null! : pas de garde à l'exécution, comme en JS).
var _finRAF: RafId=null, _finOverlay: HTMLElement=null!, _finCanvas: HTMLCanvasElement=null!, _finCtx: CanvasRenderingContext2D=null!;
var _finStartT=0, _finRot=0, _finFlagWave=0, _finMotos: FinMoto[]=[];
var _finShown0=false, _finShown1=false, _finShown2=false, _finFadeDone=false;
var _FIN_T0=1600, _FIN_T1=1800, _FIN_T2=1950, _FIN_TFADE=4600, _FIN_TTOTAL=5200;

function _finFrame(now:number): void {
  var e=now-_finStartT;
  var W=_finCanvas.width, H=_finCanvas.height;
  _finCtx.fillStyle='rgba(0,0,0,0.94)';
  _finCtx.fillRect(0,0,W,H);
  _finCtx.save();
  _finCtx.translate(W/2,H/2);
  _finCtx.rotate(_finRot*Math.PI/180);
  _finCtx.translate(-W/2,-H/2);
  var motoSz=Math.min(W,H)*0.15;
  var diag=Math.ceil(Math.sqrt(W*W+H*H));
  // Piste dans la moitié basse — textes dans la moitié haute
  var trackY=H*0.72;
  var flagSz=Math.min(W,H)*0.16;
  // Ligne de piste — de -diag à diag pour couvrir paysage et portrait
  _finCtx.save();
  _finCtx.strokeStyle='rgba(255,255,255,0.08)';
  _finCtx.lineWidth=motoSz*0.8;
  _finCtx.beginPath(); _finCtx.moveTo(-diag,trackY); _finCtx.lineTo(W*0.93,trackY); _finCtx.stroke();
  _finCtx.restore();
  for(var i=0;i<_finMotos.length;i++){
    var m=_finMotos[i];
    var accel=e<500?m.s*(e/500):m.s;
    m.x+=accel; m.y=trackY+m.oY+Math.sin(e*0.013+i)*2;
    if(m.x>diag+motoSz) m.x=-diag-motoSz;
    if(Math.random()<0.08) _finSpawnSpark(m.x-motoSz*0.3, m.y+motoSz*0.2, m.g);
    var rgb=m.g.match(/[\d.]+/g)!; // halo rgba(...) littéral : toujours 4 nombres
    var tLen=motoSz*1.6, tH=motoSz*0.07, tX=m.x-motoSz*0.8;
    var grad=_finCtx.createLinearGradient(tX,m.y,tX-tLen,m.y);
    grad.addColorStop(0,'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',0.7)');
    grad.addColorStop(1,'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',0)');
    _finCtx.save(); _finCtx.fillStyle=grad;
    _finCtx.fillRect(tX-tLen, m.y-tH/2, tLen, tH);
    _finCtx.restore();
    // Voiture : F1 vectorielle (round 3, H-critique-round2.md, P1 nouveau —
    // le filet de secours emoji est retiré, ce chemin vectoriel déjà présent
    // et soigné est désormais toujours utilisé, l'ancien indicateur de
    // détection de secours étant supprimé).
    _finCtx.save();
    _finCtx.translate(m.x,m.y); _finCtx.scale(-1,1);
    {
      var cw=motoSz*1.1, ch=motoSz*0.32;
      var r=rgb[0],g=rgb[1],b=rgb[2];
      var col='rgba('+r+','+g+','+b+',';

      // Aileron arrière (gauche — on est scale(-1,1))
      _finCtx.fillStyle=col+'0.9)';
      _finCtx.beginPath();
      _finCtx.moveTo(-cw*0.52, -ch*0.15);
      _finCtx.lineTo(-cw*0.52, -ch*0.45);
      _finCtx.lineTo(-cw*0.35, -ch*0.45);
      _finCtx.lineTo(-cw*0.38, -ch*0.15);
      _finCtx.closePath(); _finCtx.fill();
      // Aileron arrière — lame horizontale
      _finCtx.fillStyle=col+'1)';
      _finCtx.fillRect(-cw*0.58,-ch*0.48, cw*0.28, ch*0.09);

      // Carrosserie principale — profil F1 profilé
      var gCar=_finCtx.createLinearGradient(0,-ch*0.6,0,ch*0.35);
      gCar.addColorStop(0,'rgba('+r+','+g+','+b+',1)');
      gCar.addColorStop(0.5,'rgba('+Math.min(255,+r+60)+','+Math.min(255,+g+60)+','+Math.min(255,+b+60)+',1)');
      gCar.addColorStop(1,'rgba('+r+','+g+','+b+',0.8)');
      _finCtx.fillStyle=gCar;
      _finCtx.beginPath();
      // Bas de caisse plat
      _finCtx.moveTo(-cw*0.52, ch*0.28);
      // Nez pointu avant (droite)
      _finCtx.bezierCurveTo(-cw*0.1,ch*0.28, cw*0.3,ch*0.22, cw*0.55,ch*0.05);
      // Pointe du nez
      _finCtx.lineTo(cw*0.55, -ch*0.05);
      // Dessus carrosserie profilé
      _finCtx.bezierCurveTo(cw*0.3,-ch*0.22, cw*0.0,-ch*0.52, -cw*0.18,-ch*0.52);
      _finCtx.bezierCurveTo(-cw*0.3,-ch*0.52, -cw*0.52,-ch*0.3, -cw*0.52,-ch*0.1);
      _finCtx.closePath(); _finCtx.fill();

      // Cockpit ouvert
      _finCtx.fillStyle='rgba(8,12,20,0.92)';
      _finCtx.beginPath();
      _finCtx.ellipse(cw*0.0,-ch*0.28, cw*0.18,ch*0.2, 0,0,Math.PI*2);
      _finCtx.fill();
      // Casque pilote
      _finCtx.fillStyle='rgba(220,220,240,0.85)';
      _finCtx.beginPath();
      _finCtx.ellipse(cw*0.02,-ch*0.3, cw*0.1,ch*0.13, -0.15,0,Math.PI*2);
      _finCtx.fill();
      // Visière
      _finCtx.fillStyle='rgba(80,160,255,0.6)';
      _finCtx.beginPath();
      _finCtx.ellipse(cw*0.06,-ch*0.28, cw*0.07,ch*0.07, -0.2,0,Math.PI);
      _finCtx.fill();

      // Reflet carrosserie
      _finCtx.fillStyle='rgba(255,255,255,0.18)';
      _finCtx.beginPath();
      _finCtx.moveTo(-cw*0.1,-ch*0.5);
      _finCtx.bezierCurveTo(cw*0.1,-ch*0.45, cw*0.3,-ch*0.18, cw*0.35,-ch*0.02);
      _finCtx.bezierCurveTo(cw*0.25,-ch*0.05, cw*0.05,-ch*0.28, -cw*0.08,-ch*0.5);
      _finCtx.closePath(); _finCtx.fill();

      // Aileron avant — lame
      _finCtx.fillStyle=col+'1)';
      _finCtx.fillRect(cw*0.38, ch*0.04, cw*0.22, ch*0.07);
      // Supports aileron avant
      _finCtx.fillStyle=col+'0.8)';
      _finCtx.fillRect(cw*0.42, ch*0.0, cw*0.04, ch*0.12);
      _finCtx.fillRect(cw*0.52, ch*0.0, cw*0.04, ch*0.12);

      // Roues (4 visibles en 2D — avant et arrière)
      [[-cw*0.36,ch*0.25,ch*0.30],[cw*0.38,ch*0.18,ch*0.24]].forEach(function(p:number[]){
        // Pneu
        _finCtx.beginPath(); _finCtx.ellipse(p[0],p[1],p[2],p[2]*0.55,0,0,Math.PI*2);
        _finCtx.fillStyle='#111'; _finCtx.fill();
        _finCtx.strokeStyle='#333'; _finCtx.lineWidth=1; _finCtx.stroke();
        // Jante
        _finCtx.beginPath(); _finCtx.ellipse(p[0],p[1],p[2]*0.6,p[2]*0.32,0,0,Math.PI*2);
        _finCtx.fillStyle=col+'0.9)'; _finCtx.fill();
        // Moyeu
        _finCtx.beginPath(); _finCtx.ellipse(p[0],p[1],p[2]*0.18,p[2]*0.1,0,0,Math.PI*2);
        _finCtx.fillStyle='rgba(220,220,220,0.9)'; _finCtx.fill();
      });
    }
    _finCtx.restore();
  }
  _finDrawSparks(_finCtx);
  _finDrawConfetti(_finCtx,W,H);
  _finFlagWave+=0.05;
  // Drapeau en bout de piste (dans le bloc rotate — suit l'orientation)
  _finDrawFlag(_finCtx, W*0.91, trackY-flagSz*0.9, _finFlagWave, flagSz);
  _finCtx.restore();
  if(e>=_FIN_T0&&!_finShown0){ _finShown0=true;
    _finSetEl('fin-anim-name', 1,'scale(1)','opacity 0.2s, transform 0.5s cubic-bezier(0.34,1.6,0.64,1)'); }
  if(e>=_FIN_T1&&!_finShown1){ _finShown1=true;
    _finSetEl('fin-anim-msg',  1,'none','opacity 0.35s, transform 0.35s ease'); }
  if(e>=_FIN_T2&&!_finShown2){ _finShown2=true;
    _finSetEl('fin-anim-score',1,'none','opacity 0.35s, transform 0.35s ease'); }
  if(e>=_FIN_TFADE&&!_finFadeDone){
    _finFadeDone=true;
    _finFStart=now; _finFOverlay=_finOverlay; _finFCtx=_finCtx; _finFW=W; _finFH=H;
    requestAnimationFrame(_finFadeFrame);
  }
  _finRAF=e<_FIN_TTOTAL+100?requestAnimationFrame(_finFrame):null;
}

stopFinAnim = function(): void {
  if(_finRAF){cancelAnimationFrame(_finRAF);_finRAF=null;}
  _finSparks.length=0; _finConfetti.length=0;
  var ov=$opt('fin-anim-overlay');
  if(ov){ov.style.display='none'; ov.style.opacity='1';}
  _finResetTexts();
  if(window._afterFinAnim) window._afterFinAnim();
};

playFinAnim = function(playerIdx:number): void {
  if(_finRAF){cancelAnimationFrame(_finRAF);_finRAF=null;}
  _finSparks.length=0; _finConfetti.length=0;
  var p: Player=players[playerIdx];
  var cardEl=$opt('card-'+playerIdx);
  var rot=0;
  if(cardEl){var m=cardEl.className.match(/rot-[^\s]+/);if(m)rot=({'rot-0':0,'rot-180':180,'rot-l':90,'rot-r':-90} as Record<string,number>)[m[0]]||0;}
  var name=p.playerName||(t('player')+' '+(playerIdx+1));
  var score=fmtNum(p.finalScore!==undefined?p.finalScore:(p.rawScore!==undefined?p.rawScore:p.score));
  $('fin-anim-name').textContent=name;
  $('fin-anim-msg').textContent=(t('finisher')||'FINISHER')+' #'+p.winRank;
  $('fin-anim-score').textContent=score+' pts';
  _finResetTexts();
  $('fin-anim-texts').style.transform='rotate('+rot+'deg)';
  _finOverlay=$('fin-anim-overlay');
  _finCanvas=$<HTMLCanvasElement>('fin-anim-canvas');
  _finCanvas.width=window.innerWidth; _finCanvas.height=window.innerHeight;
  _finCtx=_finCanvas.getContext('2d')!;
  _finCtx.fillStyle='rgba(0,0,0,0.94)';
  _finCtx.fillRect(0,0,_finCanvas.width,_finCanvas.height);
  _finOverlay.style.display='flex'; _finOverlay.style.opacity='1';
  _finRot=rot; _finFlagWave=0;
  _finStartT=performance.now();
  _finShown0=false; _finShown1=false; _finShown2=false; _finFadeDone=false;
  var W=_finCanvas.width, H=_finCanvas.height;
  var motoSz=Math.min(W,H)*0.18;
  var gaps=[0,1.8,3.8,6.0,8.5,11.5,15.0];
  var offsets=[-0.07,0.07,-0.05,0.07,-0.07,0.05,-0.55];
  _finMotos=_FIN_RACERS.map(function(r,i): FinMoto {
    return {g:r.g,s:r.s,x:-motoSz*(0.5+gaps[i]),oY:motoSz*offsets[i]};
  });
  _finRAF=requestAnimationFrame(_finFrame);
};
})();

// ── ANIMATION VICTOIRE ────────────────────────────────────────────
(function(){
var _COLORS: RGB[]=[[0,255,224],[0,140,255],[255,180,0],[255,215,0],[255,255,255],[100,200,255],[255,120,0]];
function _rndCol(): RGB { return _COLORS[Math.floor(Math.random()*_COLORS.length)]; }
function _rgba(c:RGB,a:number): string { return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')'; }

/** Fusée du feu d'artifice (ty = hauteur d'explosion, trail = traînée). */
interface Rocket { x:number; y:number; ty:number; vy:number; col:RGB; trail:{x:number;y:number}[]; done:boolean }
/** Particule d'une explosion (g = gravité). */
interface ExpPart { x:number; y:number; vx:number; vy:number; life:number; decay:number; sz:number; col:RGB; g:number }
interface Explosion { parts:ExpPart[] }
var _rockets: Rocket[]=[], _exps: Explosion[]=[];

function _spawnRocket(W:number,H:number,rot:number): void {
  var x=W*(0.1+Math.random()*0.8);
  var topMargin=(rot===90||rot===-90)?0.25:0.05;
  var ty=H*(topMargin+Math.random()*0.35);
  var dur=42+Math.random()*12;
  _rockets.push({x:x,y:H+20,ty:ty,vy:-(H-ty)/dur,col:_rndCol(),trail:[],done:false});
}

function _spawnExp(x:number,y:number): void {
  var col=_rndCol(); var n=40+Math.floor(Math.random()*20); var parts: ExpPart[]=[];
  for(var i=0;i<n;i++){
    var a=(i/n)*Math.PI*2+(Math.random()-0.5)*0.4;
    var s=2+Math.random()*5;
    var c=Math.random()<0.25?_rndCol():col;
    parts.push({x:x,y:y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,decay:0.006,sz:2+Math.random()*4,col:c,g:0.03+Math.random()*0.03});
  }
  for(var i=0;i<12;i++){
    var a=(i/30)*Math.PI*2; var s=8+Math.random()*4;
    parts.push({x:x,y:y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,decay:0.009,sz:3,col:[255,255,255],g:0.01});
  }
  _exps.push({parts:parts});
}

function _tick(ctx:CanvasRenderingContext2D,W:number,H:number,rot:number): void {
  ctx.fillStyle='rgba(0,0,0,0.14)';
  ctx.fillRect(0,0,W,H);
  ctx.save();
  if(rot){ ctx.translate(W/2,H/2); ctx.rotate(rot*Math.PI/180); ctx.translate(-W/2,-H/2); }
  for(var i=_rockets.length-1;i>=0;i--){
    var r=_rockets[i];
    r.trail.push({x:r.x,y:r.y});
    if(r.trail.length>18) r.trail.shift();
    for(var ti=0;ti<r.trail.length;ti++){
      let p=r.trail[ti]; var al=(ti/r.trail.length)*0.8;
      ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(0,2.5*(ti/r.trail.length)),0,Math.PI*2);
      ctx.fillStyle=_rgba(r.col,al); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(r.x,r.y,5,0,Math.PI*2);
    ctx.fillStyle=_rgba(r.col,0.3); ctx.fill();
    ctx.beginPath(); ctx.arc(r.x,r.y,3.5,0,Math.PI*2);
    ctx.fillStyle=_rgba(r.col,1); ctx.fill();
    r.y+=r.vy;
    if(r.y<=r.ty&&!r.done){
      r.done=true; _spawnExp(r.x,r.y);
      if(Math.random()<0.4) _spawnExp(r.x+(-30+Math.random()*60),r.y+(-30+Math.random()*60));
      _rockets.splice(i,1);
    }
  }
  for(var e=_exps.length-1;e>=0;e--){
    var ex=_exps[e]; var alive=false;
    for(var pi=0;pi<ex.parts.length;pi++){
      let p=ex.parts[pi];
      if(p.life<=0) continue;
      alive=true;
      p.x+=p.vx; p.y+=p.vy; p.vy+=p.g; p.life-=p.decay;
      ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(0,p.sz*p.life*1.8),0,Math.PI*2);
      ctx.fillStyle=_rgba(p.col,p.life*0.25); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(0,p.sz*p.life),0,Math.PI*2);
      ctx.fillStyle=_rgba(p.col,p.life*0.95); ctx.fill();
    }
    if(!alive) _exps.splice(e,1);
  }
  ctx.restore();
}

function _setEl(id:string,opacity:number,transform?:string,transition?:string): void {
  var el=$opt(id);
  if(!el) return;
  el.style.transition=transition||'none';
  el.style.opacity=String(opacity);
  if(transform!==undefined) el.style.transform=transform;
}
function _resetTexts(): void {
  _setEl('win-anim-trophy-canvas',0,'scale(0.02) rotate(-20deg)');
  _setEl('win-anim-name',  0,'scale(0.5)');
  _setEl('win-anim-msg',   0,'translateY(12px)');
  _setEl('win-anim-score', 0,'translateY(12px)');
}

// Overlay / contexte du fondu : posés dans _frame avant la première trame de fondu
// (null! : pas de garde à l'exécution, comme en JS).
var _fadeStart=0,_fadeOverlay: HTMLElement=null!,_fadeCtx: CanvasRenderingContext2D=null!,_fadeW=0,_fadeH=0;
function _fadeFrame(now:number): void {
  var ft=Math.min((now-_fadeStart)/600,1);
  _fadeOverlay.style.opacity=String(1-ft);
  if(ft<1){ requestAnimationFrame(_fadeFrame); }
  else {
    _fadeOverlay.style.display='none'; _fadeOverlay.style.opacity='1';
    _fadeCtx.clearRect(0,0,_fadeW,_fadeH);
    _rockets.length=0; _exps.length=0; _resetTexts();
    if(window._afterWinAnim) window._afterWinAnim();
  }
}

var _winRAF: RafId=null;
// Overlay, canvas et contexte : posés dans playWinAnim avant la première trame
// (null! : pas de garde à l'exécution ; _stopWinAnim teste leur présence).
var _gOverlay: HTMLElement=null!,_gCanvas: HTMLCanvasElement=null!,_gCtx: CanvasRenderingContext2D=null!;
var _gStartT=0,_gVolleys=0,_gHasScore=false,_gRot=0;
var _gShown0=false,_gShown1=false,_gShown2=false,_gShown3=false,_gFadeDone=false;
var _T0=1300,_T1=580,_T2=780,_T3=920,_T_FADE=5200,_T_TOTAL=5800;

function _frame(now:number): void {
  var e=now-_gStartT;
  if(_gVolleys<6&&e>_gVolleys*60){ _spawnRocket(_gCanvas.width,_gCanvas.height,_gRot); _gVolleys++; }
  if(e>200&&Math.random()<0.12&&_rockets.length<5) _spawnRocket(_gCanvas.width,_gCanvas.height,_gRot);
  _tick(_gCtx,_gCanvas.width,_gCanvas.height,_gRot);
  if(e>=_T0&&!_gShown0){ _gShown0=true; _setEl('win-anim-trophy-canvas',1,'scale(1) rotate(0deg)','opacity 0.4s ease, transform 0.85s cubic-bezier(0.2,5.0,0.4,1)'); }
  if(e>=_T1&&!_gShown1){ _gShown1=true; _setEl('win-anim-name',  1,'scale(1)',             'opacity 0.2s, transform 0.5s cubic-bezier(0.34,1.6,0.64,1)'); }
  if(e>=_T2&&!_gShown2){ _gShown2=true; _setEl('win-anim-msg',   1,'none',                 'opacity 0.35s, transform 0.35s ease'); }
  if(e>=_T3&&!_gShown3&&_gHasScore){ _gShown3=true; _setEl('win-anim-score',1,'none','opacity 0.35s, transform 0.35s ease'); }
  if(e>=_T_FADE&&!_gFadeDone){
    _gFadeDone=true;
    _fadeStart=now; _fadeOverlay=_gOverlay; _fadeCtx=_gCtx; _fadeW=_gCanvas.width; _fadeH=_gCanvas.height;
    requestAnimationFrame(_fadeFrame);
  }
  _winRAF=e<_T_TOTAL+100?requestAnimationFrame(_frame):null;
}

// Dessine une coupe vectorielle sur un canvas
function _drawTrophy(canvas:HTMLCanvasElement): void {
  var W=canvas.width, H=canvas.height;
  var ctx=canvas.getContext('2d')!;
  ctx.clearRect(0,0,W,H);
  var cx=W/2, s=W*0.42;

  // Ombre portée douce
  ctx.save();
  ctx.shadowColor='rgba(255,180,0,0.5)';
  ctx.shadowBlur=W*0.18;
  ctx.shadowOffsetY=W*0.04;

  // Socle
  var gSocle=ctx.createLinearGradient(cx-s*0.5,H*0.88,cx+s*0.5,H*0.97);
  gSocle.addColorStop(0,'#b8860b'); gSocle.addColorStop(0.4,'#ffd700'); gSocle.addColorStop(1,'#8b6914');
  ctx.fillStyle=gSocle;
  ctx.beginPath();
  ctx.moveTo(cx-s*0.5,H*0.97); ctx.lineTo(cx+s*0.5,H*0.97);
  ctx.lineTo(cx+s*0.38,H*0.87); ctx.lineTo(cx-s*0.38,H*0.87);
  ctx.closePath(); ctx.fill();

  // Tige
  var gTige=ctx.createLinearGradient(cx-s*0.1,0,cx+s*0.1,0);
  gTige.addColorStop(0,'#8b6914'); gTige.addColorStop(0.5,'#ffd700'); gTige.addColorStop(1,'#8b6914');
  ctx.fillStyle=gTige;
  ctx.fillRect(cx-s*0.1, H*0.72, s*0.2, H*0.16);

  // Coupe principale
  var gCoupe=ctx.createLinearGradient(cx-s,H*0.15,cx+s,H*0.72);
  gCoupe.addColorStop(0,'#8b6914');
  gCoupe.addColorStop(0.25,'#ffd700');
  gCoupe.addColorStop(0.5,'#ffe066');
  gCoupe.addColorStop(0.75,'#ffd700');
  gCoupe.addColorStop(1,'#8b6914');
  ctx.fillStyle=gCoupe;
  ctx.beginPath();
  ctx.moveTo(cx-s*0.72, H*0.18);
  ctx.bezierCurveTo(cx-s*0.72,H*0.18, cx-s*0.58,H*0.72, cx-s*0.1,H*0.72);
  ctx.lineTo(cx+s*0.1, H*0.72);
  ctx.bezierCurveTo(cx+s*0.58,H*0.72, cx+s*0.72,H*0.18, cx+s*0.72,H*0.18);
  ctx.bezierCurveTo(cx+s*0.45,H*0.12, cx-s*0.45,H*0.12, cx-s*0.72,H*0.18);
  ctx.closePath(); ctx.fill();

  // Reflet principal
  ctx.fillStyle='rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(cx-s*0.4, H*0.2);
  ctx.bezierCurveTo(cx-s*0.35,H*0.18, cx-s*0.05,H*0.18, cx,H*0.2);
  ctx.bezierCurveTo(cx-s*0.05,H*0.42, cx-s*0.35,H*0.48, cx-s*0.4,H*0.52);
  ctx.closePath(); ctx.fill();

  // Anses
  [[-1],[1]].forEach(function(side:number[]){
    var sx=side[0];
    ctx.strokeStyle=gCoupe;
    var gAnse=ctx.createLinearGradient(cx+sx*s*0.72,H*0.3,cx+sx*s*1.05,H*0.5);
    gAnse.addColorStop(0,'#ffd700'); gAnse.addColorStop(0.5,'#ffe066'); gAnse.addColorStop(1,'#8b6914');
    ctx.strokeStyle=gAnse; ctx.lineWidth=s*0.12; ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(cx+sx*s*0.68, H*0.28);
    ctx.bezierCurveTo(cx+sx*s*1.1,H*0.22, cx+sx*s*1.1,H*0.62, cx+sx*s*0.68,H*0.58);
    ctx.stroke();
  });

  // Étoile au sommet
  ctx.fillStyle='#ffe066';
  ctx.save(); ctx.translate(cx, H*0.1); ctx.rotate(-Math.PI/2);
  ctx.beginPath();
  for(var si=0;si<5;si++){
    var ao=si*Math.PI*2/5, ai=ao+Math.PI/5;
    var ro=s*0.14, ri=s*0.06;
    if(si===0) ctx.moveTo(Math.cos(ao)*ro,Math.sin(ao)*ro);
    else ctx.lineTo(Math.cos(ao)*ro,Math.sin(ao)*ro);
    ctx.lineTo(Math.cos(ai)*ri,Math.sin(ai)*ri);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();

  ctx.restore(); // fin ombre
}

playWinAnim = function(playerIdx:number): void {
  if(_winRAF){ cancelAnimationFrame(_winRAF); _winRAF=null; }
  _rockets.length=0; _exps.length=0;

  var p: Player=players[playerIdx];
  var cardEl=$opt('card-'+playerIdx);
  var rot=0;
  if(cardEl){ var m=cardEl.className.match(/rot-[^\s]+/); if(m) rot=({'rot-0':0,'rot-180':180,'rot-l':90,'rot-r':-90} as Record<string,number>)[m[0]]||0; }

  var name=p.playerName||(t('player')+' '+(playerIdx+1));
  var score=fmtNum(p.finalScore!==undefined ? p.finalScore : (p.rawScore!==undefined ? p.rawScore : p.score));
  var hasScore=true;
  // Seul le vainqueur n°1 affiche "VICTOIRE !" — les suivants affichent leur rang
  // isChamp = vainqueur unique seulement si singleWinner ou mode élimination pur
  // lastLoser peut avoir plusieurs finisheurs → pas de champion
  var modeUniqueWinner = !!(singleWinner || (elimPoints!==null && !lastLoser));
  var isChamp = p.winRank===1 && modeUniqueWinner;
  var msg = isChamp ? (t('winAnimMsg')||'VICTOIRE !') : (t('finisher')||'FINISHEUR')+' #'+p.winRank;
  // Le troph\u00E9e n'est dessin\u00E9 (et #win-anim-overlay affich\u00E9) que pour le
  // champion : le cas finisher retourne plus bas vers `playFinAnim`, qui a
  // son propre overlay/canvas \u2014 voir docs/audit/DECISIONS-H.md \u00A716.3
  // (l'ancien dessin ici pour le finisher, un drapeau emoji, \u00E9tait mort :
  // cet overlay reste `display:none` sur ce chemin, confirm\u00E9 par deux
  // critiques ind\u00E9pendants via `getComputedStyle`).
  var _tc=$opt<HTMLCanvasElement>('win-anim-trophy-canvas');
  if(_tc && isChamp){
    var _tSz=Math.min(window.innerWidth*0.22,140);
    _tc.width=_tSz; _tc.height=_tSz;
    _drawTrophy(_tc);
  }

  $('win-anim-name').textContent=name;
  $('win-anim-msg').textContent=msg;
  $('win-anim-score').textContent=score+' pts';

  // Finishers #2+ → animation finisher dédiée
  // (« window.playFinAnim » dans l'original : la fonction est désormais une liaison de ce module)
  if(!isChamp){
    if(playFinAnim) playFinAnim(playerIdx);
    return;
  }

  // Animation complète pour le champion #1
  _T0=1300; _T1=580; _T2=780; _T3=920; _T_FADE=5200; _T_TOTAL=5800;
  _resetTexts();
  $('win-anim-texts').style.transform='rotate('+rot+'deg)';
  _gOverlay=$('win-anim-overlay');
  _gCanvas=$<HTMLCanvasElement>('win-anim-canvas');
  _gCanvas.width=window.innerWidth;
  _gCanvas.height=window.innerHeight;
  _gCtx=_gCanvas.getContext('2d')!;
  _gCtx.fillStyle='rgba(0,0,0,0.92)';
  _gCtx.fillRect(0,0,_gCanvas.width,_gCanvas.height);
  _gOverlay.style.display='flex';
  _gOverlay.style.opacity='1';
  _gStartT=performance.now(); _gVolleys=0; _gRot=rot; _gHasScore=hasScore;
  _gShown0=false; _gShown1=false; _gShown2=false; _gShown3=false; _gFadeDone=false;
  _winRAF=requestAnimationFrame(_frame);
};

window._stopWinAnim=function(): void {
  if(window._winAnimDelayTID){ clearTimeout(window._winAnimDelayTID); window._winAnimDelayTID=null; }
  if(_winRAF){ cancelAnimationFrame(_winRAF); _winRAF=null; }
  _rockets.length=0; _exps.length=0;
  var ov=$opt('win-anim-overlay');
  if(ov){ ov.style.display='none'; ov.style.opacity='1'; }
  if(_gCtx&&_gCanvas) _gCtx.clearRect(0,0,_gCanvas.width,_gCanvas.height);
  _resetTexts();
  if(window._afterWinAnim) window._afterWinAnim();
};
})();

// ── Accessibilité clavier des boîtes de dialogue (audit AAA, critique
// round 1, défauts P1-2) ───────────────────────────────────────────
// Les rôles `dialog`/`alertdialog` posés par cet élément sur 7 boîtes
// (index.html) n'avaient aucune gestion clavier : le focus ne se déplaçait
// jamais dans la boîte à son ouverture, `Tab` traversait l'écran masqué
// derrière l'overlay (aucun piège de focus), et `Échap` ne fermait rien
// (patron ARIA APG « Dialog (Modal) » non respecté). Corrigé ici sans
// toucher `game.ts`/`dice-ui.ts` (hors périmètre) : chaque fermeture
// réutilise tel quel l'export déjà existant de ces modules (mêmes
// fonctions que les boutons ✕/Annuler déjà en place), jamais un nouveau
// mécanisme. Toutes ces boîtes s'ouvrent/se ferment en retirant/ajoutant la
// classe `.hidden` (mécanisme déjà en place partout ailleurs dans l'app) :
// un `MutationObserver` sur cet attribut suffit à détecter l'ouverture,
// sans dépendre de qui l'a déclenchée (bouton, geste tactile, etc.).
(function initDialogA11y(){
  interface DialogSpec {
    id: string;
    /** Reproduit une fermeture déjà existante ailleurs dans l'app (bouton
     *  Annuler/Fermer/Retour) ; absent = pas de fermeture par Échap
     *  (ex. `winner-modal`, qui impose un choix, comme au clavier avant ce
     *  correctif — aucun bouton « Annuler » n'existe pour cette boîte). */
    close?: () => void;
  }

  // `reset-modal`/`recap` : pas de fonction exportée dédiée, seulement déjà
  // un retrait direct de la classe `.hidden` posé sur leurs propres
  // boutons (`btn-back-reset` dans index.html, `recap-close-btn` dans
  // `game.ts`) — on reproduit exactement le même geste, pas un nouveau.
  const DIALOGS: DialogSpec[] = [
    { id: 'dice-overlay', close: closeDice },
    { id: 'score-modal', close: closeScoreModal },
    { id: 'winner-modal' },
    { id: 'reset-modal', close: () => $opt('reset-modal')?.classList.add('hidden') },
    { id: 'elim-modal', close: cancelElim },
    { id: 'endgame-modal', close: cancelEndgame },
    { id: 'recap', close: () => $opt('recap')?.classList.add('hidden') },
  ];

  function isOpen(el: HTMLElement): boolean {
    return !el.classList.contains('hidden');
  }

  const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), '
    + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function focusableIn(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter(el => el.offsetParent !== null);
  }

  function currentOpenDialog(): { el: HTMLElement; spec: DialogSpec } | null {
    for (const spec of DIALOGS) {
      const el = $opt(spec.id);
      if (el && isOpen(el)) return { el, spec };
    }
    return null;
  }

  // Piège de focus + Échap : un seul écouteur global (capture, pour agir
  // avant tout gestionnaire de la page masquée derrière l'overlay), actif
  // uniquement quand une des 7 boîtes est réellement ouverte.
  document.addEventListener('keydown', (e) => {
    const open = currentOpenDialog();
    if (!open) return;
    if (e.key === 'Escape') {
      if (open.spec.close) { e.preventDefault(); open.spec.close(); }
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusableIn(open.el);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const inside = !!active && open.el.contains(active);
    if (e.shiftKey) {
      if (!inside || active === first) { e.preventDefault(); last.focus(); }
    } else {
      if (!inside || active === last) { e.preventDefault(); first.focus(); }
    }
  }, true);

  // Focus déplacé dans la boîte à l'ouverture (patron ARIA APG standard) :
  // un `MutationObserver` par boîte, réagit dès que `.hidden` disparaît,
  // quel que soit ce qui a déclenché l'ouverture.
  for (const spec of DIALOGS) {
    const el = $opt(spec.id);
    if (!el) continue;
    let wasOpen = isOpen(el);
    new MutationObserver(() => {
      const nowOpen = isOpen(el);
      if (nowOpen && !wasOpen) {
        const items = focusableIn(el);
        (items[0] || el).focus();
      }
      wasOpen = nowOpen;
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  }
})();
