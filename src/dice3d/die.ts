import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { _DIE_TARGET, _DIE_TARGET_D3, _dieFaceTexture, _makeDie, _themeColorHex } from './cube';
import { archIcosidodecahedron, archRhombicosidodecahedron, archRhombicuboctahedron, archTruncCuboctahedron, archTruncIcosidodecahedron, catalanDie } from './polyhedra';
import type { BodyGeoUserData, DieFace, DieGroup, DiePlates, NumTexUserData, PlateMesh, RoundEdge, RoundVert } from './types';

/* ═══════ RENDU DÉ COMPLET (faces + chiffres + orientation) ═══════ */
// dense : glyphe agrandi dans sa texture (~90 % de la largeur) pour les PETITES plaques
// (d48, d120) ; les autres dés gardent le glyphe validé (marge autour du chiffre).
export function dieNumTexture(n: string | number, colorHex: number, dense?: boolean): THREE.CanvasTexture {
  var c=document.createElement('canvas'); c.width=c.height=128;
  var x=c.getContext('2d') as CanvasRenderingContext2D; x.clearRect(0,0,128,128); // contexte 2D toujours disponible sur un canvas neuf (comme avant : erreur sinon)
  var col='#'+colorHex.toString(16).padStart(6,'0');
  n=''+n; // libellé texte : "7", "0", "00", "90"...
  var s=n.length;
  var fs = dense ? (s>=3 ? 56 : (s===2 ? 72 : 88)) : (s>=3 ? 46 : (s===2 ? 60 : 76));
  x.font='bold '+fs+'px Arial, sans-serif';
  var mw=x.measureText(n).width; if(mw>114){ fs=Math.floor(fs*114/mw); x.font='bold '+fs+'px Arial, sans-serif'; }
  x.textAlign='center'; x.textBaseline='middle';
  // Pas de contour : le contraste chiffre/corps est garanti par construction
  // (couleur des scores sur fond de carte, comme sur les cartes). Glyphe net.
  if(dense){
    // petites plaques : encre blanche pure et trait épaissi -> les chiffres minuscules
    // restent lumineux après réduction (le mélange avec le corps les ternit sinon)
    col='#ffffff'; x.strokeStyle=col; x.lineWidth=3; x.lineJoin='round'; x.strokeText(n,64,66);
  }
  x.fillStyle=col; x.fillText(n,64,66);
  if(n==='6'||n==='9'){ var w=fs*0.5; x.fillRect(64-w/2,66+fs*0.42,w,5); }
  var t=new THREE.CanvasTexture(c); t.anisotropy=16; // 16 : chiffres nets en vue rasante (Three plafonne au max du GPU)
  // encombrement du glyphe en fraction du côté de la plaque (largeur mesurée, hauteur ~0.78 fs avec soulignement)
  (t.userData as NumTexUserData).box={w:Math.min(0.95,(x.measureText(n).width+6)/128), h:Math.min(0.95,(fs*0.78+6)/128)};
  return t;
}
export function dieExtractFaces(geo: THREE.BufferGeometry): DieFace[] {
  if(geo.index!==null) geo=geo.toNonIndexed();  // évite le warning si déjà non-indexé
  var pos=geo.attributes.position as THREE.BufferAttribute, nrm=geo.attributes.normal as THREE.BufferAttribute; var faces: DieFace[]=[];
  for(var i=0;i<pos.count;i+=3){
    var a=new THREE.Vector3().fromBufferAttribute(pos,i);
    var b=new THREE.Vector3().fromBufferAttribute(pos,i+1);
    var c=new THREE.Vector3().fromBufferAttribute(pos,i+2);
    var center=a.clone().add(b).add(c).multiplyScalar(1/3);
    var n=new THREE.Vector3().fromBufferAttribute(nrm,i).normalize();
    var f=faces.find(function(f){return f.normal.dot(n)>0.9985;}); // fusion sur la normale seule (faces multi-triangles)
    // face en construction : inradius/poly calculés juste après, value posée par dieAssignValues
    if(!f){ faces.push({normal:n.clone(), center:center.clone(), acc:center.clone(), cnt:1, verts:[a.clone(),b.clone(),c.clone()]} as DieFace); }
    else { f.acc!.add(center); f.cnt!++; f.verts.push(a.clone(),b.clone(),c.clone()); }
  }
  faces.forEach(function(f){
    // sommets uniques du polygone (le hull ne crée pas de sommet interne)
    var uniq: THREE.Vector3[]=[], seen: Record<string, 1>={};
    f.verts.forEach(function(v){ var k=v.x.toFixed(4)+'|'+v.y.toFixed(4)+'|'+v.z.toFixed(4);
      if(!seen[k]){ seen[k]=1; uniq.push(v); } });
    f.center.set(0,0,0); uniq.forEach(function(v){ f.center.add(v); }); f.center.multiplyScalar(1/Math.max(1,uniq.length));
    // circonrayon = distance MAX centre->sommet
    var rmax=0;
    uniq.forEach(function(v){ var d=v.distanceTo(f.center); if(d>rmax) rmax=d; });
    f.circum=(rmax>1e-4)?rmax:0.5;
    // VRAI rayon inscrit : sommets ordonnés autour du centre, puis distance minimale
    // du centre à chaque arête. Exact pour les triangles scalènes (d48/d120) comme
    // pour les pentagones (d12) -> chiffre toujours contenu dans sa face.
    var n=f.normal, ax=new THREE.Vector3(1,0,0);
    if(Math.abs(n.dot(ax))>0.9) ax.set(0,1,0);
    var ex=new THREE.Vector3().crossVectors(n,ax).normalize(), ey=new THREE.Vector3().crossVectors(n,ex).normalize();
    uniq.sort(function(a,b){ var da=a.clone().sub(f.center), db=b.clone().sub(f.center);
      return Math.atan2(da.dot(ey),da.dot(ex)) - Math.atan2(db.dot(ey),db.dot(ex)); });
    var rin=Infinity;
    for(var i=0;i<uniq.length;i++){
      var a=uniq[i], b=uniq[(i+1)%uniq.length];
      var ab=b.clone().sub(a), L=ab.length(); if(L<1e-6) continue;
      var d=new THREE.Vector3().crossVectors(ab, f.center.clone().sub(a)).length()/L;
      if(d<rin) rin=d;
    }
    f.inradius=(isFinite(rin)&&rin>1e-4)?rin:f.circum*0.5;
    f.poly=uniq; // sommets ordonnés (sens direct autour de la normale)
  });
  return faces;
}
export function dieAssignValues(faces: DieFace[], N: number): void {
  var used=new Array(faces.length).fill(false); var pairs: [number, number][]=[];
  for(var i=0;i<faces.length;i++){
    if(used[i])continue;
    var best=-1,bd=1;
    for(var j=0;j<faces.length;j++){
      if(j===i||used[j])continue;
      var d=faces[i].normal.dot(faces[j].normal);
      if(d<bd){bd=d;best=j;}
    }
    used[i]=true; if(best>=0)used[best]=true; pairs.push([i,best]);
  }
  var v=1;
  pairs.forEach(function(pr){
    faces[pr[0]].value=v;
    if(pr[1]>=0) faces[pr[1]].value=N+1-v;
    v++;
  });
}
export function buildNumberedDie(geo: THREE.BufferGeometry, N: number, bodyHex: number, numHex: number, bodyGeoOverride?: THREE.BufferGeometry, plateOffset?: number, labels?: Record<number, string>): DieGroup {
  var group=new THREE.Group() as DieGroup;
  labels=labels||{}; // libellé optionnel par valeur (ex. d10 : {10:'0'} ; d100 dizaines : {1:'10',...,10:'00'})
  // corps affiché : override si fourni (solide chanfreiné), sinon la géométrie brute
  var bodyGeo=bodyGeoOverride||geo;
  // flatShading : nets par défaut ; un override est lissé sauf s'il porte
  // userData.flatShade (chanfrein) -> facettes et arêtes nettes.
  var _flat = bodyGeoOverride ? (bodyGeoOverride.userData && (bodyGeoOverride.userData as BodyGeoUserData).flatShade===true) : true;
  // gros dés (>= 48 faces) : matériau plus mat -> facettes moins contrastées, boule lisible
  var _big=(N>=48);
  var mat=new THREE.MeshStandardMaterial({color:bodyHex,roughness:_big?0.62:0.42,metalness:_big?0.06:0.14,flatShading:_flat}); // jeux de lumière (rendu validé)
  group.add(new THREE.Mesh(bodyGeo,mat));
  // faces/chiffres toujours extraits de la géométrie nette (geo)
  var faces=dieExtractFaces(geo); dieAssignValues(faces,N);
  var poff=(typeof plateOffset==='number')?plateOffset:0.012; // offset chiffre le long de la normale
  faces.forEach(function(f){
    if(f.value>N) return;
    // taille uniforme : tous les chiffres à la même taille généreuse (celle du d4).
    // On vise une constante ; on ne réduit QUE si la face est vraiment trop petite
    // pour l'accueillir (borne à inradius*2.0, très permissive).
    // taille : le chiffre doit TENIR dans sa face -> plus petit sur les gros dés,
    // ce qui fait apparaître des rangées nettes (comme un vrai d100/d120), sans
    // chevauchement. Plafond global abaissé ; plancher pour rester lisible.
    // Le glyphe occupe ~0.35 de la demi-diagonale de sa plaque : une plaque de côté
    // 2.0 x inradius reste donc contenue dans le cercle inscrit de la face.
    var DS_TARGET=0.72;                 // plafond global
    var _rr=(bodyGeoOverride&&bodyGeoOverride.userData&&(bodyGeoOverride.userData as BodyGeoUserData).roundR)||0;
    // la demi-diagonale du glyphe vaut ~0.35 x côté de plaque : une plaque de
    // 2.6 x (inradius - r) garde le glyphe sur la partie PLANE de la face (inradius - r),
    // sans chiffre flottant au-dessus de l'arrondi
    var flatIn=Math.max(0.05,(f.inradius||0.5)-_rr);
    var dsFit=flatIn*2.6;
    var ds=Math.min(DS_TARGET, dsFit);
    if(ds<0.22) ds=0.22;                // plancher lisible
    var label=(labels[f.value]!==undefined)?labels[f.value]:f.value;
    var dense=(ds<0.45); // petites plaques (d48, d120) : glyphe agrandi dans la texture
    // "haut" de référence : +Y monde, ou +Z si la face est quasi horizontale
    var worldUp=new THREE.Vector3(0,1,0);
    if(Math.abs(f.normal.dot(worldUp))>0.94) worldUp.set(0,0,1);
    // projeter worldUp sur le plan de la face -> vrai "haut" du chiffre (non renversé)
    var trueUp=worldUp.clone().addScaledVector(f.normal,-worldUp.dot(f.normal));
    if(trueUp.lengthSq()<1e-6) trueUp.set(1,0,0); else trueUp.normalize();
    var right=new THREE.Vector3().crossVectors(trueUp,f.normal).normalize();
    var tex=_numTex(label,numHex,dense);
    if(dense && f.poly && f.poly.length>=3){
      // Petites faces (triangles allongés du d48/d120) : le cercle inscrit est très
      // conservateur. On ajuste la plaque au VRAI polygone de la face, dans l'orientation
      // du chiffre : le rectangle du glyphe (box) doit rester à l'intérieur de chaque
      // arête (moins la moitié de l'arrondi, tangent à la face).
      // encombrement de référence : le libellé le plus large du dé (même taille de
      // chiffres pour "1" et "120" ; seule l'orientation de la face fait varier la place)
      var refLabel=(labels[N]!==undefined)?labels[N]:N;
      var refTex=_numTex(refLabel,numHex,true);
      var box=(refTex.userData&&(refTex.userData as NumTexUserData).box)||{w:0.9,h:0.5};
      var fitPoly=Infinity;
      for(var ei=0;ei<f.poly.length;ei++){
        var pa=f.poly[ei], pb=f.poly[(ei+1)%f.poly.length];
        var e=pb.clone().sub(pa); if(e.lengthSq()<1e-8) continue; e.normalize();
        var mIn=new THREE.Vector3().crossVectors(f.normal,e).normalize();
        var toC=f.center.clone().sub(pa); if(toC.dot(mIn)<0) mIn.negate();
        var dist=toC.dot(mIn)-_rr*0.5;
        var ext=0.5*(box.w*Math.abs(mIn.dot(right))+box.h*Math.abs(mIn.dot(trueUp)));
        if(ext>1e-6) fitPoly=Math.min(fitPoly, dist/ext);
      }
      // borné à 1.5 x l'ajustement au cercle inscrit : gain net, sans écarts criants d'une face à l'autre
      if(isFinite(fitPoly)) ds=Math.min(DS_TARGET, Math.max(ds, Math.min(fitPoly, ds*1.5)));
    }
    var pl=new THREE.Mesh(new THREE.PlaneGeometry(ds,ds),
      new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,side:THREE.FrontSide})) as PlateMesh; // FrontSide : une face cachée ne laisse pas dépasser son chiffre au bord du corps arrondi
    pl.userData.label=label; pl.userData.dense=dense; // pour rebasculer le chiffre cerclé sur la texture standard
    if(plateOffset){
      // offset explicite : poser le chiffre à distance poff de l'origine le long de la normale
      pl.position.copy(f.normal).multiplyScalar(poff);
    } else {
      pl.position.copy(f.center).addScaledVector(f.normal,0.012);
    }
    // base orthonormée directe : X=right, Y=trueUp, Z=normal (face vers l'extérieur)
    var m=new THREE.Matrix4().makeBasis(right,trueUp,f.normal);
    pl.quaternion.setFromRotationMatrix(m);
    group.add(pl);
    if(!group.userData.plates) group.userData.plates={};
    (group.userData.plates[f.value]=group.userData.plates[f.value]||[]).push(pl);
  });
  // halo de résultat : anneau coloré (accent2, colorblind-safe) repositionné sur la
  // face gagnante à l'arrêt. Construit pour une largeur unité, mis à l'échelle à l'usage.
  var _haloHex=_diceInk(bodyHex); // encre contrastée : visible partout, daltonien-safe
  var halo=new THREE.Mesh(
    new THREE.RingGeometry(0.60,0.76,40),
    new THREE.MeshBasicMaterial({color:_haloHex,transparent:true,opacity:0.85,side:THREE.DoubleSide,depthWrite:false}));
  halo.visible=false; group.add(halo); group.userData.halo=halo;
  group.userData.faces=faces; group.userData.N=N; group.userData.numHex=numHex;
  group.userData.numbered=true; // dé à chiffres (≠ cube/coin) : éligible "un seul chiffre"
  return group;
}
// Oriente toutes les plaques-chiffres (et le halo) face à la caméra : chiffres
// toujours droits dans le sens de l'écran, quel que soit l'angle du dé.
export function _dieBillboard(group: DieGroup | null | undefined, camera: THREE.Camera | null | undefined): void {
  if(!group || !group.userData || !group.userData.plates || !camera) return;
  var gq=group.getWorldQuaternion(new THREE.Quaternion());
  var target=gq.invert().multiply(camera.quaternion); // quat local -> face écran
  var plates=group.userData.plates;
  Object.keys(plates).forEach(function(k){
    plates[k].forEach(function(pl){ pl.quaternion.copy(target); });
  });
  var halo=group.userData.halo;
  if(halo && halo.visible) halo.quaternion.copy(target);
}
// Surligne la face résultat : place l'anneau halo autour du chiffre gagnant.
export var _RESULT_SCALE=1.35;   // agrandissement minimal du chiffre du résultat
export var _RESULT_WIDTH=0.78;   // largeur visée de la plaque agrandie (lisible sur d48/d60/d120)
export function dieHighlightFace(group: DieGroup | null | undefined, val: number): void {
  if(!group || !group.userData || !group.userData.halo) return;
  var plates: DiePlates=(group.userData.plates)||{};
  var arr=plates[val];
  var halo=group.userData.halo;
  if(!arr || !arr.length){ halo.visible=false; return; }
  var pl=arr[0];
  if(arr.length>1 && group.userData.camDir){
    // plusieurs plaques pour une même valeur (d4 : 3 faces autour du sommet) :
    // le halo va sur celle qui regarde le plus la caméra
    var gq=group.getWorldQuaternion(new THREE.Quaternion()), bestD=-2;
    arr.forEach(function(p){
      var n=new THREE.Vector3(0,0,1).applyQuaternion(p.quaternion).applyQuaternion(gq);
      var d=n.dot(group.userData.camDir!); if(d>bestD){ bestD=d; pl=p; } // camDir : testé juste au-dessus
    });
  }
  var w=(pl.geometry && pl.geometry.parameters && pl.geometry.parameters.width)||0.8;
  if(pl.userData.dense && group.userData.numHex!==undefined){
    // chiffre cerclé : texture STANDARD (glyphe à taille d'origine, encre ivoire) ;
    // seuls les chiffres non cerclés gardent le glyphe agrandi / l'encre blanche
    // encre BLANCHE comme ses voisins (chiffres denses en blanc pur) : l'ivoire paraissait grisâtre à côté
    pl.material.map=_numTex(pl.userData.label!, 0xffffff, false); pl.material.needsUpdate=true; // label : toujours posé sur les plaques des dés à chiffres
  }
  // petites faces (gros dés) : on agrandit davantage pour atteindre une largeur lisible
  var rw=group.userData.resultWidth||_RESULT_WIDTH;
  var sc=Math.max(_RESULT_SCALE, Math.min(2.8, rw/w));
  arr.forEach(function(p){                       // agrandit le(s) chiffre(s) du résultat
    if(!p.userData._baseScale) p.userData._baseScale=p.scale.clone();
    p.scale.copy(p.userData._baseScale).multiplyScalar(p===pl?sc:1);
  });
  halo.position.copy(pl.position);
  halo.quaternion.copy(pl.quaternion);
  halo.scale.setScalar(w*sc*0.875);              // le halo entoure le chiffre agrandi
  halo.visible=true;
}
export function dieClearHighlight(group: DieGroup | null | undefined): void {
  if(!group || !group.userData) return;
  if(group.userData.halo) group.userData.halo.visible=false;
  var plates: DiePlates=group.userData.plates||{};                 // restaure la taille (et la texture) des chiffres
  Object.keys(plates).forEach(function(k){
    (plates[k]||[]).forEach(function(p){
      if(p.userData._baseScale) p.scale.copy(p.userData._baseScale);
      if(p.userData.dense && group.userData.numHex!==undefined){
        var dt=_numTex(p.userData.label!, group.userData.numHex, true); // label : toujours posé sur les plaques des dés à chiffres
        if(p.material.map!==dt){ p.material.map=dt; p.material.needsUpdate=true; }
      }
    });
  });
}
// À l'arrêt : n'affiche que la plaque de la valeur du dessus (dés numérotés).
export function dieShowSingle(group: DieGroup | null | undefined, val: number): void {
  if(!group || !group.userData || !group.userData.numbered) return;
  var plates: DiePlates=group.userData.plates||{};
  Object.keys(plates).forEach(function(k){
    var show=(parseInt(k,10)===val);
    plates[k].forEach(function(pl){ pl.visible=show; });
  });
}
// Remontre toutes les plaques (aperçu au repos / avant un nouveau lancer).
export function dieShowAll(group: DieGroup | null | undefined): void {
  if(!group || !group.userData || !group.userData.numbered) return;
  var plates: DiePlates=group.userData.plates||{};
  Object.keys(plates).forEach(function(k){
    plates[k].forEach(function(pl){ pl.visible=true; });
  });
}
export function dieTopQuaternion(group: DieGroup, value: number, camDir?: THREE.Vector3 | null): THREE.Quaternion {
  var faces=group.userData.faces!; // dés à faces uniquement (le cube est traité par dieStopQuaternion)
  var f=faces.find(function(f){return f.value===value;});
  if(!f) return new THREE.Quaternion();
  var target=(camDir?camDir.clone():new THREE.Vector3(0,0.55,1)).normalize();
  var q1=new THREE.Quaternion().setFromUnitVectors(f.normal.clone().normalize(),target);
  var screenUp=new THREE.Vector3(0,1,0);
  // référence "haut du chiffre" IDENTIQUE à celle utilisée pour poser la plaque
  // (buildNumberedDie) : +Y local projeté sur la face (+Z si face quasi horizontale).
  var _wu=new THREE.Vector3(0,1,0);
  if(Math.abs(f.normal.dot(_wu))>0.94) _wu.set(0,0,1);
  var trueUp=_wu.clone().addScaledVector(f.normal,-_wu.dot(f.normal));
  if(trueUp.lengthSq()<1e-6) trueUp.set(1,0,0); else trueUp.normalize();
  if(f.upRef) trueUp=f.upRef.clone().normalize(); // référence imposée (d4 : face avant en bas)
  var ref=trueUp.applyQuaternion(q1);
  ref.addScaledVector(target,-ref.dot(target));
  var wantUp=screenUp.clone().addScaledVector(target,-screenUp.dot(target));
  if(ref.lengthSq()>1e-6 && wantUp.lengthSq()>1e-6){
    ref.normalize(); wantUp.normalize();
    var cross=new THREE.Vector3().crossVectors(ref,wantUp);
    var sign=Math.sign(cross.dot(target))||1;
    var ang=Math.acos(Math.max(-1,Math.min(1,ref.dot(wantUp))))*sign;
    var q2=new THREE.Quaternion().setFromAxisAngle(target,ang);
    return q2.multiply(q1);
  }
  return q1;
}


