// Tests des fonctions Vercel api/ (node --test), avec un faux Stripe : fetch est remplacé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';

const require = createRequire(import.meta.url);
const checkout = require('../../api/checkout.js');
const licence = require('../../api/licence.js');
const { verifyLicence, publicKeyOf } = require('../../api/_licence.js');

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const ENV = { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PRICE_ID: 'price_pro', LICENCE_PRIVATE_KEY: PEM };

// Réponse Express-like minimale, comme celle que Vercel passe aux fonctions Node
function res() {
  const r = { code: 200, headers: {}, body: undefined };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}
async function call(fn, req, { env = ENV, stripe } = {}) {
  const saved = { ...process.env }, savedFetch = globalThis.fetch;
  Object.assign(process.env, env);
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => { calls.push({ url, opts }); return stripe(url, opts); };
  try { const r = res(); await fn({ headers: { host: 'scoretrack.newgames.app' }, query: {}, ...req }, r); return { r, calls }; }
  finally { process.env = saved; globalThis.fetch = savedFetch; }
}
const reply = (status, json) => ({ ok: status < 400, status, json: async () => json });
const session = (over = {}) => ({ id: 'cs_test_abcdefghij', created: 1761600000, status: 'complete', payment_status: 'paid',
  line_items: { data: [{ price: { id: 'price_pro' } }] }, ...over });

test('checkout : crée une session Stripe (prix, codes promo, retour sur le site) et renvoie son adresse', async () => {
  const { r, calls } = await call(checkout, { method: 'POST', body: { lang: 'fr' } },
    { stripe: () => reply(200, { url: 'https://checkout.stripe.com/c/pay/cs_test_x' }) });
  assert.equal(r.code, 200);
  assert.equal(r.body.url, 'https://checkout.stripe.com/c/pay/cs_test_x');
  const form = new URLSearchParams(calls[0].opts.body);
  assert.equal(calls[0].url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer sk_test_x');
  assert.equal(form.get('line_items[0][price]'), 'price_pro');
  assert.equal(form.get('mode'), 'payment');
  assert.equal(form.get('allow_promotion_codes'), 'true');
  assert.equal(form.get('success_url'), 'https://scoretrack.newgames.app/?session_id={CHECKOUT_SESSION_ID}');
  assert.equal(form.get('locale'), 'fr');
  assert.match(form.get('custom_text[submit][message]'), /rétractation/);
});

test('checkout : un hôte inconnu ne sert jamais d\'adresse de retour', async () => {
  const { calls } = await call(checkout, { method: 'POST', headers: { host: 'evil.example' }, body: {} },
    { stripe: () => reply(200, { url: 'https://checkout.stripe.com/x' }) });
  assert.equal(new URLSearchParams(calls[0].opts.body).get('cancel_url'), 'https://scoretrack.newgames.app/');
});

test('checkout : méthode, configuration absente, erreur Stripe', async () => {
  assert.equal((await call(checkout, { method: 'GET' }, { stripe: () => reply(200, {}) })).r.code, 405);
  assert.equal((await call(checkout, { method: 'POST' }, { env: { STRIPE_SECRET_KEY: '', STRIPE_PRICE_ID: '' }, stripe: () => reply(200, {}) })).r.code, 503);
  assert.equal((await call(checkout, { method: 'POST' }, { stripe: () => reply(400, { error: {} }) })).r.code, 502);
});

test('licence : session payée pour le bon prix → licence signée, vérifiable, propre à la session', async () => {
  const { r, calls } = await call(licence, { method: 'GET', query: { session_id: 'cs_test_abcdefghij' } }, { stripe: () => reply(200, session()) });
  assert.equal(r.code, 200);
  assert.match(calls[0].url, /\/v1\/checkout\/sessions\/cs_test_abcdefghij\?expand\[\]=line_items$/);
  assert.deepEqual(verifyLicence(r.body.licence, publicKeyOf(PEM)), { v: 1, id: 'cs_test_abcdefghij', iat: 1761600000 });
  assert.equal(r.headers['Cache-Control'], 'no-store');
});

test('licence : code promo à 100 % (aucun paiement requis) → licence offerte', async () => {
  const { r } = await call(licence, { method: 'GET', query: { session_id: 'cs_test_abcdefghij' } },
    { stripe: () => reply(200, session({ payment_status: 'no_payment_required' })) });
  assert.equal(r.code, 200);
});

test('licence : refusée si non payée, autre produit, session inconnue ou identifiant invalide', async () => {
  const q = { method: 'GET', query: { session_id: 'cs_test_abcdefghij' } };
  assert.equal((await call(licence, q, { stripe: () => reply(200, session({ payment_status: 'unpaid' })) })).r.code, 402);
  assert.equal((await call(licence, q, { stripe: () => reply(200, session({ status: 'open' })) })).r.code, 402);
  assert.equal((await call(licence, q, { stripe: () => reply(200, session({ line_items: { data: [{ price: { id: 'price_autre' } }] } })) })).r.code, 402);
  assert.equal((await call(licence, q, { stripe: () => reply(404, { error: {} }) })).r.code, 404);
  const bad = await call(licence, { method: 'GET', query: { session_id: '../../v1/customers' } }, { stripe: () => reply(200, session()) });
  assert.equal(bad.r.code, 400);
  assert.equal(bad.calls.length, 0);
  assert.equal((await call(licence, q, { env: { LICENCE_PRIVATE_KEY: '' }, stripe: () => reply(200, session()) })).r.code, 503);
});
