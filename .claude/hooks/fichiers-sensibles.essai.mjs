/**
 * .claude/hooks/fichiers-sensibles.essai.mjs — exerce le garde-fou, sans réseau.
 *
 * Un garde-fou qui cesse de refuser ne lève aucune erreur : il laisse passer.
 * Chaque refus a donc son contre-cas, sans quoi « tout refuser » passerait.
 *
 * Lancer : `node .claude/hooks/fichiers-sensibles.essai.mjs`
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verdict } from './fichiers-sensibles.mjs';

const R = '/depot';
const lire = (p) => ({ tool_name: 'Read', tool_input: { file_path: p } });
const ecrire = (p) => ({ tool_name: 'Edit', tool_input: { file_path: p } });
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

/** [libellé, entrée, attendu : "refuser" | "confirmer" | null] */
const CAS = [
  // Secrets — refusés en lecture, écriture, recherche et shell
  ['lire .env', lire(`${R}/.env`), 'refuser'],
  ['lire .env.local', lire(`${R}/.env.local`), 'refuser'],
  ['écrire backend/.env.staging', ecrire(`${R}/backend/.env.staging`), 'refuser'],
  ['lire .dev.vars', lire(`${R}/.dev.vars`), 'refuser'],
  ['écrire une clé .pem', { tool_name: 'Write', tool_input: { file_path: `${R}/cle.pem` } }, 'refuser'],
  ['lire serviceAccount.json', lire(`${R}/serviceAccount.json`), 'refuser'],
  ['lire id_ed25519', lire('/root/.ssh/id_ed25519'), 'refuser'],
  ['chemin Windows', lire('C:\\dev\\poursuit-cf\\backend\\.env.prod'), 'refuser'],
  ['Grep dans .env', { tool_name: 'Grep', tool_input: { pattern: 'x', path: `${R}/.env` } }, 'refuser'],
  ['cat .env', bash('cat .env'), 'refuser'],
  ['source .dev.vars', bash('set -a && . ./.dev.vars && npm run dev'), 'refuser'],
  ['redirection vers .env', bash('echo "CLE=1" >> backend/.env.local'), 'refuser'],
  ['--identifiants=.env.prod', bash('node x.mts --identifiants=backend/.env.prod'), 'refuser'],
  ['guillemets', bash('cat "backend/.env.staging"'), 'refuser'],
  // Secrets — contre-cas
  ['lire .env.example', lire(`${R}/.env.example`), null],
  ['lire .dev.vars.example', lire(`${R}/.dev.vars.example`), null],
  ['écrire .env.local.example', ecrire(`${R}/frontend/.env.local.example`), null],
  ['lire .gitignore', lire(`${R}/.gitignore`), null],
  ['lire environnement.ts', lire(`${R}/backend/src/config/environnement.ts`), null],
  ['lire une clé publique .pub', lire('/root/.ssh/id_ed25519.pub'), null],
  ['lire le gabarit en shell', bash('cat .dev.vars.example'), null],
  ['créer .dev.vars depuis le gabarit', bash('cp .dev.vars.example .dev.vars'), 'refuser'],
  ['grep env dans .gitignore', bash('grep -n env .gitignore'), null],
  ['npm test', bash('npm test'), null],
  ['fichier light-lock.js', ecrire(`${R}/src/js/light-lock.js`), null],
  // Verrous — confirmation sur écriture, lecture libre
  ['écrire package-lock.json', ecrire(`${R}/package-lock.json`), 'confirmer'],
  ['écrire tests/package-lock.json', ecrire(`${R}/tests/package-lock.json`), 'confirmer'],
  ['écrire pnpm-lock.yaml', { tool_name: 'Write', tool_input: { file_path: `${R}/pnpm-lock.yaml` } }, 'confirmer'],
  ['lire package-lock.json', lire(`${R}/package-lock.json`), null],
  ['npm install (shell)', bash('npm install -D x'), null],
  ['écrire package.json', ecrire(`${R}/package.json`), null],
  // Divers
  ['outil sans chemin', { tool_name: 'Glob', tool_input: { pattern: '**/*.ts' } }, null],
  ['entrée vide', {}, null],
];

let echecs = 0;
CAS.forEach(([libelle, entree, attendu]) => {
  const v = verdict(entree, R);
  if ((v?.decision ?? null) !== attendu) {
    echecs += 1;
    console.error(`✗ ${libelle} : attendu ${attendu ?? 'libre'}, obtenu ${v?.decision ?? 'libre'}`);
  }
});

// Le protocole réel : sortie 2 sur un refus, « ask » sur stdout pour une confirmation.
const hook = fileURLToPath(new URL('./fichiers-sensibles.mjs', import.meta.url));
const lancer = (entree) => {
  try {
    const sortie = execFileSync(process.execPath, [hook], {
      input: typeof entree === 'string' ? entree : JSON.stringify(entree),
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, CLAUDE_PROJECT_DIR: R },
    });
    return { code: 0, sortie: String(sortie) };
  } catch (e) {
    return { code: e.status ?? -1, sortie: '' };
  }
};
const protocole = [
  ['refus → sortie 2', lancer(lire(`${R}/.env`)).code === 2],
  ['confirmation → « ask »', /"permissionDecision":"ask"/.test(lancer(ecrire(`${R}/package-lock.json`)).sortie)],
  ['libre → sortie 0, rien sur stdout', (({ code, sortie }) => code === 0 && sortie === '')(lancer(lire(`${R}/README.md`)))],
  ['JSON illisible → sortie 0', lancer('pas du json').code === 0],
];
protocole.forEach(([libelle, ok]) => {
  if (!ok) {
    echecs += 1;
    console.error(`✗ ${libelle}`);
  }
});

const total = CAS.length + protocole.length;
if (echecs) {
  console.error(`${echecs} échec(s) sur ${total}`);
  process.exit(1);
}
console.log(`fichiers-sensibles : ${total} cas, tous conformes`);