/* ═══ Définition des 14 types de dés ═══ */
export var DICE_ALL_TYPES=[2,3,4,6,8,10,12,20,24,30,48,60,100,120];

// Géométrie par type (retourne une THREE.BufferGeometry ou null pour cube/coin)
export function dieGeometryFor(type: number): THREE.BufferGeometry | null {
  switch(type){
    case 2:   return new THREE.CylinderGeometry(1.15,1.15,0.34,44); // pièce
    case 3:   return _prismGeo();
    case 4:   return new THREE.TetrahedronGeometry(1.4); // arêtes chanfreinées comme les autres solides
    case 6:   return null; // cube arrondi à pips (géré à part)
    case 8:   return new THREE.OctahedronGeometry(1.4);
    case 10:  return _trapezoGeo();
    case 12:  return new THREE.DodecahedronGeometry(1.25);
    case 20:  return new THREE.IcosahedronGeometry(1.3);
    case 24:  return catalanDie(archRhombicuboctahedron,1.35);
    case 30:  return catalanDie(archIcosidodecahedron,1.35);
    case 48:  return catalanDie(archTruncCuboctahedron,1.35,true);
    case 60:  return catalanDie(archRhombicosidodecahedron,1.35);
    case 120: return catalanDie(archTruncIcosidodecahedron,1.35,0.85); // 1 fusionnerait les faces par paires
    case 100: return _trapezoGeo(); // d100 = paire de d10 (chaque dé est un d10)
    default:  return new THREE.IcosahedronGeometry(1.3);
  }
}
export function _prismGeo(): ConvexGeometry {
  var pts: THREE.Vector3[]=[],r=1.15,h=1.35;
  for(var s=-1;s<=1;s+=2)for(var k=0;k<3;k++){
    var a=k*2*Math.PI/3+Math.PI/2; pts.push(new THREE.Vector3(r*Math.cos(a),s*h/2,r*Math.sin(a)));}
  return new ConvexGeometry(pts);
}
export function _trapezoGeo(): ConvexGeometry {
  var pts: THREE.Vector3[]=[],rTop=1.0,zOff=0.30,apex=1.2;
  pts.push(new THREE.Vector3(0,apex,0)); pts.push(new THREE.Vector3(0,-apex,0));
  for(var k=0;k<5;k++){var a1=k*2*Math.PI/5,a2=a1+Math.PI/5;
    pts.push(new THREE.Vector3(rTop*Math.cos(a1),zOff,rTop*Math.sin(a1)));
    pts.push(new THREE.Vector3(rTop*Math.cos(a2),-zOff,rTop*Math.sin(a2)));}
  return new ConvexGeometry(pts);
}

