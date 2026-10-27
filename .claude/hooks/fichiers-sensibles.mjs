/**
 * .claude/hooks/fichiers-sensibles.mjs — hook PreToolUse de Claude Code.
 *
 * Deux niveaux, parce que les deux risques ne se valent pas :
 *  - SECRETS (`.env`, `.env.*`, `.dev.vars`, clés privées, certificats) :
 *    REFUSÉS en lecture comme en écriture, y compris par une commande shell
 *    qui les nomme. Un secret lu entre dans la conversation, donc dans un
 *    journal qu'aucune purge ne traverse. Les gabarits `*.example` restent
 *    libres : ils sont versionnés à dessein et ne contiennent que des noms.
 *  - FICHIERS DE VERROUILLAGE (`package-lock.json`, `pnpm-lock.yaml`…) :
 *    modification directe SOUMISE À CONFIRMATION, pas refusée. Ils se
 *    régénèrent par `npm install`, et une édition à la main y fabrique un
 *    arbre que personne n'a résolu ; mais une édition « au champ près » est
 *    parfois le bon geste (champs `libc` retirés par un npm ancien). C'est au
 *    propriétaire de trancher, au cas par cas.
 *
 * Protocole : lit l'événement JSON sur stdin. Refus = sortie 2, motif sur
 * stderr. Confirmation = sortie 0 avec `permissionDecision: "ask"` sur stdout.
 * Toute autre situation, y compris un JSON illisible, sort en 0 : un hook qui
 * planterait bloquerait toutes les commandes de la session.
 *
 * Éprouvé par `.claude/hooks/fichiers-sensibles.essai.mjs`.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// ── Réglages propres à ce dépôt ─────────────────────────────────────────────
/** Chemins (relatifs à la racine, sans `./`) à faire confirmer avant édition. */
const A_CONFIRMER = [];
/** Commandes shell refusées : [motif, raison]. */
const COMMANDES_REFUSEES = [];
// ────────────────────────────────────────────────────────────────────────────

const VERROUS = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
]);

/** Le nom de fichier désigne-t-il un secret ? Les gabarits `*.example` sont exclus. */
export function estSecret(nom) {
  if (/\.(example|sample|template)$/i.test(nom)) return false;
  if (/^\.env(\..+)?$/i.test(nom)) return true;
  if (/^\.dev\.vars(\..+)?$/i.test(nom)) return true;
  if (/\.(pem|key|p12|pfx)$/i.test(nom)) return true;
  if (/^id_(rsa|ed25519|ecdsa|dsa)$/.test(nom)) return true;
  if (/^serviceAccount.*\.json$/i.test(nom)) return true;
  return false;
}

const nomDe = (chemin) => chemin.replace(/\\/g, '/').split('/').pop() ?? '';

/** Chemin relatif à la racine du dépôt, pour comparer aux réglages. */
function relatif(chemin, racine) {
  const c = chemin.replace(/\\/g, '/');
  const r = (racine ?? '').replace(/\\/g, '/').replace(/\/$/, '');
  return (r && c.startsWith(`${r}/`) ? c.slice(r.length + 1) : c).replace(/^\.\//, '');
}

/** Mots d'une commande shell, guillemets et redirections retirés. */
function mots(commande) {
  return (commande.match(/"[^"]*"|'[^']*'|[^\s;&|()<>]+/g) ?? [])
    .map((m) => m.replace(/^["']|["']$/g, ''))
    .flatMap((m) => m.split(/[=:]/));
}

/**
 * Rend `{ decision: "refuser" | "confirmer", motif }`, ou `null` si le geste est libre.
 * `racine` sert à rapporter un chemin absolu à la racine du dépôt.
 */
export function verdict(entree, racine = process.env.CLAUDE_PROJECT_DIR) {
  const outil = entree?.tool_name ?? '';
  const e = entree?.tool_input ?? {};

  if (outil === 'Bash' && typeof e.command === 'string') {
    const refusee = COMMANDES_REFUSEES.find(([motif]) => motif.test(e.command));
    if (refusee) return { decision: 'refuser', motif: refusee[1] };
    const secret = mots(e.command).find((m) => estSecret(nomDe(m)));
    if (secret) {
      return { decision: 'refuser', motif: `la commande nomme un fichier de secrets (\`${nomDe(secret)}\`).` };
    }
    return null;
  }

  const chemin = [e.file_path, e.notebook_path, e.path].find((v) => typeof v === 'string');
  if (!chemin) return null;
  const nom = nomDe(chemin);
  if (estSecret(nom)) {
    return { decision: 'refuser', motif: `\`${nom}\` est un fichier de secrets : ni lecture ni écriture.` };
  }
  const ecrit = /^(Edit|MultiEdit|Write|NotebookEdit)$/.test(outil);
  if (ecrit && VERROUS.has(nom)) {
    return {
      decision: 'confirmer',
      motif:
        `\`${nom}\` se régénère par le gestionnaire de paquets ; ` +
        'une édition à la main demande votre accord.',
    };
  }
  if (ecrit && A_CONFIRMER.includes(relatif(chemin, racine))) {
    return {
      decision: 'confirmer',
      motif: `\`${relatif(chemin, racine)}\` est protégé par une règle du dépôt (CLAUDE.md).`,
    };
  }
  return null;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let entree;
  try {
    entree = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }
  const v = verdict(entree);
  if (v?.decision === 'refuser') {
    process.stderr.write(`Refusé par le garde-fou des fichiers sensibles : ${v.motif}\n`);
    process.exit(2);
  }
  if (v?.decision === 'confirmer') {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: v.motif,
        },
      })
    );
  }
}
