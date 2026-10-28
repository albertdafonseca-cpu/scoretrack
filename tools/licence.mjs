#!/usr/bin/env node
// Licences ScoreTrack Pro.
//   node tools/licence.mjs init               crée la paire de clés (une seule fois) ; la clé privée
//                                             va dans ~/.scoretrack/licence-privee.pem, jamais dans le dépôt
//   node tools/licence.mjs offrir [note]      crée une licence offerte + son lien d'activation
//   node tools/licence.mjs verifier <clé>     vérifie une licence avec la clé publique du site
// Clé privée lue dans LICENCE_PRIVATE_KEY, sinon dans ~/.scoretrack/licence-privee.pem.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { signLicence, publicKeyOf, verifyLicence } = createRequire(import.meta.url)('../api/_licence.js');
const KEY_FILE = join(homedir(), '.scoretrack', 'licence-privee.pem');
const SITE = 'https://scoretrack.newgames.app/';
const sitePublicKey = () => JSON.parse(readFileSync(join(ROOT, 'variants', 'pro.json'), 'utf8')).tokens.LICENCE_PUBKEY;

function loadKey() {
  if (process.env.LICENCE_PRIVATE_KEY) return process.env.LICENCE_PRIVATE_KEY;
  if (existsSync(KEY_FILE)) return readFileSync(KEY_FILE, 'utf8');
  throw new Error(`Clé privée introuvable : définissez LICENCE_PRIVATE_KEY ou lancez « init » (${KEY_FILE}).`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'init') {
  if (existsSync(KEY_FILE)) throw new Error(`${KEY_FILE} existe déjà : on ne remplace pas une clé (les licences vendues en dépendent).`);
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  mkdirSync(dirname(KEY_FILE), { recursive: true, mode: 0o700 });
  writeFileSync(KEY_FILE, pem, { mode: 0o600 });
  console.log(`Clé privée : ${KEY_FILE} (à sauvegarder, et à copier dans LICENCE_PRIVATE_KEY sur Vercel)`);
  console.log(`Clé publique (LICENCE_PUBKEY de variants/pro.json et test.json) : ${publicKeyOf(pem)}`);
} else if (cmd === 'offrir') {
  const key = loadKey();
  if (publicKeyOf(key) !== sitePublicKey()) throw new Error('La clé privée ne correspond pas à la clé publique de variants/pro.json.');
  const id = 'gift-' + randomBytes(6).toString('hex');
  const licence = signLicence({ v: 1, id, iat: Math.floor(Date.now() / 1000) }, key);
  console.log(`Licence offerte ${id}${rest.length ? ' — ' + rest.join(' ') : ''}`);
  console.log(`Clé : ${licence}`);
  console.log(`Lien d'activation : ${SITE}#licence=${licence}`);
} else if (cmd === 'verifier') {
  const p = verifyLicence(rest[0], sitePublicKey());
  console.log(p ? `Valide : ${JSON.stringify(p)}` : 'Invalide pour la clé publique du site.');
  process.exitCode = p ? 0 : 1;
} else {
  console.log('Usage : node tools/licence.mjs init | offrir [note] | verifier <clé>');
  process.exitCode = 1;
}
