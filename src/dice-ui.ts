import * as THREE from 'three';
import { currentLang } from './i18n';
import { adjust, players } from './game';
import { $, $opt, $q } from './dom';
import type { DiceConfig, DiceRoll, Player } from './types';
import type { DiceThreeState, Die3D } from './dice3d/types';
import { _DIE_TARGET, _DIE_TARGET_D3 } from './dice3d/cube';
import { _diceBodyColor, _diceNumColor, buildDieByType, dieClearHighlight, dieHighlightFace, dieStopQuaternion } from './dice3d/die';

/* ══════════ LANCEUR DE DÉS ══════════ */
export var diceConfig: DiceConfig = { faces: 6, count: 1 };
export var diceHistory: DiceRoll[] = [];
export var diceLastResult: DiceRoll | null = null; // {rolls:[...], sum:N}
export var DICE_FACE_OPTIONS = [2,3,4,6,8,10,12,20,24,30,48,60,100,120];
export var DICE_MAX_COUNT = 9;
export var DICE_MIN_FACES = 2, DICE_MAX_FACES = 100;

// Charger la config mémorisée
try {
  var _dc = localStorage.getItem('scoretrack_dice_cfg');
  if (_dc) { var o = JSON.parse(_dc); if(o&&o.faces&&o.count){ diceConfig.faces=o.faces; diceConfig.count=o.count; } }
} catch(e){}

export function diceSaveCfg(): void {
  try { localStorage.setItem('scoretrack_dice_cfg', JSON.stringify(diceConfig)); } catch(e){}
}

export function diceT(key: string): string {
  // libellés localisés minimalistes (fallback FR)
  var lang = (typeof currentLang!=='undefined') ? currentLang : 'fr';
  var L: Record<string, Record<string, string>> = {
    fr:{title:'🎲 Lanceur de dés',faces:'Faces',count:'Dés',roll:'🎲 Lancer',add:'+ Ajouter',sub:'− Retirer',
        close:'Fermer',back:'← Retour',hist:'Historique',pickAdd:'Ajouter à quel joueur ?',
        pickSub:'Retirer à quel joueur ?',empty:'Aucun lancer',sum:'Total',type:'Type'},
    en:{title:'🎲 Dice roller',faces:'Faces',count:'Dice',roll:'🎲 Roll',add:'+ Add',sub:'− Remove',
        close:'Close',back:'← Back',hist:'History',pickAdd:'Add to which player?',
        pickSub:'Remove from which player?',empty:'No rolls yet',sum:'Total',type:'Type'},
    pt:{title:'🎲 Lançador de dados',faces:'Faces',count:'Dados',roll:'🎲 Lançar',add:'+ Adicionar',sub:'− Remover',
        close:'Fechar',back:'← Voltar',hist:'Histórico',pickAdd:'Adicionar a qual jogador?',
        pickSub:'Remover de qual jogador?',empty:'Nenhum lançamento',sum:'Total',type:'Tipo'}
  };
  return (L[lang]||L.fr)[key] ?? L.fr[key] ?? key;
}

