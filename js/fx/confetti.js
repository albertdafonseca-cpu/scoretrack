// Célébration de victoire : confettis en canvas avec une physique réelle (gravité, traînée,
// rotation propre à chaque particule). Aucune image, aucune dépendance, aucun effet sous
// `prefers-reduced-motion: reduce` (D7) — la victoire reste alors portée par la modale seule.
import { COLORS } from '../core/constants.js';
import { reducedMotion } from './motion.js';

/** Durée (ms) de la célébration. */
export const CONFETTI_MS = 1500;
/** Nombre maximal de particules (budget 60 fps sur mobile d'entrée de gamme). */
export const MAX_PARTICLES = 200;

/** Accélération (px/s²) et coefficient de traînée (1/s). */
const GRAVITY = 1400;
const DRAG = 1.1;
const FADE_MS = 420;

let current = null;

/**
 * Le canevas est inséré DANS le conteneur demandé (la surcouche du vainqueur) et avant son
 * contenu : les confettis volent autour de la carte sans jamais passer par-dessus son texte.
 */
function makeCanvas(container) {
  const canvas = document.createElement('canvas');
  canvas.id = 'confetti-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const host = container && container.isConnected ? container : document.body;
  host.insertBefore(canvas, host.firstChild);
  return canvas;
}

// Deux canons partant du BAS de l'écran : la gerbe monte le long des bords et laisse lisible le
// centre, où s'affiche la modale du vainqueur.
function spawn(count, width, height) {
  const particles = [];
  const originY = height * 0.98;
  for (let i = 0; i < count; i++) {
    const left = i % 2 === 0;
    const angle = -Math.PI / 2 + (left ? 0.5 : -0.5) + (Math.random() - 0.5) * 0.7;
    const speed = 900 + Math.random() * 700;
    particles.push({
      x: width * (left ? 0.06 : 0.94) + (Math.random() - 0.5) * 40,
      y: originY + (Math.random() - 0.5) * 20,
      vx: Math.cos(angle) * speed * (0.7 + Math.random() * 0.6),
      vy: Math.sin(angle) * speed,
      w: 5 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 14,
      tilt: Math.random() * Math.PI,
      vtilt: 4 + Math.random() * 6,
      color: COLORS[i % COLORS.length],
    });
  }
  return particles;
}

/**
 * Lance la célébration. Renvoie une fonction d'arrêt (idempotente) ; null si le mouvement est
 * réduit ou si le canvas 2D est indisponible.
 * @param {{count?:number, duration?:number, container?:Element}} [options]
 */
export function celebrate({ count = 140, duration = CONFETTI_MS, container = null } = {}) {
  stopConfetti();
  if (reducedMotion()) return null;
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return null;
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.scale(dpr, dpr);

  const particles = spawn(Math.min(MAX_PARTICLES, count), width, height);
  const start = performance.now();
  let raf = 0;
  let last = start;

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    canvas.remove();
    if (current === stop) current = null;
  };

  const frame = (now) => {
    const elapsed = now - start;
    // Pas de temps borné : un onglet ralenti ne téléporte pas les particules.
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, width, height);
    const fade = elapsed > duration - FADE_MS ? Math.max(0, (duration - elapsed) / FADE_MS) : 1;
    for (const p of particles) {
      p.vy += GRAVITY * dt;
      p.vx -= p.vx * DRAG * dt;
      p.vy -= p.vy * DRAG * dt * 0.35;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      p.tilt += p.vtilt * dt;
      if (p.y - p.h > height) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      // Le « battement » (scale vertical oscillant) simule une feuille qui tourne sur elle-même.
      ctx.scale(1, Math.cos(p.tilt));
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (elapsed >= duration) {
      stop();
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  current = stop;
  return stop;
}

/** Arrête la célébration en cours, s'il y en a une. */
export function stopConfetti() {
  if (current) current();
}
