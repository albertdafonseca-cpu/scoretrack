const { test, expect, APP } = require('./helpers');

// Version de test : invisible des moteurs (noindex, pas de sitemap ni de JSON-LD),
// mais aperçus de partage (description, Open Graph, Twitter) et canonique vers sa propre URL.
test.describe('SEO', () => {
  const meta = (page, sel) => page.locator(sel).first().getAttribute('content');

  test('title et meta description', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(APP.title);
    const title = await page.title();
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title).toContain('ScoreTrack Test');
    await expect(page.locator('meta[name=description]')).toHaveCount(1);
    const d = await meta(page, 'meta[name=description]');
    expect(d.length).toBeGreaterThanOrEqual(140);
    expect(d.length).toBeLessThanOrEqual(160);
  });

  test('robots : noindex, nofollow (version de test)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('meta[name=robots]')).toHaveCount(1);
    expect(APP.indexable).toBe(false);
    expect(await meta(page, 'meta[name=robots]')).toMatch(/noindex/);
    expect(await meta(page, 'meta[name=robots]')).toMatch(/nofollow/);
  });

  test('canonique vers sa propre URL, og:url identique', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel=canonical]')).toHaveCount(1);
    expect(await page.locator('link[rel=canonical]').getAttribute('href')).toBe(APP.url);
    expect(await meta(page, 'meta[property="og:url"]')).toBe(APP.url);
  });

  test('Open Graph et Twitter complets, og:image absolue vers un fichier du dépôt', async ({ page, request }) => {
    await page.goto('/');
    const og = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('meta[property^="og:"],meta[name^="twitter:"]')]
      .map((m) => [m.getAttribute('property') || m.getAttribute('name'), m.getAttribute('content')])));
    expect(og).toMatchObject({
      'og:type': 'website', 'og:site_name': 'ScoreTrack', 'og:locale': 'fr_FR',
      'og:image:width': '1200', 'og:image:height': '630', 'twitter:card': 'summary_large_image',
    });
    for (const k of ['og:title', 'og:description', 'og:image:alt', 'twitter:title', 'twitter:description', 'twitter:image']) expect(og[k], k).toBeTruthy();
    expect(og['og:description']).toBe(await meta(page, 'meta[name=description]'));
    const img = new URL(og['og:image']);
    expect(img.protocol).toBe('https:');
    expect(img.href.startsWith(APP.url)).toBe(true);
    expect(og['twitter:image']).toBe(og['og:image']);
    // le chemin de l'image existe dans le dépôt (servi localement) et c'est un PNG 1200×630
    const res = await request.get(img.pathname.replace(/^\//, ''));
    expect(res.status()).toBe(200);
    const buf = await res.body();
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([1200, 630]);
  });

  test('pas de JSON-LD (version de test) ; tout JSON-LD éventuel serait du JSON valide', async ({ page }) => {
    await page.goto('/');
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    for (const b of blocks) expect(() => JSON.parse(b)).not.toThrow();
    expect(blocks).toHaveLength(0);
  });

  test('robots.txt sans Disallow (le noindex doit rester visible), pas de sitemap', async ({ request }) => {
    const r = await request.get('robots.txt');
    expect(r.status()).toBe(200);
    const txt = await r.text();
    expect(txt).toMatch(/User-agent:\s*\*/i);
    expect(txt).not.toMatch(/^\s*Disallow:\s*\S/im);
    expect(txt).not.toMatch(/Sitemap:/i);
    expect((await request.get('sitemap.xml')).status()).toBe(404);
  });
});