export function openDice(): void {
  var ov = $opt('dice-overlay');
  if(!ov) return;
  // libellés
  $('dice-title').textContent = diceT('title');
  $('dice-faces-label').textContent = diceT('type');
  $('dice-count-label').textContent = diceT('count');
  $('dice-roll-btn').textContent = diceT('roll');
  $('dice-add-btn').textContent = diceT('add');
  $('dice-sub-btn').textContent = diceT('sub');
  $('dice-close-btn').textContent = diceT('close');
  $('dice-pick-back').textContent = diceT('back');
  $('dice-history-title').textContent = diceT('hist');
  // reset état avant affichage
  _diceRolled=false;
  $('dice-result').innerHTML='';
  $('dice-post').style.display='none';
  $('dice-player-pick').style.display='none';
  // Pliage : tout premier usage (jamais utilisé) => déplié ; ensuite replié.
  var everUsed=false;
  try{ everUsed = localStorage.getItem('scoretrack_dice_used')==='1'; }catch(e){}
  var cfg=$opt('dice-config');
  var tog=$opt('dice-config-toggle');
  var collapsed = everUsed;   // 1er usage -> déplié, sinon replié
  if(cfg) cfg.classList.toggle('collapsed', collapsed);
  if(tog){ tog.classList.toggle('collapsed', collapsed); tog.setAttribute('aria-expanded', collapsed?'false':'true'); }
  ov.classList.remove('hidden');
  // config (déclenche l'aperçu) + historique une fois la modal visible
  diceRenderConfig();
  diceRenderHistory();
}
export function closeDice(): void {
  var ov=$opt('dice-overlay');
  if(ov)ov.classList.add('hidden');
  var sh=ov&&$q<HTMLElement>('.dice-sheet',ov);
  if(sh){ sh.style.transition=''; sh.style.transform=''; }
  if(ov) ov.style.background='';
}
// Glisser la feuille vers le bas pour la fermer (même geste que les pavés numériques).
// Le geste part de n'importe où sur la feuille sauf les boutons ; dans une zone qui
// défile (historique, partie haute), il n'est pris que si elle est déjà en haut.
(function initDiceDrag(){
  var overlay=$opt('dice-overlay');
  var sheet=overlay&&$q<HTMLElement>('.dice-sheet',overlay);
  if(!sheet) return;
  // overlay / sheet : non nuls après la garde ci-dessus pour tout le reste de l'IIFE ;
  // TS ne propage pas ce rétrécissement dans les fonctions hissées -> assertions `!`.
  var _active=false,_decided=false,_sx=0,_sy=0,_lastD=0,_lastT=0,_vel=0,_scroller: Element | null=null;
  function startDrag(e: TouchEvent){
    if(overlay!.classList.contains('hidden')||e.touches.length>1) return;
    if((e.target as Element).closest('button,.dice-players,.dice-faces-quick,.dice-select-row')) return;
    _scroller=(e.target as Element).closest('.dice-history-list,.dice-sheet-top');
    _active=true;_decided=false;_vel=0;_lastD=0;_lastT=performance.now();
    _sx=e.touches[0].clientX;_sy=e.touches[0].clientY;
    document.addEventListener('touchmove',onMove,{passive:false});
    document.addEventListener('touchend',onEnd,{passive:false});
    document.addEventListener('touchcancel',onEnd,{passive:false});
  }
  function onMove(e: TouchEvent){
    if(!_active) return;
    var dx=e.touches[0].clientX-_sx, dy=e.touches[0].clientY-_sy;
    if(!_decided){
      if(Math.abs(dx)<6&&Math.abs(dy)<6) return;            // pas encore un geste
      // vers le haut, ou horizontal, ou zone défilante non remontée -> laisser le défilement natif
      if(dy<=0||Math.abs(dx)>Math.abs(dy)||(_scroller&&_scroller.scrollTop>0)){ cancel(); return; }
      _decided=true; sheet!.style.transition='none';
    }
    e.preventDefault();
    var now=performance.now(), d=Math.max(0,dy);
    var dt=now-_lastT; if(dt>0) _vel=(d-_lastD)/dt;
    _lastD=d;_lastT=now;
    sheet!.style.transform='translateY('+d+'px)';
    overlay!.style.background='rgba(0,0,0,'+(0.55*(1-Math.min(d/200,1))).toFixed(3)+')';
  }
  function cancel(){
    _active=false;_decided=false;
    document.removeEventListener('touchmove',onMove);
    document.removeEventListener('touchend',onEnd);
    document.removeEventListener('touchcancel',onEnd);
  }
  function onEnd(e: TouchEvent){
    var was=_active&&_decided; var d=_lastD, v=_vel;
    cancel();
    if(!was||overlay!.classList.contains('hidden')) return;
    if(d>120||v>0.3){
      sheet!.style.transition='transform 0.2s cubic-bezier(0.4,0,1,1)';
      sheet!.style.transform='translateY(100vh)';
      overlay!.style.transition='background 0.2s linear'; overlay!.style.background='rgba(0,0,0,0)';
      setTimeout(function(){ overlay!.style.transition=''; closeDice(); },210);
    } else {
      sheet!.style.transition='transform 0.25s cubic-bezier(0.32,0.72,0,1)';
      sheet!.style.transform='';
      overlay!.style.transition='background 0.25s ease'; overlay!.style.background='';
      setTimeout(function(){ overlay!.style.transition=''; },260);
    }
  }
  sheet.addEventListener('touchstart',startDrag,{passive:true});
})();

