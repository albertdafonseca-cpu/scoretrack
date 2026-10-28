const { test, expect, storage, acceptPrivacyIfAsked } = require('./helpers');
const { signLicence } = require('../../../api/_licence.js');

// Licences signées avec la clé de test de playwright.config.js ; les appels /api/* sont simulés
const valid = (id = 'gift-e2e') => signLicence({ v: 1, id, iat: 1 }, process.env.TEST_LICENCE_PRIVKEY);
const KEY = 'st:main:licence';
const isPro = (page) => page.evaluate(() => IS_PRO);

test.describe('Licence Pro', () => {
  test('sans licence : version gratuite', async ({ page }) => {
    await page.goto('/');
    expect(await isPro(page)).toBe(false);
    expect((await storage(page))[KEY]).toBeUndefined();
  });

  test('lien offert (#licence=…) : activée, mémorisée, adresse nettoyée', async ({ page }) => {
    const lic = valid();
    await page.goto('/#licence=' + lic);
    await expect.poll(() => page.evaluate(() => location.href)).not.toContain('licence=');
    await expect.poll(() => isPro(page)).toBe(true);
    expect((await storage(page))[KEY]).toBe(lic);
  });

  test('clé collée dans la fenêtre Pro : activée ; clé invalide : message, rien de mémorisé', async ({ page }) => {
    await page.goto('/');
    await acceptPrivacyIfAsked(page);
    await page.evaluate(() => _spop());
    await page.locator('#pro-have-key').click();
    // Signature d'une autre clé : refusée
    const forged = valid().replace(/\.[^.]+$/, '.' + 'A'.repeat(86));
    await page.fill('#licence-input', forged);
    await page.click('#licence-activate');
    await expect(page.locator('#licence-msg')).toHaveText('Cette clé de licence n\'est pas valide.');
    await expect(page.locator('#licence-msg')).toHaveClass(/err/);
    expect((await storage(page))[KEY]).toBeUndefined();
    await page.fill('#licence-input', valid());
    await page.click('#licence-activate');
    await expect.poll(() => isPro(page)).toBe(true);
  });

  test('licence stockée mais altérée : retirée au chargement', async ({ page }) => {
    const bad = valid().slice(0, -4) + 'AAAA';
    await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('__lic')) { sessionStorage.setItem('__lic', '1'); localStorage.setItem(k, v); } }, [KEY, bad]);
    await page.goto('/');
    await expect.poll(async () => (await storage(page))[KEY]).toBeUndefined();
    expect(await isPro(page)).toBe(false);
  });

  test('retour de Stripe (?session_id=…) : licence obtenue auprès de /api/licence puis activée', async ({ page }) => {
    const lic = valid('cs_test_abc123456789');
    await page.route('**/api/licence?session_id=cs_test_abc123456789', (r) => r.fulfill({ json: { licence: lic } }));
    await page.goto('/?session_id=cs_test_abc123456789');
    // Activation = rechargement sur l'adresse nettoyée
    await page.waitForURL((u) => !u.search);
    await expect.poll(() => isPro(page)).toBe(true);
    expect((await storage(page))[KEY]).toBe(lic);
  });

  test('retour de Stripe sans paiement confirmé : message d\'erreur, version gratuite', async ({ page }) => {
    await page.route('**/api/licence?**', (r) => r.fulfill({ status: 402, json: { error: 'unpaid' } }));
    await page.goto('/?session_id=cs_test_unpaid0000000');
    await expect(page.locator('#licence-msg')).toContainText('Paiement non confirmé');
    expect(await isPro(page)).toBe(false);
    expect(await page.evaluate(() => location.search)).toBe('');
  });

  test('achat : redirige vers Stripe Checkout ; erreur du serveur : message', async ({ page }) => {
    await page.goto('/');
    await acceptPrivacyIfAsked(page);
    await page.route('**/api/checkout', (r) => r.fulfill({ status: 503, json: { error: 'unconfigured' } }));
    await page.evaluate(() => _spop());
    await page.click('#pro-buy');
    await expect(page.locator('#licence-msg')).toContainText('Le paiement n\'est pas disponible');
    await page.unroute('**/api/checkout');
    let body = null;
    await page.route('**/api/checkout', (r) => { body = r.request().postDataJSON(); r.fulfill({ json: { url: 'https://checkout.stripe.com/c/pay/cs_test_x' } }); });
    await page.route('https://checkout.stripe.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>Stripe</title>' }));
    await page.click('#pro-buy');
    await page.waitForURL('https://checkout.stripe.com/**');
    expect(body).toEqual({ lang: 'fr' });
  });

  test('réglages : état de la licence et bouton d\'achat', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#licence-status')).toHaveText('Version gratuite (2 à 6 joueurs).');
    await expect(page.locator('#licence-action')).toHaveText('Débloquer pour 4,99 €');
  });
});
