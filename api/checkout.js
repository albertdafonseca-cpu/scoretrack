// POST /api/checkout → { url } : ouvre une session Stripe Checkout pour la licence Pro (achat unique).
// Variables Vercel : STRIPE_SECRET_KEY, STRIPE_PRICE_ID ; STRIPE_TERMS=1 si des CGV sont réglées dans Stripe.
// Les codes promo (allow_promotion_codes) permettent d'offrir l'accès : un code à 100 % donne une licence gratuite.
const { origine } = require('./_origine.js');

const LOCALES = ['fr', 'en', 'pt', 'es', 'de', 'it', 'nl', 'pl', 'ja', 'ko', 'zh', 'sv', 'da', 'fi', 'nb', 'tr', 'ru'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method' }); }
  const { STRIPE_SECRET_KEY: sk, STRIPE_PRICE_ID: price, STRIPE_TERMS: terms } = process.env;
  if (!sk || !price) return res.status(503).json({ error: 'unconfigured' });

  const site = origine(req);
  const lang = String((req.body && req.body.lang) || '').slice(0, 2);
  const form = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    success_url: site + '/?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: site + '/',
    allow_promotion_codes: 'true',
    locale: LOCALES.includes(lang) ? lang : 'auto',
    // Contenu numérique livré immédiatement : renonciation au droit de rétractation (art. L221-28 C. conso.)
    'custom_text[submit][message]': lang === 'fr'
      ? 'Accès immédiat à ScoreTrack Pro : en payant, vous demandez l\'exécution immédiate et renoncez au délai de rétractation de 14 jours.'
      : 'Immediate access to ScoreTrack Pro: by paying you request immediate delivery and waive the 14-day withdrawal period.',
  });
  if (terms === '1') form.set('consent_collection[terms_of_service]', 'required');

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + sk, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const j = await r.json();
    if (!r.ok || !j.url) return res.status(502).json({ error: 'stripe' });
    return res.status(200).json({ url: j.url });
  } catch (e) {
    return res.status(502).json({ error: 'stripe' });
  }
};