export function diceRenderConfig(): void {
  var isPercent=(diceConfig.faces===100);
  // libellé faces : "d100" etc.
  $('dice-faces-val').textContent = 'd'+diceConfig.faces;
  var _badge=$opt('dice-type-badge'); if(_badge) _badge.textContent='d'+diceConfig.faces;
  // nombre : figé à "2×d10" pour le d100
  $('dice-count-val').textContent = isPercent ? '2' : String(diceConfig.count);
  // boutons des 14 types
  var q=$('dice-faces-quick'); q.innerHTML='';
  DICE_FACE_OPTIONS.forEach(function(f){
    var b=document.createElement('button');
    b.className='dice-quick'+(diceConfig.faces===f?' on':'');
    b.textContent='d'+f;
    b.addEventListener('click',function(){ if(_diceRolling) _diceCancelRoll(); diceConfig.faces=f; diceSaveCfg(); _diceRolled=false; diceRenderConfig(); });
    q.appendChild(b);
  });
  // désactiver les steps de nombre pour le d100 (paire de d10 fixe)
  var cm=$opt<HTMLButtonElement>('dice-count-minus'), cp=$opt<HTMLButtonElement>('dice-count-plus');
  if(cm) cm.disabled=isPercent; if(cp) cp.disabled=isPercent;
  _diceRolled=false;
  diceRenderPreview();
}
export function diceToggleConfig(): void {
  var cfg=$opt('dice-config');
  var tog=$opt('dice-config-toggle');
  if(!cfg||!tog) return;
  var collapsed=cfg.classList.toggle('collapsed');
  tog.classList.toggle('collapsed', collapsed);
  tog.setAttribute('aria-expanded', collapsed?'false':'true');
}
// Annule proprement un roulage en cours (avant de changer type/nombre).
export function _diceCancelRoll(): void {
  if(_diceRollGuard){ clearTimeout(_diceRollGuard); _diceRollGuard=null; }
  if(_diceThree && _diceThree.dice){
    _diceThree.dice.forEach(function(o){
      if(o && o.raf){ cancelAnimationFrame(o.raf); o.raf=null; }
      if(o && o.die) dieClearHighlight(o.die);
    });
  }
  _diceRolling=false;
  var rb=$opt<HTMLButtonElement>('dice-roll-btn'); if(rb) rb.disabled=false;
  _diceRolled=false;
}
export function diceFacesStep(d: number): void {
  if(_diceRolling) _diceCancelRoll();
  // navigation par index dans la liste des 14 types
  var idx=DICE_FACE_OPTIONS.indexOf(diceConfig.faces);
  if(idx<0) idx=DICE_FACE_OPTIONS.indexOf(6);
  idx=Math.max(0,Math.min(DICE_FACE_OPTIONS.length-1,idx+d));
  diceConfig.faces=DICE_FACE_OPTIONS[idx];
  diceSaveCfg(); _diceRolled=false; diceRenderConfig();
}
export function diceCountStep(d: number): void {
  if(diceConfig.faces===100) return; // d100 = paire fixe
  if(_diceRolling) _diceCancelRoll();
  diceConfig.count=Math.max(1,Math.min(DICE_MAX_COUNT,diceConfig.count+d));
  diceSaveCfg(); _diceRolled=false; diceRenderConfig();
}


export var _diceThree: DiceThreeState = { dice:[] };


