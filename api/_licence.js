// Licence ScoreTrack Pro : « ST1.<données>.<signature> », en base64url.
//   données   = JSON {v:1, id, iat} — aucune donnée personnelle (la clé est partageable)
//   signature = ECDSA P-256 / SHA-256 de « ST1.<données> », format brut r||s (64 octets)
// L'app vérifie la signature hors ligne avec la clé publique (src/js/licence.js).
// Fichier préfixé « _ » : utilisé par les fonctions de api/, ce n'est pas une route Vercel.
const crypto = require('node:crypto');

const b64u = (buf) => Buffer.from(buf).toString('base64url');

// Clé privée PEM, ou PEM encodé en base64 (plus simple à coller dans une variable d'environnement)
function privateKey(raw) {
  if (!raw) throw new Error('LICENCE_PRIVATE_KEY absente');
  const pem = raw.includes('-----BEGIN') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return crypto.createPrivateKey(pem);
}

function signLicence(payload, rawKey) {
  const data = b64u(JSON.stringify(payload));
  const sig = crypto.sign('sha256', Buffer.from('ST1.' + data), { key: privateKey(rawKey), dsaEncoding: 'ieee-p1363' });
  return 'ST1.' + data + '.' + b64u(sig);
}

// Clé publique au format de l'app : « x.y » (coordonnées JWK en base64url)
function publicKeyOf(rawKey) {
  const jwk = crypto.createPublicKey(privateKey(rawKey)).export({ format: 'jwk' });
  return jwk.x + '.' + jwk.y;
}

function verifyLicence(licence, publicKey) {
  const m = /^ST1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{86})$/.exec(String(licence || '').trim());
  if (!m) return null;
  const [x, y] = String(publicKey).split('.');
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x, y }, format: 'jwk' });
  const ok = crypto.verify('sha256', Buffer.from('ST1.' + m[1]), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[2], 'base64url'));
  if (!ok) return null;
  try { return JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')); } catch (e) { return null; }
}

module.exports = { signLicence, publicKeyOf, verifyLicence };
