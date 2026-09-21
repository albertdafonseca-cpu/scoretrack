// Types du moteur de dés 3D (dice3d/*, dice-ui.ts).
import type * as THREE from 'three';

/** Face d'un solide, extraite de la géométrie nette (dieExtractFaces). */
export interface DieFace {
  /**
   * valeur affichée (1..N ; 0 pour la face « 10 » du d10). Posée par dieAssignValues
   * après l'extraction ; tous les consommateurs la supposent présente.
   */
  value: number;
  normal: THREE.Vector3;
  center: THREE.Vector3;
  /** accumulateur des centres de triangles (construction) */
  acc?: THREE.Vector3;
  cnt?: number;
  verts: THREE.Vector3[];
  /** distance max centre -> sommet */
  circum?: number;
  /** vrai rayon inscrit du polygone (chiffre contenu dans la face) */
  inradius: number;
  /** sommets ordonnés du polygone */
  poly?: THREE.Vector3[];
  /** distance du plan à l'origine (corps arrondi) */
  d?: number;
  /** référence « haut » imposée pour l'orientation d'arrêt (d4 numéroté aux sommets) */
  upRef?: THREE.Vector3;
}

/** Plaque-chiffre : mesh plan portant la texture du glyphe. */
export interface PlateUserData {
  label?: string | number;
  dense?: boolean;
  _baseScale?: THREE.Vector3;
}

/** Mesh d'une plaque-chiffre (plan + matériau basique texturé). */
export type PlateMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> & { userData: PlateUserData };

/** Plaques-chiffres par valeur (clés numériques ; indexables aussi par chaîne via Object.keys). */
export type DiePlates = Record<string | number, PlateMesh[]>;

/** Anneau du halo de résultat. */
export type HaloMesh = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;

/** Données attachées au groupe Three.js d'un dé. */
export interface DieUserData {
  faces: DieFace[] | null;
  /** plaques-chiffres par valeur (plusieurs pour le d4) */
  plates?: DiePlates;
  halo?: HaloMesh;
  N: number;
  type: number;
  special?: 'cube' | 'coin';
  /** dé à chiffres (≠ cube à pips / pièce) */
  numbered?: boolean;
  numHex?: number;
  /** direction caméra (choix de la plaque du halo) */
  camDir?: THREE.Vector3;
  /** largeur cible du chiffre du résultat (d4 : agrandissement modéré) */
  resultWidth?: number;
}

/** Groupe Three.js d'un dé complet (corps + chiffres + halo). */
export type DieGroup = THREE.Group & { userData: DieUserData };

/** Dé persistant de l'aperçu / du lancer (un renderer par dé). */
export interface Die3D {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  die: DieGroup;
  type: number;
  camDir: THREE.Vector3;
  raf: number | null;
}

/** État global des dés 3D persistants du lanceur (dice-ui.ts). */
export interface DiceThreeState {
  dice: Die3D[];
}

/** userData d'une géométrie de corps (_roundedBody / _chamferSolid). */
export interface BodyGeoUserData {
  /** true : facettes nettes (chanfrein) ; false : normales explicites (arrondi) */
  flatShade?: boolean;
  /** rayon d'arrondi, pour garder les chiffres sur la partie plane des faces */
  roundR?: number;
}

/** userData d'une texture-chiffre (dieNumTexture). */
export interface NumTexUserData {
  /** encombrement du glyphe en fraction du côté de la plaque */
  box?: { w: number; h: number };
  /**
   * true si la texture vient du cache partagé (_numTex) : plusieurs dés/plaques la
   * réutilisent, elle ne doit donc jamais être disposée à la destruction d'un seul
   * dé (sinon les dés encore vivants perdent leurs chiffres). Les textures NON
   * partagées (ex. points du d6/d3/pièce, régénérées à chaque construction) restent
   * candidates à la libération.
   */
  shared?: boolean;
}

/** Rotation euler (x, y) amenant une face du cube à pips face caméra. */
export interface CubeTarget {
  x: number;
  y: number;
}

/** Sommet du solide pendant la construction du corps arrondi (_roundedBody). */
export interface RoundVert {
  /** sommet d'origine */
  p: THREE.Vector3;
  /** indices des faces incidentes */
  faces: number[];
  /** centre de coin (à distance r de tous les plans incidents) ; calculé après collecte */
  c: THREE.Vector3;
}

/** Arête du solide pendant la construction du corps arrondi (_roundedBody). */
export interface RoundEdge {
  a: string;
  b: string;
  /** indices des (deux) faces incidentes */
  faces: number[];
}