export function diceBuild3D(container: HTMLElement, faceVal: number, sizePx?: number, dieIdx?: number): Die3D {
  var W=sizePx||88, H=sizePx||88;
  var type=diceConfig.faces;
  var variant=(type===100 && dieIdx===0)?'tens':undefined; // d100 : 1er dé = dizaines
  var scene=new THREE.Scene();
  // caméra en légère plongée pour lire la face du dessus (sauf cube: frontal)
  var camera=new THREE.PerspectiveCamera(40,1,0.1,100);
  // distance caméra adaptée : petits solides plus proches, gros solides un peu reculés
  var camDist: number;
  var isCube=(type===6||type===3);
  // solides normalisés au même rayon -> une seule distance (plus proche = plus gros)
  camDist=4.4; // marge suffisante : dé plus grand ET entier
  var camPos: THREE.Vector3;
  if(isCube) camPos=new THREE.Vector3(0,0,camDist);
  else if(type===2) camPos=new THREE.Vector3(0,camDist*0.62,camDist*0.72); // pièce : plus de plongée pour voir la tranche
  else camPos=new THREE.Vector3(0,camDist*0.5,camDist*0.8);
  camera.position.copy(camPos); camera.lookAt(0,0,0);
  var renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
  renderer.setSize(W,H); renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.domElement.style.width=W+'px'; renderer.domElement.style.height=H+'px';
  container.appendChild(renderer.domElement);

  var body=_diceBodyColor();   // fond de carte joueur le plus en phase avec le thème
  var numCol=_diceNumColor();  // ton des chiffres de score des cartes

  // Corps toujours moyen-sombre [0.16, 0.30] -> UNE seule config d'éclairage,
  // celle du rendu validé, optimisée pour cette plage.
  var amb=new THREE.AmbientLight(0xffffff,0.70); scene.add(amb);
  var key=new THREE.DirectionalLight(0xffffff,1.18); key.position.set(3,6,5);
  key.castShadow=true; scene.add(key);
  var fill=new THREE.DirectionalLight(0xbcd6ff,0.45); fill.position.set(-4,1,3); scene.add(fill);
  var rim=new THREE.DirectionalLight(0xffffff,0.55); rim.position.set(-2,-3,-4); scene.add(rim);
  var die=buildDieByType(type, body, numCol, variant); scene.add(die);

  var floor=new THREE.Mesh(new THREE.PlaneGeometry(12,12),new THREE.ShadowMaterial({opacity:0.22}));
  floor.rotation.x=-Math.PI/2; floor.position.y=-1.75; floor.receiveShadow=true; scene.add(floor);

  // pose statique : le résultat max par défaut, face caméra / à plat
  var camDir=camPos.clone().normalize();
  die.userData.camDir=camDir;
  var poseVal=isCube?faceVal:(die.userData.faces?die.userData.faces[0].value:faceVal);
  if(isCube){ var tt=(type===3?_DIE_TARGET_D3:_DIE_TARGET)[faceVal]||{x:0,y:0}; die.rotation.set(tt.x,tt.y,0); }
  else { die.quaternion.copy(dieStopQuaternion(die, poseVal, camDir)); }
  renderer.render(scene,camera);

  var obj: Die3D={renderer:renderer, scene:scene, camera:camera, die:die, type:type, camDir:camDir, raf:null};
  _diceThree.dice.push(obj);
  return obj;
}

