// GET /api/licence?session_id=cs_… → { licence } une fois le paiement confirmé par Stripe.
// Appelée par l'app au retour de Checkout. Même session → même licence (id et date tirés de la session).
// Variables Vercel : STRIPE_SECRET_KEY, STRIPE_PRICE_ID, LICENCE_PRIVATE_KEY.
const { signLicence } = require('./_licence.js');

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'method' }); }
  const { STRIPE_SECRET_KEY: sk, STRIPE_PRICE_ID: price, LICENCE_PRIVATE_KEY: pk } = process.env;
  if (!sk || !price || !pk) return res.status(503).json({ error: 'unconfigured' });

  const id = String((req.query && req.query.session_id) || '');
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(id)) return res.status(400).json({ error: 'session' });

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + id + '?expand[]=line_items', {
      headers: { Authorization: 'Bearer ' + sk },
    });
    if (r.status === 404) return res.status(404).json({ error: 'session' });
    const s = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'stripe' });
    const paid = s.status === 'complete' && ['paid', 'no_payment_required'].includes(s.payment_status);
    // Seule une session pour le prix de la licence Pro donne une licence
    const forPro = (s.line_items && s.line_items.data || []).some((l) => l.price && l.price.id === price);
    if (!paid || !forPro) return res.status(402).json({ error: 'unpaid' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ licence: signLicence({ v: 1, id: s.id, iat: s.created }, pk) });
  } catch (e) {
    return res.status(502).json({ error: 'stripe' });
  }
};