// Met à l'échelle une géométrie pour que son rayon englobant = targetR.
// -> tous les solides occupent la même taille à l'écran.
export function _normalizeGeoRadius(geo: THREE.BufferGeometry, targetR: number): THREE.BufferGeometry {
  geo.computeBoundingSphere();
  var r=(geo.boundingSphere && geo.boundingSphere.radius)||1;
  if(r>1e-4){ geo.scale(targetR/r, targetR/r, targetR/r); }
  return geo;
}
export var DICE_TARGET_R=1.42; // rayon englobant commun (marge anti-coupe)
export var CHAMFER_T=0.08; // fraction d'arête rabotée à chaque sommet (pointes adoucies)
// Encre lisible : renvoie une couleur foncée sur fond clair, claire sur fond foncé.
export function _contrastInk(hex: number): number {
  var r=(hex>>16)&255, g=(hex>>8)&255, b=hex&255;
  var lum=(0.2126*r + 0.7152*g + 0.0722*b)/255; // luminance perçue
  return (lum>0.58) ? 0x15181c : 0xffffff;
}
export function _hexLum(hex: number): number { var r=(hex>>16)&255,g=(hex>>8)&255,b=hex&255; return (0.2126*r+0.7152*g+0.0722*b)/255; }
// plafonne la luminance (évite le blanc pur : garde une marge pour l'ombrage des facettes)
export function _capLum(hex: number, maxL: number): number { var l=_hexLum(hex); if(l<=maxL||l<=0) return hex; return _mixHex(hex,0x000000,1-(maxL/l)); }
export function _mixHex(hex: number, toHex: number, t: number): number {
  var r=(hex>>16)&255,g=(hex>>8)&255,b=hex&255;
  var R=(toHex>>16)&255,G=(toHex>>8)&255,B=toHex&255;
  var m=function(a: number, c: number){return Math.round(a+(c-a)*t);};
  return (m(r,R)<<16)|(m(g,G)<<8)|m(b,B);
}
// Couleur de corps du dé, adaptée jour/nuit :
// - thème CLAIR : accent pâli (jamais blanc pur) -> boule claire, chiffres foncés.
// - thème SOMBRE : accent normalisé en luminance moyenne -> boule colorée, chiffres clairs.
// teinte/saturation d'une couleur 0xRRGGBB (h en degrés 0-360, s en 0-1)
export function _hexHS(hex: number): { h: number; s: number } {
  var r=((hex>>16)&255)/255, g=((hex>>8)&255)/255, b=(hex&255)/255;
  var mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn, hDeg=0;
  if(d>0){
    if(mx===r) hDeg=60*(((g-b)/d)%6);
    else if(mx===g) hDeg=60*(((b-r)/d)+2);
    else hDeg=60*(((r-g)/d)+4);
    if(hDeg<0) hDeg+=360;
  }
  var lum=(mx+mn)/2;
  var s=(d===0)?0:d/(1-Math.abs(2*lum-1));
  return {h:hDeg, s:s};
}
// fond calculé de la carte joueur color-n POUR LE THÈME ACTIF (couleur unie, sans texture)
export function _cardBgHex(n: number): number | null {
  var probe: HTMLDivElement | null=null;
  try{
    probe=document.createElement('div');
    probe.className='pcard color-'+n;
    probe.style.cssText='position:absolute;visibility:hidden;pointer-events:none;width:1px;height:1px;';
    document.body.appendChild(probe);
    var c=getComputedStyle(probe).backgroundColor;
    var m=c&&c.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if(m) return (parseInt(m[1],10)<<16)|(parseInt(m[2],10)<<8)|parseInt(m[3],10);
  }catch(e){}
  finally{
    // retirer la sonde même si getComputedStyle/le regex a levé une exception :
    // sinon un échec en cours de route laisse un <div> orphelin dans le <body>
    // (appelé jusqu'à 10x par dé construit -> fuite DOM visible en aperçu répété).
    if(probe && probe.parentNode) probe.parentNode.removeChild(probe);
  }
  return null;
}
export function _diceBodyColor(): number {
  // Corps du dé = fond de carte joueur le plus en phase avec le thème (teinte proche
  // de l'accent ; carte la moins colorée si accent quasi gris), couleur unie sans
  // texture, puis NORMALISÉ dans une plage moyenne-sombre FIXE [0.16, 0.30] :
  // base prévisible sur tous les thèmes, relief garanti, jamais de dé blanc.
  var accent=_themeColorHex('--accent',0x9965A9);
  var ahs=_hexHS(accent);
  var best: number | null=null, bestScore=Infinity;
  for(var n=1;n<=10;n++){
    var c=_cardBgHex(n);
    if(c===null) continue;
    var hs=_hexHS(c), sc: number;
    if(ahs.s<0.15){ sc=hs.s; }                       // thème neutre -> carte la moins colorée
    else{
      var dh=Math.abs(hs.h-ahs.h); if(dh>180) dh=360-dh;
      sc=dh + (hs.s<0.08?90:0);                      // teinte proche ; éviter les cartes grises
    }
    if(sc<bestScore){ bestScore=sc; best=c; }
  }
  var c2=(best!==null)?best:_themeColorHex('--surface',0x1a1a24);
  var l=_hexLum(c2);
  if(l<0.16) c2=_mixHex(c2, 0xffffff, (0.16-l)/(1-l));
  else if(l>0.30) c2=_mixHex(c2, 0x000000, 1-(0.30/l));
  return c2;
}
// Chiffres du dé = même ton que les chiffres des cartes (.score). On lit la couleur
// CALCULÉE d'un élément .score (respecte les surcharges par thème), fallback --accent.
export function _diceNumColor(): number {
  // Encre IVOIRE légèrement teintée par l'accent du thème (règle des fabricants de
  // dés : corps coloré + encre quasi-blanche). Sur corps normalisé [0.16, 0.30],
  // contraste massif et constant (>= 0.55 de luminance), net sans contour.
  var accent=_themeColorHex('--accent',0x9965A9);
  // Un accent SOMBRE (thèmes clairs : bleu #3355cc, noir…) grisait l'ivoire : on ne
  // teinte qu'avec un accent lumineux, sinon ivoire pur.
  if(_hexLum(accent)<0.6) return 0xFFF6E8;
  return _mixHex(0xFFF6E8, accent, 0.12);
}
// Encre des dés (chiffres, arêtes, halo) : contraste de LUMINANCE garanti avec le
// corps -> lisible aussi pour les daltoniens (jamais un contraste de teinte seule).
export function _diceInk(bodyHex: number): number { return _contrastInk(bodyHex); }
// Corps ARRONDI d'un solide convexe (aspect résine des vrais dés) : chaque face reste
// plane mais rétrécie de r ; chaque arête devient un quart de cylindre de rayon r et
// chaque sommet une calotte sphérique. Les normales sont lissées sur les arrondis et
// exactes (plates) sur les faces : arêtes douces qui accrochent la lumière, faces nettes.
// Construction : centre de coin c_v = point à distance r de tous les plans incidents au
// sommet v ; tous les points de la surface s'écrivent c_v + r * direction.
export var ROUND_R=0.18;    // rayon d'arrondi des arêtes et pointes (unités scène ; dé de rayon 1.42) : pointes en vraie courbe
export var ROUND_SEGS=4;    // segments par quart de cylindre
export function _roundedBody(geo: THREE.BufferGeometry, r: number, segs?: number): THREE.BufferGeometry {
  segs=segs||ROUND_SEGS;
  var faces=dieExtractFaces(geo);
  var key=function(v: THREE.Vector3): string {return v.x.toFixed(4)+'|'+v.y.toFixed(4)+'|'+v.z.toFixed(4);};
  // sommets uniques + faces incidentes ; arêtes -> 2 faces
  var verts: Record<string, RoundVert>={}, edges: Record<string, RoundEdge>={};
  faces.forEach(function(f,fi){
    f.d=f.normal.dot(f.center);
    var P=f.poly!; // toujours posé par dieExtractFaces
    P.forEach(function(v,i){
      var k=key(v); if(!verts[k]) verts[k]={p:v.clone(), faces:[] as number[]} as RoundVert; verts[k].faces.push(fi); // c (centre de coin) calculé juste après
      var w=P[(i+1)%P.length], kw=key(w), ek=(k<kw)?k+'##'+kw:kw+'##'+k;
      if(!edges[ek]) edges[ek]={a:k,b:kw,faces:[]}; edges[ek].faces.push(fi);
    });
  });
  // centre de coin : moindres carrés sur (n_i . x = d_i - r)
  Object.keys(verts).forEach(function(k){
    var V=verts[k], M=new THREE.Matrix3(), me=[0,0,0,0,0,0,0,0,0], b=new THREE.Vector3();
    V.faces.forEach(function(fi){
      var n=faces[fi].normal, t=faces[fi].d!-r; // d posé sur toutes les faces ci-dessus
      me[0]+=n.x*n.x; me[1]+=n.x*n.y; me[2]+=n.x*n.z;
      me[3]+=n.y*n.x; me[4]+=n.y*n.y; me[5]+=n.y*n.z;
      me[6]+=n.z*n.x; me[7]+=n.z*n.y; me[8]+=n.z*n.z;
      b.addScaledVector(n,t);
    });
    M.set(me[0],me[1],me[2], me[3],me[4],me[5], me[6],me[7],me[8]);
    var det=M.determinant();
    if(Math.abs(det)<1e-9){ V.c=V.p.clone().multiplyScalar(1-r/Math.max(1e-3,V.p.length())); }
    else { V.c=b.clone().applyMatrix3(M.clone().invert()); }
  });
  var pts: THREE.Vector3[]=[], nrm: Record<string, THREE.Vector3>={};
  function add(p: THREE.Vector3, n: THREE.Vector3){ pts.push(p); nrm[key(p)]=n.clone(); }
  // 1) coins des faces planes rétrécies
  faces.forEach(function(f){ f.poly!.forEach(function(v){ var V=verts[key(v)]; add(V.c.clone().addScaledVector(f.normal,r), f.normal); }); });
  // 2) arêtes : arc de nA vers nB
  Object.keys(edges).forEach(function(ek){
    var E=edges[ek]; if(E.faces.length<2) return;
    var nA=faces[E.faces[0]].normal, nB=faces[E.faces[1]].normal;
    var phi=Math.acos(Math.max(-1,Math.min(1,nA.dot(nB)))); if(phi<1e-4) return;
    for(var j=1;j<segs;j++){
      var t=j/segs, u=nA.clone().multiplyScalar(Math.sin((1-t)*phi)).addScaledVector(nB,Math.sin(t*phi)).multiplyScalar(1/Math.sin(phi)).normalize();
      [E.a,E.b].forEach(function(k){ add(verts[k].c.clone().addScaledVector(u,r), u); });
    }
  });
  // 3) calottes des sommets
  Object.keys(verts).forEach(function(k){
    var V=verts[k], dir=V.p.clone().sub(V.c).normalize();
    add(V.c.clone().addScaledVector(dir,r), dir);
    V.faces.forEach(function(fi){
      var n=faces[fi].normal, m=dir.clone().add(n).normalize();
      add(V.c.clone().addScaledVector(m,r), m);
    });
  });
  var hull=new ConvexGeometry(pts);
  var hp=hull.attributes.position as THREE.BufferAttribute, pos: number[]=[], nor: number[]=[];
  var a=new THREE.Vector3(), b2=new THREE.Vector3(), c=new THREE.Vector3(), tn=new THREE.Vector3();
  for(var i=0;i<hp.count;i+=3){
    a.fromBufferAttribute(hp,i); b2.fromBufferAttribute(hp,i+1); c.fromBufferAttribute(hp,i+2);
    tn.crossVectors(b2.clone().sub(a), c.clone().sub(a)).normalize();
    var flat: THREE.Vector3 | null=null;
    for(var fi=0;fi<faces.length;fi++){ if(faces[fi].normal.dot(tn)>0.9995){ flat=faces[fi].normal; break; } }
    [a,b2,c].forEach(function(v){
      pos.push(v.x,v.y,v.z);
      var n=flat||nrm[key(v)]||tn; nor.push(n.x,n.y,n.z);
    });
  }
  var out=new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor,3));
  (out.userData as BodyGeoUserData).flatShade=false; // normales explicites : faces plates, arrondis lissés
  (out.userData as BodyGeoUserData).roundR=r;        // pour dimensionner les chiffres sur la partie PLANE des faces
  return out;
}
// Rayon d'arrondi adapté au dé : plafonné à une fraction du plus petit rayon inscrit
// (les chiffres doivent rester sur la partie plane des faces).
export function _roundRadiusFor(geo: THREE.BufferGeometry): number {
  var faces=dieExtractFaces(geo), m=Infinity;
  faces.forEach(function(f){ if(f.inradius<m) m=f.inradius; });
  return Math.min(ROUND_R, (isFinite(m)?m:0.3)*0.30);
}
// Corps du dé : arrondi si possible, chanfrein en repli.
export function _dieBody(geo: THREE.BufferGeometry, rOverride?: number): THREE.BufferGeometry {
  try { return _roundedBody(geo, rOverride||_roundRadiusFor(geo)); }
  catch(e){ return _chamferSolid(geo, CHAMFER_T); }
}
// Tronque légèrement chaque sommet d'un solide convexe : on remplace la pointe par
// une petite facette. Les faces d'origine restent planes, les arêtes restent nettes.
export function _chamferSolid(geo: THREE.BufferGeometry, t: number): THREE.BufferGeometry {
  var g=(geo.index!==null)?geo.toNonIndexed():geo;
  var pos=g.attributes.position as THREE.BufferAttribute;
  var key=function(v: THREE.Vector3): string {return v.x.toFixed(4)+'|'+v.y.toFixed(4)+'|'+v.z.toFixed(4);};
  var edges=new Map<string, [THREE.Vector3, THREE.Vector3]>();
  var va=new THREE.Vector3(),vb=new THREE.Vector3(),vc=new THREE.Vector3();
  function addEdge(p: THREE.Vector3, q: THREE.Vector3){var ka=key(p),kb=key(q);var ek=ka<kb?ka+'##'+kb:kb+'##'+ka;
    if(!edges.has(ek))edges.set(ek,[p.clone(),q.clone()]);}
  for(var i=0;i<pos.count;i+=3){
    va.fromBufferAttribute(pos,i);vb.fromBufferAttribute(pos,i+1);vc.fromBufferAttribute(pos,i+2);
    addEdge(va,vb);addEdge(vb,vc);addEdge(vc,va);
  }
  // points le long de chaque arête, près de chaque extrémité -> coupe les sommets
  var pts: THREE.Vector3[]=[];
  edges.forEach(function(pair){var a=pair[0],b=pair[1];
    pts.push(a.clone().lerp(b,t)); pts.push(b.clone().lerp(a,t));});
  var out: ConvexGeometry;
  try { out=new ConvexGeometry(pts); }
  catch(e){ return geo; } // repli défensif : garde la géo nette si le hull échoue
  (out.userData as BodyGeoUserData).flatShade=true; // arêtes nettes : facettes crisp
  return out;
}
// Cache de textures-chiffres (par valeur+couleur) : évite de régénérer 120 canvases.
export var _numTexCache: Record<string, THREE.CanvasTexture>={};
export function _numTex(value: string | number, colorHex: number, dense?: boolean): THREE.CanvasTexture {
  var key=value+'_'+colorHex+(dense?'_d':'');
  if(!_numTexCache[key]){
    var t=dieNumTexture(value,colorHex,dense);
    // partagée entre TOUTES les plaques qui réutilisent cette valeur/couleur (cache
    // ci-dessus) : disposeDieGroup ne doit jamais la libérer, seule une plaque non
    // mise en cache (ex. textures de points _dieFaceTexture) peut l'être sans risque.
    (t.userData as NumTexUserData).shared=true;
    _numTexCache[key]=t;
  }
  return _numTexCache[key];
}
// d4 "vrai" : les chiffres sont écrits près des SOMMETS (3 par face) ; la valeur lue
// est celle du sommet pointé vers le haut. Vu de dessus-devant, on voit la pyramide
// (3 faces) avec le résultat répété autour de la pointe, comme sur un d4 réel.
export function _buildVertexTetra(bodyHex: number, numHex: number): DieGroup {
  var geo=new THREE.TetrahedronGeometry(1.4);
  _normalizeGeoRadius(geo, DICE_TARGET_R*1.12); // un tétraèdre paraît petit : rayon légèrement majoré
  var group=new THREE.Group() as DieGroup;
  var bodyGeo=_dieBody(geo, D4_ROUND_R); // pointes bien arrondies (grandes faces : on peut se le permettre)
  var mat=new THREE.MeshStandardMaterial({color:bodyHex,roughness:0.42,metalness:0.14,flatShading:((bodyGeo.userData as BodyGeoUserData).flatShade!==false)});
  group.add(new THREE.Mesh(bodyGeo,mat));
  var faces=dieExtractFaces(geo);
  // sommets uniques du tétraèdre
  var verts: THREE.Vector3[]=[], seen: Record<string, 1>={};
  faces.forEach(function(f){ f.verts.forEach(function(v){
    var k=v.x.toFixed(3)+'|'+v.y.toFixed(3)+'|'+v.z.toFixed(3);
    if(!seen[k]){ seen[k]=1; verts.push(v.clone()); } }); });
  var plates: DiePlates={}, vFaces: DieFace[]=[];
  var ds=0.44;
  verts.forEach(function(v, vi){
    var value=vi+1;
    var dir=v.clone().normalize();
    // faces adjacentes = celles qui contiennent ce sommet
    var adj=faces.filter(function(f){ return f.verts.some(function(w){ return w.distanceTo(v)<1e-3; }); });
    adj.forEach(function(f){
      var toV=v.clone().sub(f.center);                       // dans le plan de la face
      var up=toV.clone().normalize();
      var right=new THREE.Vector3().crossVectors(up,f.normal).normalize();
      var pl=new THREE.Mesh(new THREE.PlaneGeometry(ds,ds),
        new THREE.MeshBasicMaterial({map:_numTex(value,numHex),transparent:true,depthWrite:false,side:THREE.FrontSide})) as PlateMesh;
      pl.position.copy(f.center).addScaledVector(toV,0.52).addScaledVector(f.normal,0.012);
      pl.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,f.normal));
      group.add(pl);
      (plates[value]=plates[value]||[]).push(pl);
    });
    // "haut" de référence pour l'orientation d'arrêt : l'opposé de la normale d'une
    // face adjacente, projeté perpendiculairement au sommet -> cette face se place
    // DEVANT (chiffre droit face au joueur), les deux autres partent en arrière.
    var fn=adj[0].normal.clone();
    var upRef=fn.clone().addScaledVector(dir,-fn.dot(dir)).multiplyScalar(-1).normalize();
    // vue de trois-quarts : 0° = face pile devant, 60° = arête devant
    upRef.applyAxisAngle(dir, _D4_YAW*Math.PI/180);
    vFaces.push({value:value, normal:dir, center:v.clone(), inradius:0.3, upRef:upRef} as DieFace); // face « sommet » : pas de polygone (verts)
  });
  var _haloHex=_diceInk(bodyHex);
  var halo=new THREE.Mesh(new THREE.RingGeometry(0.60,0.76,40),
    new THREE.MeshBasicMaterial({color:_haloHex,transparent:true,opacity:0.85,side:THREE.DoubleSide,depthWrite:false}));
  halo.visible=false; group.add(halo); group.userData.halo=halo;
  group.userData.faces=vFaces; group.userData.plates=plates; group.userData.N=4;
  group.userData.numbered=true; group.userData.type=4;
  group.userData.resultWidth=0.60; // agrandissement modéré : le chiffre reste près de la pointe
  return group;
}
export var _D4_TILT=2.5; // d4 : part de +Y ajoutée à la direction caméra pour la pointe (plus grand = plus vertical : pyramide posée)
export var D4_ROUND_R=0.18; // d4 : rayon d'arrondi des arêtes/pointes (plus fort que ROUND_R)
export var _D4_YAW=30;   // d4 : rotation autour de la pointe (0 = face devant, 60 = arête devant) -> trois-quarts
// Construit un dé complet selon le type. Renvoie {group, faces, N, type, special}
// variant : 'tens' pour le dé des dizaines du d100 (faces 00,10,...,90)
export function buildDieByType(type: number, bodyHex: number, numHex?: number, variant?: string): DieGroup {
  if(type===6){
    // cube arrondi à pips (réutilise _makeDie existant du fichier hôte)
    var g=_makeDie(bodyHex, numHex||0xffffff) as DieGroup;
    // wrapper faces pour cohérence (6 faces, valeurs via _DIE_TARGET)
    g.userData.faces=null; g.userData.N=6; g.userData.type=6; g.userData.special='cube';
    return g;
  }
  if(type===3){
    // d3 = cube à pips dont les 6 faces valent 1,2,3,1,2,3 (perspective parfaite du d6)
    var g3=_makeDie(bodyHex, numHex||0xffffff, [1,2,3,1,2,3]) as DieGroup;
    g3.userData.faces=null; g3.userData.N=3; g3.userData.type=3; g3.userData.special='cube';
    return g3;
  }
  if(type===2){
    return _buildCoin(bodyHex,numHex);
  }
  if(type===4){
    return _buildVertexTetra(bodyHex, numHex||0xffffff);
  }
  var geo=dieGeometryFor(type)!; // null seulement pour le d6, traité ci-dessus
  var N=(type===100)?10:type;
  // normalise la taille du solide (rayon englobant commun) AVANT extraction des faces
  _normalizeGeoRadius(geo, DICE_TARGET_R);
  // corps affiché : même traitement pour TOUS les solides (d4 -> d120) : chanfrein
  // léger des sommets, faces planes, arêtes nettes (rendu validé sur d8/d12/d20/d24/d30).
  var bodyOverride=_dieBody(geo);
  // libellés : d10 -> la face 10 s'écrit "0" ; dé des dizaines du d100 -> "10".."90","00"
  var labels: Record<number, string> | undefined;
  if(type===10||type===100){
    labels={};
    if(variant==='tens'){ for(var k=1;k<=9;k++) labels[k]=k+'0'; labels[10]='00'; }
    else labels[10]='0';
  }
  var g=buildNumberedDie(geo,N,bodyHex,numHex||0xffffff,bodyOverride,undefined,labels);
  // d10 et d100 : numéroter 0..9 (10 -> 0), faces ET plaques (halo/agrandissement du 0)
  if(type===10||type===100){
    g.userData.faces!.forEach(function(f){ if(f.value===10)f.value=0; }); // faces : toujours posées par buildNumberedDie
    if(g.userData.plates && g.userData.plates[10]){ g.userData.plates[0]=g.userData.plates[10]; delete g.userData.plates[10]; }
  }
  g.userData.type=type;
  return g;
}
export function _buildCoin(bodyHex: number, numHex?: number): DieGroup {
  var group=new THREE.Group() as DieGroup;
  var geo=new THREE.CylinderGeometry(1.15,1.15,0.32,44);
  var _cc=new THREE.Color(bodyHex).multiplyScalar(0.72); // pièce plus foncée/contrastée
  var mat=new THREE.MeshStandardMaterial({color:_cc,roughness:0.4,metalness:0.32});
  group.add(new THREE.Mesh(geo,mat));
  var nh=(numHex||0xffffff);
  ([[1,new THREE.Vector3(0,1,0)],[2,new THREE.Vector3(0,-1,0)]] as [number, THREE.Vector3][]).forEach(function(d){
    var pl=new THREE.Mesh(new THREE.PlaneGeometry(1.6,1.6),
      new THREE.MeshBasicMaterial({map:_dieFaceTexture(d[0],bodyHex,nh),transparent:true,depthWrite:false}));
    pl.position.copy(d[1]).multiplyScalar(0.17);
    var up=(d[1].y>0)?new THREE.Vector3(0,0,1):new THREE.Vector3(0,0,-1);
    var right=new THREE.Vector3().crossVectors(up,d[1]).normalize();
    var tu=new THREE.Vector3().crossVectors(d[1],right).normalize();
    pl.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,tu,d[1]));
    group.add(pl);
  });
  group.userData.faces=[
    {value:1,normal:new THREE.Vector3(0,1,0),center:new THREE.Vector3(0,0.17,0)},
    {value:2,normal:new THREE.Vector3(0,-1,0),center:new THREE.Vector3(0,-0.17,0)}] as DieFace[]; // faces synthétiques : pas de polygone ni d'inradius
  group.userData.N=2; group.userData.type=2; group.userData.special='coin';
  return group;
}

// Orientation d'arrêt (face caméra) — délègue à dieTopQuaternion pour les solides à faces,
// et à _DIE_TARGET pour le cube d6.
export function dieStopQuaternion(g: DieGroup, value: number, camDir?: THREE.Vector3 | null): THREE.Quaternion {
  if(g.userData.special==='cube'){
    var tbl=(g.userData.type===3)?_DIE_TARGET_D3:_DIE_TARGET;
    var t=tbl[value]||{x:0,y:0};
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(t.x,t.y,0));
  }
  // d4 : le SOMMET résultat pointe vers le haut, légèrement vers la caméra -> on voit
  // la pyramide (3 faces) et le chiffre de la face avant est droit.
  if(g.userData.type===4 && camDir){
    var tilted=camDir.clone().normalize().addScaledVector(new THREE.Vector3(0,1,0),_D4_TILT).normalize();
    return dieTopQuaternion(g, value, tilted);
  }
  return dieTopQuaternion(g, value, camDir);
}