// Anime un dé PERSISTANT existant vers finalVal (générique tous types).
export function diceAnimate3D(obj: Die3D, finalVal: number, delayMs: number, dur: number, onDone?: () => void): void {
  if(obj.raf) cancelAnimationFrame(obj.raf);
  var die=obj.die, renderer=obj.renderer, scene=obj.scene, camera=obj.camera;
  var type=obj.type;
  if(type===6||type===3){
    // cube (d6 et d3) : rotation euler x/y (pips)
    var startX=die.rotation.x, startY=die.rotation.y;
    var target=(type===3?_DIE_TARGET_D3:_DIE_TARGET)[finalVal]||{x:0,y:0};
    var spinsX=(2+Math.floor(Math.random()*2))*Math.PI*2;
    var spinsY=(2+Math.floor(Math.random()*2))*Math.PI*2;
    var endX=target.x+spinsX, endY=target.y+spinsY;
    var t0: number | null=null;
    var ease=function(t: number){return 1-Math.pow(1-t,3);};
    var frame=function(now: number){
      if(t0===null)t0=now;
      var el=now-t0-delayMs;
      if(el<0){ renderer.render(scene,camera); obj.raf=requestAnimationFrame(frame); return; }
      var t=Math.min(1,el/dur), e=ease(t);
      die.rotation.x=startX+(endX-startX)*e; die.rotation.y=startY+(endY-startY)*e;
      renderer.render(scene,camera);
      if(t<1)obj.raf=requestAnimationFrame(frame);
      else {
        obj.raf=null;
        try { die.rotation.set(target.x,target.y,0); renderer.render(scene,camera); }
        catch(e){ /* ne jamais bloquer la fin de lancer */ }
        finally { if(onDone)onDone(); }
      }
    };
    obj.raf=requestAnimationFrame(frame);
    return;
  }
  // autres solides : vrai roulage — plusieurs tours multi-axes puis arrêt face caméra
  dieClearHighlight(die); // relancer : on masque l'ancien halo
  var endQ=dieStopQuaternion(die, finalVal, obj.camDir);
  // axe principal de roulage (aléatoire, normalisé) + axe secondaire orthogonal
  var axisA=new THREE.Vector3(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1);
  if(axisA.lengthSq()<1e-4)axisA.set(1,0,0);
  axisA.normalize();
  var axisB=new THREE.Vector3(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1);
  axisB.crossVectors(axisA,axisB);
  if(axisB.lengthSq()<1e-4)axisB.set(0,1,0); else axisB.normalize();
  // nombre de tours : 3 à 4 tours sur l'axe principal, 1 à 2 sur le secondaire
  var spinA=(6+Math.random()*2)*2*Math.PI; // tourne davantage
  var spinB=(3+Math.random()*1.5)*2*Math.PI; // tourne davantage
  var t0: number | null=null;
  var ease=function(t: number){return 1-Math.pow(1-t,3);}; // décélération douce
  var qSpinA=new THREE.Quaternion(), qSpinB=new THREE.Quaternion(), q=new THREE.Quaternion();
  var frame=function(now: number){
    if(t0===null)t0=now;
    var el=now-t0-delayMs;
    if(el<0){ renderer.render(scene,camera); obj.raf=requestAnimationFrame(frame); return; }
    var t=Math.min(1,el/dur), e=ease(t);
    // angle de spin restant : maximal au départ, ramené à 0 à l'arrivée (1-e)
    var rem=1-e;
    qSpinA.setFromAxisAngle(axisA, spinA*rem);
    qSpinB.setFromAxisAngle(axisB, spinB*rem);
    // orientation = spins résiduels appliqués APRÈS l'orientation d'arrêt
    q.copy(qSpinA).multiply(qSpinB).multiply(endQ);
    die.quaternion.copy(q); renderer.render(scene,camera);
    if(t<1)obj.raf=requestAnimationFrame(frame);
    else {
      obj.raf=null;
      try { die.quaternion.copy(endQ); dieHighlightFace(die, finalVal); renderer.render(scene,camera); }
      catch(e){ /* ne jamais bloquer la fin de lancer */ }
      finally { if(onDone)onDone(); }
    }
  };
  obj.raf=requestAnimationFrame(frame);
}

// Libère les ressources GPU (géométries/matériaux/textures) d'une scène de dé avant
// de la jeter. `renderer.dispose()` NE le fait PAS lui-même : il vide seulement les
// caches internes du renderer (WeakMap remplacée), sans jamais appeler
// gl.deleteBuffer/gl.deleteTexture sur les objets Three.js eux-mêmes (vérifié dans
// three@0.149 : WebGLProperties.dispose() = `properties = new WeakMap()`). La
// libération réelle dépend donc de `forceContextLoss()`, qui n'agit que si
// l'extension WEBGL_lose_context est disponible (absente ou bridée selon le pilote
// GPU). Bonne pratique Three.js standard dans tous les cas ; mesuré (RSS process,
// voir docs/audit/DECISIONS-C.md §1.1/§2) : différence dans le bruit de mesure quand
// l'extension est disponible (environnement prescrit par CLAUDE.md), effet net mais
// modeste quand elle est indisponible/bridée — ne pas sur-vendre cette correction
// comme la suppression d'une fuite massive : c'est un filet de sécurité pour les
// environnements dégradés, pas un changement mesurable dans l'environnement standard.
// On ne libère jamais une texture marquée `shared` (cache _numTexCache de die.ts,
// réutilisé par tous les dés vivants) ; les textures de points du d6/d3/pièce
// (_dieFaceTexture), elles, sont régénérées à chaque construction et doivent être
// libérées.
export function _disposeSceneResources(scene: THREE.Scene): void {
  scene.traverse(function(obj){
    var o=obj as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
      shadow?: { map: THREE.Texture | null };
    };
    if(o.geometry) o.geometry.dispose();
    if(o.material){
      (Array.isArray(o.material)?o.material:[o.material]).forEach(function(m){
        var map=(m as THREE.Material & { map?: THREE.Texture | null }).map;
        if(map && !map.userData.shared) map.dispose();
        m.dispose();
      });
    }
    if(o.shadow && o.shadow.map) o.shadow.map.dispose();
  });
}
export function _disposeDice3D(): void {
  _diceThree.dice.forEach(function(o){
    try{
      if(o.raf)cancelAnimationFrame(o.raf);
      _disposeSceneResources(o.scene);
      o.renderer.forceContextLoss();
      o.renderer.dispose();
    }catch(e){}
  });
  _diceThree.dice=[];
}

