const fs = require('fs');
const path = require('path');
const { test, expect } = require('./helpers');

// Light est la version de référence pour les moteurs de recherche
const CANONICAL = 'https://scoretrack-light.newgames.app/';
const ROOT = path.join(__dirname, '..', '..');

test.describe('SEO', () => {
  test('title, description, canonical et robots', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title).toMatch(/^ScoreTrack Light/);
    expect(title.length).toBeLessThanOrEqual(60);
    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(desc.length).toBeGreaterThanOrEqual(140);
    expect(desc.length).toBeLessThanOrEqual(160);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', CANONICAL);
    const robots = await page.locator('meta[name="robots"]').evaluateAll((els) => els.map((e) => e.content).join(','));
    expect(robots).not.toMatch(/noindex/i);
    expect(await page.locator('html').getAttribute('lang')).toBeTruthy();
  });

  test('Open Graph et Twitter : image absolue qui pointe vers un fichier du dépôt', async ({ page }) => {
    await page.goto('/');
    const meta = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('meta[property^="og:"],meta[name^="twitter:"]')]
      .map((m) => [m.getAttribute('property') || m.getAttribute('name'), m.content])));
    expect(meta).toMatchObject({
      'og:type': 'website', 'og:site_name': 'ScoreTrack', 'og:url': CANONICAL, 'og:locale': 'fr_FR',
      'og:image:width': '1200', 'og:image:height': '630', 'twitter:card': 'summary_large_image',
    });
    for (const k of ['og:title', 'og:description', 'og:image:alt', 'twitter:title', 'twitter:description']) expect(meta[k], k).toBeTruthy();
    for (const k of ['og:image', 'twitter:image']) {
      const u = new URL(meta[k]);
      expect(u.href.startsWith(CANONICAL), k).toBe(true);
      const rel = u.pathname.replace(/^\//, '');
      expect(fs.existsSync(path.join(ROOT, rel)), rel).toBe(true);
      const r = await page.request.get('/' + rel);
      expect(r.status()).toBe(200);
      expect(r.headers()['content-type']).toMatch(/image\/png/);
      // PNG 1200×630 (en-tête IHDR)
      const b = await r.body();
      expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([1200, 630]);
    }
  });

  test('JSON-LD WebApplication valide', async ({ page }) => {
    await page.goto('/');
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(blocks.length).toBe(1);
    const ld = JSON.parse(blocks[0]);
    expect(ld).toMatchObject({
      '@context': 'https://schema.org', '@type': 'WebApplication', name: 'ScoreTrack Light', url: CANONICAL,
      applicationCategory: 'GameApplication', operatingSystem: 'Web', inLanguage: 'fr',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    });
    expect(ld.description).toBeTruthy();
  });

  test('robots.txt et sitemap.xml servis', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    const txt = await robots.text();
    expect(txt).toMatch(/^User-agent: \*$/m);
    expect(txt).toMatch(/^Allow: \/$/m);
    expect(txt).not.toMatch(/^Disallow: \/\s*$/m);
    expect(txt).toMatch(new RegExp(`^Sitemap: ${CANONICAL}sitemap\\.xml$`, 'm'));
    const sm = await request.get('/sitemap.xml');
    expect(sm.status()).toBe(200);
    const xml = await sm.text();
    expect(xml).toContain('http://www.sitemaps.org/schemas/sitemap/0.9');
    expect(xml.match(/<loc>/g)).toHaveLength(1);
    expect(xml).toContain(`<loc>${CANONICAL}</loc>`);
    expect(xml).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  test('performance : pas de feuille de polices de thème bloquante, splash iOS statique', async ({ page }) => {
    await page.goto('/');
    // Thème par défaut (dark) : les polices retro/classic ne sont pas chargées
    expect(await page.locator('link[href*="fonts-retro"],link[href*="fonts-classic"]').count()).toBe(0);
    const splash = await page.locator('link[rel="apple-touch-startup-image"]').getAttribute('href');
    expect(splash).toBe('icons/splash.png');
    expect((await page.request.get('/' + splash)).status()).toBe(200);
    // Activation d'un thème qui en a besoin : chargement à la demande, une seule fois
    await page.evaluate(() => { applyTheme('arcade'); applyTheme('ldm'); applyTheme('ldm-day'); applyTheme('arcade'); });
    await expect(page.locator('link[href="fonts/fonts-retro.css"]')).toHaveCount(1);
    await expect(page.locator('link[href="fonts/fonts-classic.css"]')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => [...document.fonts].some((f) => /Press Start 2P/.test(f.family)))).toBe(true);
  });
});
