// ── ANIMATION ÉLIMINATION ─────────────────────────────────────────
(function(){
  function easeInOut(t){ return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2; }
  function easeOut(t)  { return 1-Math.pow(1-t,3); }

  // Rotation des textes selon la rotation de la carte
  const ROT_DEG = {'rot-0':0,'rot-180':180,'rot-l':90,'rot-r':-90};

  // Courbe taille : vitesse constante + 2 reculs
  const PULLBACKS=[{atSize:0.28,to:0.10,frames:120},{atSize:0.55,to:0.22,frames:120}];
  function buildCurve(steps){
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
  let noiseRAF=null;
  function startNoise(startTime,totalDuration,rotDeg){
    const canvas=document.getElementById('elim-anim-noise');
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    canvas.style.animation='elimNoisePulse '+totalDuration+'ms ease forwards';
    setTimeout(()=>{ canvas.style.animation=''; },totalDuration+100);
  }

  // Fragments — dessinés sur canvas (plus de divs DOM)
  let frags=[], fragCanvas=null, fragCtx=null, fragRAF=null;
  function spawnFragments(cx,cy,rotDeg){
    frags=[];
    fragCanvas=document.getElementById('elim-anim-noise');
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
  function animateFragments(){
    if(!fragCtx) return;
    const now=performance.now();
    fragCtx.clearRect(0,0,fragCanvas.width,fragCanvas.height);
    let alive=false;
    fragCtx.textAlign='center'; fragCtx.textBaseline='middle';
    frags.forEach(f=>{
      const t=Math.min((now-f.startT)/3000,1);
      if(t>=1) return;
      alive=true;
      const dx=Math.cos(f.angle)*f.speed*easeOut(t);
      const dy=Math.sin(f.angle)*f.speed*easeOut(t);
      const sz=f.sz*(1-t*0.3);
      const alpha=1-Math.pow(t,1.5)*0.9;
      fragCtx.save();
      fragCtx.globalAlpha=alpha;
      fragCtx.translate(f.cx+dx, f.cy+dy);
      fragCtx.rotate(f.rotDir*t*Math.PI/180);
      fragCtx.font=sz+'px serif';
      fragCtx.fillText('\u2620\uFE0F',0,0);
      fragCtx.restore();
    });
    fragCtx.globalAlpha=1;
    if(alive){ fragRAF=requestAnimationFrame(animateFragments); }
    else{
      fragCtx.clearRect(0,0,fragCanvas.width,fragCanvas.height);
      frags=[]; fragRAF=null;
    }
  }

  // Timers et RAF
  let pending=[], animRAF=null;
  function clearAll(){
    pending.forEach(id=>clearTimeout(id)); pending=[];
    if(animRAF){cancelAnimationFrame(animRAF);animRAF=null;}
    if(fragRAF){cancelAnimationFrame(fragRAF);fragRAF=null;}
    const canvas_noise=document.getElementById('elim-anim-noise');
    if(canvas_noise){ canvas_noise.style.animation=''; if(fragCtx) fragCtx.clearRect(0,0,canvas_noise.width,canvas_noise.height); }
    if(noiseRAF){cancelAnimationFrame(noiseRAF);noiseRAF=null;}
    frags=[];
  }

  function resetTexts(){
    const name =document.getElementById('elim-anim-name');
    const msg  =document.getElementById('elim-anim-msg');
    const score=document.getElementById('elim-anim-score');
    [name,msg,score].forEach(el=>{
      el.style.transition='none'; el.style.opacity='0';
    });
    name.style.transform='scale(0.85)';
    msg.style.transform='translateY(8px)';
    score.style.transform='translateY(8px)';
  }

  function showTexts(){
    [{id:'elim-anim-name',delay:0},{id:'elim-anim-msg',delay:130},{id:'elim-anim-score',delay:260}]
    .forEach(({id,delay})=>{
      const tid=setTimeout(()=>{
        const el=document.getElementById(id);
        el.style.transition='opacity 0.4s ease, transform 0.4s ease';
        el.style.opacity='1'; el.style.transform='none';
      },delay);
      pending.push(tid);
    });
  }

  const T_GROW=1800,T_FLASH=1950,T_TEXT=1950,T_FADE=4400,T_TOTAL=5000;
  function maxSize(){ return Math.min(window.innerWidth,window.innerHeight)*1.60; }

  // Point d'entrée — appelé depuis elimDirect
  window.playElimAnim = function(playerIdx){
    clearAll();
    // Mouvement réduit : pas d'animation, callback de fin (après le rendu/sauvegarde différés)
    if(_reducedMotion()){ const tid=setTimeout(()=>{ if(window._afterElimAnim) window._afterElimAnim(); },400); pending.push(tid); return; }
    const p       = players[playerIdx];
    const cardEl  = document.getElementById('card-'+playerIdx);
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
    document.getElementById('elim-anim-name').textContent  = name;
    document.getElementById('elim-anim-msg').textContent   = t('elimAnimMsg')||'TU AS ÉCHOUÉ';
    document.getElementById('elim-anim-score').textContent = score+' pts';

    // Rotation des textes selon la carte
    document.getElementById('elim-anim-texts').style.transform = `rotate(${rotDeg}deg)`;

    resetTexts();

    // Origine du clip-path = centre de la carte
    const overlay = document.getElementById('elim-anim-overlay');
    const skull   = document.getElementById('elim-anim-skull');

    let ox=50, oy=50;
    if(cardEl){
      const r=cardEl.getBoundingClientRect();
      ox=((r.left+r.width/2)/window.innerWidth*100).toFixed(1);
      oy=((r.top+r.height/2)/window.innerHeight*100).toFixed(1);
    }

    overlay.style.animation='';
    overlay.style.opacity='1';
    overlay.style.clipPath='';
    overlay.style.transition='none';
    overlay.style.display='flex';
    skull.style.cssText=`position:absolute;z-index:3;line-height:1;transform-origin:center center;font-size:4px;opacity:1;filter:none;transform:rotate(${rotDeg}deg);`;

    const curve   = buildCurve(1800);
    const startT  = performance.now();
    let fragSpawned=false, textShown=false, fadeDone=false;

    startNoise(startT, T_TOTAL, rotDeg);

    function frame(now){
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
          skull.style.cssText='';
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

  window._stopElimAnim = function(){
    clearAll();
    const ov=document.getElementById('elim-anim-overlay');
    if(ov){ ov.style.animation=''; ov.style.display='none'; ov.style.clipPath=''; ov.style.transition=''; }
    const skull=document.getElementById('elim-anim-skull');
    if(skull) skull.style.cssText='';
    document.querySelectorAll('.frag').forEach(f=>f.remove());
    if(window._afterElimAnim) window._afterElimAnim();
  };
})();

// ── STOP ANIMATIONS ───────────────────────────────────────────────
function stopWinAnim(){
  if(window._stopWinAnim) window._stopWinAnim();
}
function stopElimAnim(){
  if(window._stopElimAnim) window._stopElimAnim();
}

// ── ANIMATION FINISHER ────────────────────────────────────────────
(function(){
var _FIN_GLOWS=['rgba(0,255,224,0.7)','rgba(255,100,0,0.7)','rgba(180,100,255,0.7)',
                'rgba(255,220,0,0.7)','rgba(255,80,120,0.7)'];
var _FIN_RACERS=[
  {e:'🏎️',g:_FIN_GLOWS[0],s:6.75},
  {e:'🏎️',g:_FIN_GLOWS[1],s:6.0},
  {e:'🏎️',g:_FIN_GLOWS[2],s:7.35},
  {e:'🏎️',g:_FIN_GLOWS[3],s:6.375},
  {e:'🏎️',g:_FIN_GLOWS[4],s:5.625},
  {e:'🏎️',g:_FIN_GLOWS[0],s:6.9},
  {e:'🏎️',g:_FIN_GLOWS[3],s:6.6},
];
var _FIN_CONF_COLORS=['#ff4466','#ffd700','#00ffe0','#ff8800','#cc66ff','#ffffff','#66ff88'];

function _finDrawFlag(ctx,px,py,t,sz){
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

var _finConfetti=[];
function _finSpawnConfetti(W){
  _finConfetti.push({
    x:Math.random()*W, y:-20,
    vx:(Math.random()-0.5)*2, vy:1.5+Math.random()*2,
    rot:Math.random()*Math.PI*2, rotV:(Math.random()-0.5)*0.2,
    w:6+Math.random()*8, h:4+Math.random()*5,
    col:_FIN_CONF_COLORS[Math.floor(Math.random()*_FIN_CONF_COLORS.length)],
    life:1, decay:0.004+Math.random()*0.003
  });
}
function _finDrawConfetti(ctx,W,H){
  if(Math.random()<0.35) _finSpawnConfetti(W);
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

var _finSparks=[];
function _finSpawnSpark(x,y,g){
  var a=Math.PI*0.5+Math.PI*(0.3+Math.random()*0.4), s=1+Math.random()*3;
  _finSparks.push({x:x,y:y,vx:Math.cos(a)*s-1.5,vy:Math.sin(a)*s,
    life:1,decay:0.07+Math.random()*0.04,g:g});
}
function _finDrawSparks(ctx){
  for(var i=_finSparks.length-1;i>=0;i--){
    var s=_finSparks[i]; s.x+=s.vx; s.y+=s.vy; s.vy+=0.2; s.life-=s.decay;
    if(s.life<=0){_finSparks.splice(i,1);continue;}
    var rgb=s.g.match(/[\d.]+/g);
    ctx.beginPath(); ctx.arc(s.x,s.y,Math.max(0,2.5*s.life),0,Math.PI*2);
    ctx.fillStyle='rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+','+s.life+')'; ctx.fill();
  }
}

function _finSetEl(id,opacity,transform,transition){
  var el=document.getElementById(id); if(!el)return;
  el.style.transition=transition||'none'; el.style.opacity=String(opacity);
  if(transform!==undefined) el.style.transform=transform;
}
function _finResetTexts(){
  _finSetEl('fin-anim-name', 0,'scale(0.5)');
  _finSetEl('fin-anim-msg',  0,'translateY(12px)');
  _finSetEl('fin-anim-score',0,'translateY(12px)');
}

var _finFStart=0,_finFOverlay=null,_finFCtx=null,_finFW=0,_finFH=0;
function _finFadeFrame(now){
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

var _finRAF=null, _finOverlay=null, _finCanvas=null, _finCtx=null, _finEmojiOk=false;
var _finStartT=0, _finRot=0, _finFlagWave=0, _finMotos=[];
var _finShown0=false, _finShown1=false, _finShown2=false, _finFadeDone=false;
var _FIN_T0=1600, _FIN_T1=1800, _FIN_T2=1950, _FIN_TFADE=4600, _FIN_TTOTAL=5200;

function _finFrame(now){
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
    var rgb=m.g.match(/[\d.]+/g);
    var tLen=motoSz*1.6, tH=motoSz*0.07, tX=m.x-motoSz*0.8;
    var grad=_finCtx.createLinearGradient(tX,m.y,tX-tLen,m.y);
    grad.addColorStop(0,'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',0.7)');
    grad.addColorStop(1,'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',0)');
    _finCtx.save(); _finCtx.fillStyle=grad;
    _finCtx.fillRect(tX-tLen, m.y-tH/2, tLen, tH);
    _finCtx.restore();
    // Voiture : emoji si supporté, vectoriel sinon
    _finCtx.save();
    _finCtx.translate(m.x,m.y); _finCtx.scale(-1,1);
    if(_finEmojiOk){
      _finCtx.font=motoSz+'px serif';
      _finCtx.textAlign='center'; _finCtx.textBaseline='middle';
      _finCtx.fillText('\uD83C\uDFCE\uFE0F',0,0);
    } else {
      // Voiture vectorielle de secours
      var cw=motoSz*0.95,ch=motoSz*0.36;
      // Carrosserie principale
      _finCtx.fillStyle='rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',0.95)';
      _finCtx.beginPath();
      _finCtx.moveTo(-cw*0.5, ch*0.3);
      _finCtx.lineTo(-cw*0.5,-ch*0.1);
      _finCtx.lineTo(-cw*0.25,-ch*0.5);
      _finCtx.lineTo(cw*0.2,-ch*0.5);
      _finCtx.lineTo(cw*0.5,-ch*0.1);
      _finCtx.lineTo(cw*0.5, ch*0.3);
      _finCtx.closePath(); _finCtx.fill();
      // Toit cabine
      _finCtx.fillStyle='rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',0.6)';
      _finCtx.beginPath();
      _finCtx.moveTo(-cw*0.2,-ch*0.5);
      _finCtx.lineTo(-cw*0.08,-ch*0.9);
      _finCtx.lineTo(cw*0.14,-ch*0.9);
      _finCtx.lineTo(cw*0.22,-ch*0.5);
      _finCtx.closePath(); _finCtx.fill();
      // Roues
      [[-cw*0.32,ch*0.32],[cw*0.3,ch*0.32]].forEach(function(p){
        _finCtx.beginPath(); _finCtx.arc(p[0],p[1],ch*0.32,0,Math.PI*2);
        _finCtx.fillStyle='#1a1a1a'; _finCtx.fill();
        _finCtx.beginPath(); _finCtx.arc(p[0],p[1],ch*0.18,0,Math.PI*2);
        _finCtx.fillStyle='rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',0.7)'; _finCtx.fill();
      });
      // Vitre
      _finCtx.fillStyle='rgba(160,210,255,0.55)';
      _finCtx.beginPath();
      _finCtx.moveTo(-cw*0.16,-ch*0.52);
      _finCtx.lineTo(-cw*0.06,-ch*0.85);
      _finCtx.lineTo(cw*0.11,-ch*0.85);
      _finCtx.lineTo(cw*0.18,-ch*0.52);
      _finCtx.closePath(); _finCtx.fill();
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

window.stopFinAnim=function(){
  if(_finRAF){cancelAnimationFrame(_finRAF);_finRAF=null;}
  _finSparks.length=0; _finConfetti.length=0;
  var ov=document.getElementById('fin-anim-overlay');
  if(ov){ov.style.display='none'; ov.style.opacity='1';}
  _finResetTexts();
  if(window._afterFinAnim) window._afterFinAnim();
};

window.playFinAnim=function(playerIdx){
  if(_finRAF){cancelAnimationFrame(_finRAF);_finRAF=null;}
  if(_reducedMotion()){ setTimeout(()=>{ if(window._afterFinAnim) window._afterFinAnim(); },400); return; }
  _finSparks.length=0; _finConfetti.length=0;
  var p=players[playerIdx];
  var cardEl=document.getElementById('card-'+playerIdx);
  var rot=0;
  if(cardEl){var m=cardEl.className.match(/rot-[^\s]+/);if(m)rot={'rot-0':0,'rot-180':180,'rot-l':90,'rot-r':-90}[m[0]]||0;}
  var name=p.playerName||(t('player')+' '+(playerIdx+1));
  var score=fmtNum(p.finalScore!==undefined?p.finalScore:(p.rawScore!==undefined?p.rawScore:p.score));
  document.getElementById('fin-anim-name').textContent=name;
  document.getElementById('fin-anim-msg').textContent=(t('finisher')||'FINISHER')+' #'+p.winRank;
  document.getElementById('fin-anim-score').textContent=score+' pts';
  _finResetTexts();
  document.getElementById('fin-anim-texts').style.transform='rotate('+rot+'deg)';
  _finOverlay=document.getElementById('fin-anim-overlay');
  _finCanvas=document.getElementById('fin-anim-canvas');
  _finCanvas.width=window.innerWidth; _finCanvas.height=window.innerHeight;
  _finCtx=_finCanvas.getContext('2d');
  _finCtx.fillStyle='rgba(0,0,0,0.94)';
  _finCtx.fillRect(0,0,_finCanvas.width,_finCanvas.height);
  _finOverlay.style.display='flex'; _finOverlay.style.opacity='1';
  _finRot=rot; _finFlagWave=0;
  _finStartT=performance.now();
  _finShown0=false; _finShown1=false; _finShown2=false; _finFadeDone=false;
  var W=_finCanvas.width, H=_finCanvas.height;
  var motoSz=Math.min(W,H)*0.18;
  var diag=Math.ceil(Math.sqrt(W*W+H*H));
  var gaps=[0,1.8,3.8,6.0,8.5,11.5,15.0];
  var offsets=[-0.07,0.07,-0.05,0.07,-0.07,0.05,-0.55];
  _finMotos=_FIN_RACERS.map(function(r,i){
    return {e:r.e,g:r.g,s:r.s,x:-motoSz*(0.5+gaps[i]),oY:motoSz*offsets[i]};
  });
  // Détection support emoji sur canvas
  (function(){
    var tc=document.createElement('canvas'); tc.width=20; tc.height=20;
    var tx=tc.getContext('2d'); tx.font='16px serif';
    tx.fillText('\uD83C\uDFCE\uFE0F',0,16);
    var d=tx.getImageData(0,0,20,20).data;
    var hasColor=false;
    for(var pi=0;pi<d.length;pi+=4){if(d[pi]>20||d[pi+1]>20||d[pi+2]>20){hasColor=true;break;}}
    _finEmojiOk=hasColor;
  })();
  _finRAF=requestAnimationFrame(_finFrame);
};
})();

// ── ANIMATION VICTOIRE ────────────────────────────────────────────
(function(){
var _COLORS=[[0,255,224],[0,140,255],[255,180,0],[255,215,0],[255,255,255],[100,200,255],[255,120,0]];
function _rndCol(){ return _COLORS[Math.floor(Math.random()*_COLORS.length)]; }
function _rgba(c,a){ return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')'; }

var _rockets=[], _exps=[];

function _spawnRocket(W,H,rot){
  var x=W*(0.1+Math.random()*0.8);
  var topMargin=(rot===90||rot===-90)?0.25:0.05;
  var ty=H*(topMargin+Math.random()*0.35);
  var dur=42+Math.random()*12;
  _rockets.push({x:x,y:H+20,ty:ty,vy:-(H-ty)/dur,col:_rndCol(),trail:[],done:false});
}

function _spawnExp(x,y){
  var col=_rndCol(); var n=40+Math.floor(Math.random()*20); var parts=[];
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

function _tick(ctx,W,H,rot){
  ctx.fillStyle='rgba(0,0,0,0.14)';
  ctx.fillRect(0,0,W,H);
  ctx.save();
  if(rot){ ctx.translate(W/2,H/2); ctx.rotate(rot*Math.PI/180); ctx.translate(-W/2,-H/2); }
  for(var i=_rockets.length-1;i>=0;i--){
    var r=_rockets[i];
    r.trail.push({x:r.x,y:r.y});
    if(r.trail.length>18) r.trail.shift();
    for(var ti=0;ti<r.trail.length;ti++){
      var p=r.trail[ti]; var al=(ti/r.trail.length)*0.8;
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
      var p=ex.parts[pi];
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

function _setEl(id,opacity,transform,transition){
  var el=document.getElementById(id);
  if(!el) return;
  el.style.transition=transition||'none';
  el.style.opacity=String(opacity);
  if(transform!==undefined) el.style.transform=transform;
}
function _resetTexts(){
  _setEl('win-anim-trophy-canvas',0,'scale(0.02) rotate(-20deg)');
  _setEl('win-anim-name',  0,'scale(0.5)');
  _setEl('win-anim-msg',   0,'translateY(12px)');
  _setEl('win-anim-score', 0,'translateY(12px)');
}

var _fadeStart=0,_fadeOverlay=null,_fadeCtx=null,_fadeW=0,_fadeH=0;
function _fadeFrame(now){
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

var _winRAF=null;
var _gOverlay=null,_gCanvas=null,_gCtx=null;
var _gStartT=0,_gVolleys=0,_gHasScore=false,_gRot=0;
var _gShown0=false,_gShown1=false,_gShown2=false,_gShown3=false,_gFadeDone=false;
var _T0=1300,_T1=580,_T2=780,_T3=920,_T_FADE=5200,_T_TOTAL=5800;

function _frame(now){
  var e=now-_gStartT;
  var noRockets=(_gVolleys>=999);
  if(!noRockets&&_gVolleys<6&&e>_gVolleys*60){ _spawnRocket(_gCanvas.width,_gCanvas.height,_gRot); _gVolleys++; }
  if(!noRockets&&e>200&&Math.random()<0.12&&_rockets.length<5) _spawnRocket(_gCanvas.width,_gCanvas.height,_gRot);
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
function _drawTrophy(canvas){
  var W=canvas.width, H=canvas.height;
  var ctx=canvas.getContext('2d');
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
  [[-1],[1]].forEach(function(side){
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

window.playWinAnim=function(playerIdx){
  if(_winRAF){ cancelAnimationFrame(_winRAF); _winRAF=null; }
  _rockets.length=0; _exps.length=0;

  var p=players[playerIdx];
  var cardEl=document.getElementById('card-'+playerIdx);
  var rot=0;
  if(cardEl){ var m=cardEl.className.match(/rot-[^\s]+/); if(m) rot={'rot-0':0,'rot-180':180,'rot-l':90,'rot-r':-90}[m[0]]||0; }

  var name=p.playerName||(t('player')+' '+(playerIdx+1));
  var score=fmtNum(p.finalScore!==undefined ? p.finalScore : (p.rawScore!==undefined ? p.rawScore : p.score));
  var hasScore=true;
  // Seul le vainqueur n°1 affiche "VICTOIRE !" — les suivants affichent leur rang
  // isChamp = vainqueur unique seulement si singleWinner ou mode élimination pur
  // lastLoser peut avoir plusieurs finisheurs → pas de champion
  var modeUniqueWinner = !!(singleWinner || (elimPoints!==null && !lastLoser));
  var isChamp = p.winRank===1 && modeUniqueWinner;
  var msg = isChamp ? (t('winAnimMsg')||'VICTOIRE !') : (t('finisher')||'FINISHEUR')+' #'+p.winRank;
  var _tc=document.getElementById('win-anim-trophy-canvas');
  if(_tc){
    var _tSz=Math.min(window.innerWidth*0.22,140);
    _tc.width=_tSz; _tc.height=_tSz;
    if(isChamp){ _drawTrophy(_tc); }
    else{
      var _ctx=_tc.getContext('2d');
      _ctx.clearRect(0,0,_tSz,_tSz);
      _ctx.font=(_tSz*0.72)+'px serif';
      _ctx.textAlign='center'; _ctx.textBaseline='middle';
      _ctx.fillText('\uD83C\uDFC1',_tSz/2,_tSz/2);
    }
  }

  document.getElementById('win-anim-name').textContent=name;
  document.getElementById('win-anim-msg').textContent=msg;
  document.getElementById('win-anim-score').textContent=score+' pts';

  // Finishers #2+ → animation finisher dédiée
  if(!isChamp){
    if(window.playFinAnim) playFinAnim(playerIdx);
    return;
  }
  if(_reducedMotion()){ window._winAnimDelayTID=setTimeout(()=>{ window._winAnimDelayTID=null; if(window._afterWinAnim) window._afterWinAnim(); },400); return; }

  // Animation complète pour le champion #1
  _T0=1300; _T1=580; _T2=780; _T3=920; _T_FADE=5200; _T_TOTAL=5800;
  _resetTexts();
  document.getElementById('win-anim-texts').style.transform='rotate('+rot+'deg)';
  _gOverlay=document.getElementById('win-anim-overlay');
  _gCanvas=document.getElementById('win-anim-canvas');
  _gCanvas.width=window.innerWidth;
  _gCanvas.height=window.innerHeight;
  _gCtx=_gCanvas.getContext('2d');
  _gCtx.fillStyle='rgba(0,0,0,0.92)';
  _gCtx.fillRect(0,0,_gCanvas.width,_gCanvas.height);
  _gOverlay.style.display='flex';
  _gOverlay.style.opacity='1';
  _gStartT=performance.now(); _gVolleys=0; _gRot=rot; _gHasScore=hasScore;
  _gShown0=false; _gShown1=false; _gShown2=false; _gShown3=false; _gFadeDone=false;
  _winRAF=requestAnimationFrame(_frame);
};

window._stopWinAnim=function(){
  if(window._winAnimDelayTID){ clearTimeout(window._winAnimDelayTID); window._winAnimDelayTID=null; }
  if(_winRAF){ cancelAnimationFrame(_winRAF); _winRAF=null; }
  _rockets.length=0; _exps.length=0;
  var ov=document.getElementById('win-anim-overlay');
  if(ov){ ov.style.display='none'; ov.style.opacity='1'; }
  if(_gCtx&&_gCanvas) _gCtx.clearRect(0,0,_gCanvas.width,_gCanvas.height);
  _resetTexts();
  if(window._afterWinAnim) window._afterWinAnim();
};
})();