// Aperçu / mise en place des dés selon la config (avant lancer).
// Crée les dés PERSISTANTS qui serviront ensuite au lancer.
export function diceRenderPreview(): void {
  if(_diceRolled) return;               // après un lancer, on garde le résultat
  var res=$opt('dice-result');
  if(!res) return;
  _disposeDice3D();
  res.innerHTML='';
  $('dice-post').style.display='none';
  var faces=diceConfig.faces, count=diceConfig.count;
  var isPercent=(faces===100);
  // d100 = paire de d10 (2 dés : dizaines + unités), count forcé à 2 par "jet"
  var nDice = isPercent ? 2 : count;
  var wrap=document.createElement('div'); wrap.className='dice-faces-wrap dice-preview';
  wrap.id='dice-faces-wrap';
  var use3d=(typeof THREE!=='undefined' && typeof buildDieByType!=='undefined');
  // taille d'un dé calée sur la largeur dispo : jusqu'à 3 par ligne, dés aussi grands
  // que possible tout en restant entiers (le canvas n'est plus figé à 88px).
  var _gap=12, _perRow=Math.min(3, nDice||1);
  var _avail=(res.clientWidth||window.innerWidth||360);
  var _cellPx=Math.floor((_avail - 8 - (_perRow-1)*_gap)/_perRow);
  _cellPx=Math.max(104, Math.min(180, _cellPx));
  var containers: HTMLElement[]=[];
  for(var i=0;i<nDice;i++){
    if(use3d){
      var cell=document.createElement('div'); cell.className='die3d-cell';
      cell.style.width=_cellPx+'px'; cell.style.height=_cellPx+'px';
      wrap.appendChild(cell); containers.push(cell);
    } else {
      var el=document.createElement('div'); el.className='dieN dieN-preview';
      el.textContent=String(1+Math.floor(Math.random()*faces));
      wrap.appendChild(el);
    }
  }
  res.appendChild(wrap);
  if(use3d){
    containers.forEach(function(cell, idx){
      var v=(faces===6)?1+Math.floor(Math.random()*6):(faces===3?1+Math.floor(Math.random()*3):1);
      diceBuild3D(cell, v, _cellPx, idx);
    });
  }
}

// ReturnType<typeof setTimeout> plutôt que `number` : sous tsconfig.test.json
// (types:["node"], atteint transitivement via les imports des tests), le lib
// Node ambiant fait résoudre setTimeout() en NodeJS.Timeout et non en number ;
// ce typage reste correct dans les deux environnements (build navigateur réel
// via esbuild comme sous ce tsconfig de test).
export var _diceRolling=false; var _diceRollGuard: ReturnType<typeof setTimeout> | null=null;
export var _diceRolled=false;   // un lancer a-t-il eu lieu depuis l'ouverture ? (masque l'aperçu)

