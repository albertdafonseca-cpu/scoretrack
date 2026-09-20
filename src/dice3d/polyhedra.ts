import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

/* ═══════ SOLIDES D'ARCHIMÈDE → DUAL DE CATALAN (vrais dés) ═══════ */
export var PHI=(1+Math.sqrt(5))/2, IPHI=1/PHI;
export function _V(x: number, y: number, z: number): THREE.Vector3 { return new THREE.Vector3(x,y,z); }

export function allPerms(a: number, b: number, c: number): THREE.Vector3[] {
  var orders=[[a,b,c],[a,c,b],[b,a,c],[b,c,a],[c,a,b],[c,b,a]];
  var out: THREE.Vector3[]=[], set: Record<string, 1>={};
  orders.forEach(function(t){
    for(var sx=-1;sx<=1;sx+=2)for(var sy=-1;sy<=1;sy+=2)for(var sz=-1;sz<=1;sz+=2){
      var x=sx*t[0], y=sy*t[1], z=sz*t[2];
      var key=x.toFixed(5)+','+y.toFixed(5)+','+z.toFixed(5);
      if(!set[key]){ set[key]=1; out.push(_V(x,y,z)); }
    }
  });
  return out;
}
export function evenPerms(a: number, b: number, c: number): THREE.Vector3[] {
  var cyc=[[a,b,c],[b,c,a],[c,a,b]];
  var out: THREE.Vector3[]=[], set: Record<string, 1>={};
  cyc.forEach(function(t){
    for(var sx=-1;sx<=1;sx+=2)for(var sy=-1;sy<=1;sy+=2)for(var sz=-1;sz<=1;sz+=2){
      var x=sx*t[0], y=sy*t[1], z=sz*t[2];
      var key=x.toFixed(5)+','+y.toFixed(5)+','+z.toFixed(5);
      if(!set[key]){ set[key]=1; out.push(_V(x,y,z)); }
    }
  });
  return out;
}
export function dedupe(vs: THREE.Vector3[]): THREE.Vector3[] {
  var out: THREE.Vector3[]=[],set: Record<string, 1>={};
  vs.forEach(function(v){var k=v.x.toFixed(4)+','+v.y.toFixed(4)+','+v.z.toFixed(4);
    if(!set[k]){set[k]=1;out.push(v);}});
  return out;
}

export function archRhombicuboctahedron(): THREE.Vector3[] { var t=1+Math.sqrt(2); return allPerms(1,1,t); }
export function archTruncCuboctahedron(): THREE.Vector3[] { return allPerms(1,1+Math.sqrt(2),1+2*Math.sqrt(2)); }
export function archIcosidodecahedron(): THREE.Vector3[] {
  var vs: THREE.Vector3[]=[]; vs=vs.concat(evenPerms(0,0,PHI));
  vs=vs.concat(evenPerms(0.5, PHI/2, (PHI*PHI)/2)); return dedupe(vs);
}
export function archRhombicosidodecahedron(): THREE.Vector3[] {
  var vs: THREE.Vector3[]=[]; var p2=PHI*PHI, p3=PHI*PHI*PHI;
  vs=vs.concat(evenPerms(1,1,p3));
  vs=vs.concat(evenPerms(p2,PHI,2*PHI));
  vs=vs.concat(evenPerms(2+PHI,0,p2)); return dedupe(vs);
}
export function archTruncIcosidodecahedron(): THREE.Vector3[] {
  var vs: THREE.Vector3[]=[]; var p=PHI;
  vs=vs.concat(evenPerms(1/p, 1/p, 3+p));
  vs=vs.concat(evenPerms(2/p, p, 1+2*p));
  vs=vs.concat(evenPerms(1/p, p*p, -1+3*p));
  vs=vs.concat(evenPerms(2*p-1, 2, 2+p));
  vs=vs.concat(evenPerms(p, 3, 2*p)); return dedupe(vs);
}

/** Plan d'une face du solide d'Archimède (normale + distance à l'origine). */
interface HullFace { normal: THREE.Vector3; plane: number }

export function dualVertices(archPoints: THREE.Vector3[]): THREE.Vector3[] {
  var hull=new ConvexGeometry(archPoints);
  var pos=hull.attributes.position as THREE.BufferAttribute, nrm=hull.attributes.normal as THREE.BufferAttribute;
  var faces: HullFace[]=[];
  for(var i=0;i<pos.count;i+=3){
    var a=new THREE.Vector3().fromBufferAttribute(pos,i);
    var b=new THREE.Vector3().fromBufferAttribute(pos,i+1);
    var c=new THREE.Vector3().fromBufferAttribute(pos,i+2);
    var center=a.clone().add(b).add(c).multiplyScalar(1/3);
    var n=new THREE.Vector3().fromBufferAttribute(nrm,i).normalize();
    var f=faces.find(function(f){return f.normal.dot(n)>0.999 && Math.abs(f.plane-center.dot(n))<0.05;});
    if(!f){ faces.push({normal:n.clone(), plane:center.dot(n)}); }
  }
  return faces.map(function(f){
    var d=f.plane; if(Math.abs(d)<1e-6)d=1e-6;
    return f.normal.clone().multiplyScalar(1/d);
  });
}
export function catalanDie(archFn: () => THREE.Vector3[], radius?: number, onSphere?: boolean | number): ConvexGeometry {
  var dv=dualVertices(archFn());
  var maxr=0; dv.forEach(function(v){maxr=Math.max(maxr,v.length());});
  // garde-fou division par zéro : un solide dégénéré (tous les sommets à l'origine)
  // ne peut pas survenir avec les 5 solides d'Archimède codés en dur ci-dessus,
  // mais un futur appelant avec une géométrie dégénérée ne doit pas produire de
  // sommets NaN/Infinity (silhouette invisible plutôt qu'un crash de rendu).
  var s=(radius||1.3)/(maxr||1e-6);
  dv.forEach(function(v){v.multiplyScalar(s);});
  var geo=new ConvexGeometry(dv);
  // Solides à faces TRIANGULAIRES (d48, d120) : les sommets d'un solide de Catalan
  // sont à trois distances différentes du centre -> silhouette bosselée. On les
  // ramène tous sur la sphère englobante : les faces restent planes (triangles),
  // la triangulation est conservée, la silhouette devient ronde comme un vrai d120.
  // onSphere = taux de rapprochement (1 = pile sur la sphère). Le d120 ne supporte
  // pas 1 : ses sommets de valence 4 deviendraient coplanaires avec leurs voisins
  // (les paires de triangles fusionneraient en 60 cerfs-volants).
  if(onSphere){
    var t=(onSphere===true)?1:onSphere;
    var pos=geo.attributes.position as THREE.BufferAttribute, v=new THREE.Vector3(), R=radius||1.3;
    for(var i=0;i<pos.count;i++){
      v.fromBufferAttribute(pos,i); var r=v.length()||1e-6;
      var f=(r+(R-r)*t)/r; pos.setXYZ(i,v.x*f,v.y*f,v.z*f);
    }
    pos.needsUpdate=true; geo.computeVertexNormals();
  }
  return geo;
}

