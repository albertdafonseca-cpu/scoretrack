const { test, expect, APP } = require('./helpers');

// Référencement : Light est l'URL de référence (canonique croisé voulu depuis la version principale)
const SEO = {
  canonical: 'https://scoretrack-light.newgames.app/',
  ownOrigin: 'https://scoretrack.newgames.app',
  noindex: false,
  sitemap: false,
};

const meta = (page, sel) => page.locator(sel).first().getAttribute('content');

test.describe('SEO', () => {
  test('title descriptif et meta description de longueur correcte', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title).toBe(APP.title);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title).toMatch(/ScoreTrack/);
    const desc = await meta(page, 'meta[name=description]');
    expect(desc.length).toBeGreaterThanOrEqual(140);
    expect(desc.length).toBeLessThanOrEqual(160);
    await expect(page.locator('meta[name=description]')).toHaveCount(1);
    await expect(page.locator('meta[name=theme-color]')).toHaveCount(1);
  });

  test('canonique unique vers la version de référence', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel=canonical]')).toHaveCount(1);
    expect(await page.locator('link[rel=canonical]').getAttribute('href')).toBe(SEO.canonical);
  });

  test('Open Graph et Twitter complets, og:image absolue vers un fichier existant', async ({ page, baseURL }) => {
    await page.goto('/');
    const og = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('meta[property^="og:"],meta[name^="twitter:"]')]
      .map((m) => [m.getAttribute('property') || m.getAttribute('name'), m.getAttribute('content')])));
    expect(og).toMatchObject({
      'og:type': 'website', 'og:site_name': 'ScoreTrack', 'og:url': SEO.canonical, 'og:locale': 'fr_FR',
      'og:image:width': '1200', 'og:image:height': '630', 'twitter:card': 'summary_large_image',
    });
    for (const k of ['og:title', 'og:description', 'og:image:alt', 'twitter:title', 'twitter:description']) expect(og[k], k).toBeTruthy();
    expect(og['og:description']).toBe(await meta(page, 'meta[name=description]'));
    const img = new URL(og['og:image']);
    expect(img.protocol).toBe('https:');
    expect(img.origin).toBe(SEO.ownOrigin);
    expect(og['twitter:image']).toBe(og['og:image']);
    // Le fichier pointé existe dans le dépôt (servi localement au même chemin) et fait 1200×630
    const res = await page.request.get(new URL(img.pathname.replace(/^\//, ''), baseURL + '/').href);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/image\/png/);
    const buf = await res.body();
    expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([1200, 630]);
  });

  test('JSON-LD WebApplication valide', async ({ page }) => {
    await page.goto('/');
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(blocks).toHaveLength(1);
    const ld = JSON.parse(blocks[0]);
    expect(ld).toMatchObject({
      '@context': 'https://schema.org', '@type': 'WebApplication', name: 'ScoreTrack',
      applicationCategory: 'GameApplication', operatingSystem: 'Web', inLanguage: 'fr',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    });
    expect(ld.url).toMatch(/^https:\/\//);
    expect(ld.description.length).toBeGreaterThan(50);
  });

  test('indexable : pas de noindex', async ({ page }) => {
    await page.goto('/');
    const robots = await page.locator('meta[name=robots]').evaluateAll((l) => l.map((m) => m.content));
    expect(robots.join(',')).not.toMatch(/noindex/i);
  });

  test('robots.txt servi, autorise tout, sans Disallow', async ({ request }) => {
    const r = await request.get('/robots.txt');
    expect(r.status()).toBe(200);
    const txt = await r.text();
    expect(txt).toMatch(/^User-agent:\s*\*/m);
    expect(txt).toMatch(/^Allow:\s*\/\s*$/m);
    expect(txt).not.toMatch(/^Disallow:\s*\S/m);
    if (!SEO.sitemap) expect(txt).not.toMatch(/Sitemap:/i);
  });
});