export function rollDice(): void {
  if(_diceRolling)return;
  var res=$('dice-result');
  var rollBtn=$opt<HTMLButtonElement>('dice-roll-btn');
  var faces=diceConfig.faces, count=diceConfig.count;
  var isPercent=(faces===100);
  var nDice = isPercent ? 2 : count;

  // Tirage des valeurs par dé
  var rolls: number[]=[];
  if(isPercent){
    // 2 d10 : dizaines (0..9) et unités (0..9) -> 1..100
    rolls.push(Math.floor(Math.random()*10)); // dizaines
    rolls.push(Math.floor(Math.random()*10)); // unités
  } else if(faces===10){
    for(var i=0;i<nDice;i++) rolls.push(Math.floor(Math.random()*10)); // 0..9
  } else {
    for(var i=0;i<nDice;i++) rolls.push(1+Math.floor(Math.random()*faces));
  }

  // Somme / valeur affichée
  var sum: number, percentVal: number | null=null;
  if(isPercent){
    percentVal = rolls[0]*10 + rolls[1]; if(percentVal===0) percentVal=100;
    sum = percentVal;
  } else {
    sum = rolls.reduce(function(a,b){return a+b;},0);
  }
  diceLastResult={rolls:rolls.slice(),sum:sum,faces:faces,count:nDice,percent:isPercent};

  $('dice-post').style.display='none';
  $('dice-player-pick').style.display='none';
  if(rollBtn)rollBtn.disabled=true;
  _diceRolling=true;

  // filet de sécurité : quoi qu'il arrive, on relâche le verrou après un délai large
  if(_diceRollGuard) clearTimeout(_diceRollGuard);
  _diceRollGuard=setTimeout(function(){
    _diceRolling=false;
    if(rollBtn)rollBtn.disabled=false;
  }, 6000);

  var use3d=(typeof THREE!=='undefined' && typeof buildDieByType!=='undefined');

  if(use3d){
    // réutiliser les dés de l'aperçu ; reconstruire si le compte diffère
    if(_diceThree.dice.length!==nDice){ _diceRolled=false; diceRenderPreview(); }
  } else {
    _disposeDice3D(); res.innerHTML='';
    var wrapN=document.createElement('div'); wrapN.className='dice-faces-wrap'; wrapN.id='dice-faces-wrap';
    rolls.forEach(function(){ var el=document.createElement('div'); el.className='dieN';
      el.textContent=String(1+Math.floor(Math.random()*faces)); wrapN.appendChild(el); });
    res.appendChild(wrapN);
  }
  _diceRolled=true;
  try{ localStorage.setItem('scoretrack_dice_used','1'); }catch(e){}

  var fw=$opt('dice-faces-wrap');
  if(fw) fw.classList.remove('dice-preview');

  // Total / pourcentage — un seul à la fois
  var oldSum=res.querySelector('.dice-sum'); if(oldSum) oldSum.remove();
  var sumEl: HTMLDivElement | null=null;
  var showTotal = true; // toujours afficher le total, même à 1 dé
  if(showTotal){
    sumEl=document.createElement('div'); sumEl.className='dice-sum'; sumEl.style.opacity='0';
    // d100 compris : on compte des points comme pour les autres dés (pas de « % », source de confusion)
    sumEl.innerHTML=diceT('sum')+' : <b>'+sum+'</b>';
    res.appendChild(sumEl);
  }
  if(navigator.vibrate)navigator.vibrate([12,40,12,40,18,30]);

  var settled=0, totalDice=rolls.length, _finished=false;
  function onOneDone(){
    settled++;
    if(navigator.vibrate)navigator.vibrate(14);
    if(settled>=totalDice && !_finished){
      _finished=true;
      if(_diceRollGuard){ clearTimeout(_diceRollGuard); _diceRollGuard=null; }
      if(sumEl){ sumEl.style.transition='opacity 0.25s'; sumEl.style.opacity='1'; }
      _diceRolling=false;
      if(rollBtn)rollBtn.disabled=false;
      $('dice-post').style.display='block';
      diceHistory.unshift({rolls:rolls.slice(),sum:sum,faces:faces,count:nDice,percent:isPercent});
      if(diceHistory.length>30)diceHistory.pop();
      diceRenderHistory();
    }
  }

  if(use3d){
    rolls.forEach(function(v,idx){
      var dur=1500+idx*150, delay=idx*130; // durée allongée : rotations bien visibles
      var obj=_diceThree.dice[idx];
      // valeur à afficher sur le dé : pour d10/d100 la face 0..9 = v ; sinon v
      var faceVal = v;
      if(obj){ diceAnimate3D(obj, faceVal, delay, dur, onOneDone); }
      else onOneDone();
    });
  } else {
    var dieEls=res.querySelectorAll('.dieN');
    rolls.forEach(function(v,idx){
      var dur=780+idx*160, el=dieEls[idx];
      if(!el){ onOneDone(); return; }
      el.classList.add('rolling');
      var start=performance.now();
      (function tick(now: number){
        var t=(now-start)/dur;
        if(t<1){ el.textContent=String(1+Math.floor(Math.random()*faces));
          setTimeout(function(){requestAnimationFrame(tick);},30+t*t*150);
        } else { el.textContent=String(v); el.classList.remove('rolling'); el.classList.add('settle'); }
      })(start);
      setTimeout(onOneDone,dur);
    });
  }
}

export function diceRenderHistory(): void {
  var list=$opt('dice-history-list'); if(!list)return;
  list.innerHTML='';
  if(diceHistory.length===0){
    var e=document.createElement('div'); e.className='dice-hist-empty'; e.textContent=diceT('empty');
    list.appendChild(e); return;
  }
  diceHistory.forEach(function(h){
    var row=document.createElement('div'); row.className='dice-hist-row';
    var cfg=document.createElement('span'); cfg.className='cfg';
    cfg.textContent = h.percent ? 'd100' : (h.count+'d'+h.faces);
    var res=document.createElement('span'); res.className='res';
    // d100 : les deux faces telles que lues sur les dés (dizaines 00..90, unités 0..9)
    res.textContent = h.percent ? (String(h.rolls[0]*10).padStart(2,'0')+' · '+h.rolls[1]) : h.rolls.join(' · ');
    var tot=document.createElement('span'); tot.className='tot';
    tot.textContent = String(h.sum);
    row.appendChild(cfg); row.appendChild(res); row.appendChild(tot);
    list!.appendChild(row); // list : testé en tête de fonction (rétrécissement perdu dans la fermeture)
  });
}

// Choix du joueur pour ajouter/retirer
export function dicePickPlayer(mode: string): void {
  if(!diceLastResult)return;
  var pick=$('dice-player-pick');
  var prompt=$('dice-pick-prompt');
  var listEl=$('dice-players-list');
  prompt.textContent = mode==='add'? diceT('pickAdd') : diceT('pickSub');
  listEl.innerHTML='';
  if(typeof players==='undefined'||!players){return;}
  players.forEach(function(p: Player, i: number){
    if(p.eliminated||p.winner)return;
    var b=document.createElement('button'); b.className='dice-player-btn';
    var num=document.createElement('span'); num.className='num'; num.textContent=String(i+1);
    var nm=document.createElement('span'); nm.textContent=p.playerName||('#'+(i+1));
    var sc=document.createElement('span'); sc.className='sc'; sc.textContent=String(p.score);
    b.appendChild(num); b.appendChild(nm); b.appendChild(sc);
    b.addEventListener('click',function(){ diceApplyToPlayer(i, mode); });
    listEl.appendChild(b);
  });
  $('dice-post').style.display='none';
  pick.style.display='block';
}
export function diceCancelPick(): void {
  $('dice-player-pick').style.display='none';
  $('dice-post').style.display='block';
}
export function diceApplyToPlayer(i: number, mode: string): void {
  if(!diceLastResult)return;
  var delta = mode==='add'? diceLastResult.sum : -diceLastResult.sum;
  if(navigator.vibrate)navigator.vibrate([20,15,20]);
  // fermer d'abord pour que la carte du joueur soit visible (animations flashZone)
  closeDice();
  if(typeof adjust==='function'){
    var zone=$opt('card-'+i)||undefined;
    adjust(i, delta, zone);
  }
}

// Afficher/masquer le bouton flottant selon l'écran actif
export function diceUpdateFab(): void {
  var fab=$opt('dice-fab');
  if(!fab)return;
  var gs=$opt('game-screen');
  var visible = gs && getComputedStyle(gs).display!=='none';
  if(visible)fab.classList.remove('hidden'); else fab.classList.add('hidden');
}



// Relance l'aperçu des dés (thème changé pendant que le lanceur est ouvert).
export function diceResetPreview(): void { _diceRolled=false; diceRenderPreview(); }
