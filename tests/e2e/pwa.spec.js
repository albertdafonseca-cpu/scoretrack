const { test, expect, APP, swReady } = require('./helpers');

test.describe('PWA', () => {
  test('le service worker est enregistré, activé et contrôle la page', async ({ page }) => {
    await page.goto('/');
    await swReady(page);
    const sw = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      return { url: r.active.scriptURL, scope: r.scope, state: r.active.state };
    });
    expect(sw.state).toBe('activated');
    expect(sw.url).toMatch(/\/sw\.js$/);
    expect(sw.scope).toMatch(/\/$/);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  });

  test('le manifest est servi, complet, et ses icônes existent', async ({ page }) => {
    await page.goto('/');
    const man = await page.evaluate(async () => {
      const l = document.querySelector('link[rel=manifest]');
      const r = await fetch(l.href);
      const j = await r.json();
      const icons = await Promise.all(j.icons.map(async (i) => ({ ...i, status: (await fetch(new URL(i.src, l.href))).status })));
      return { href: l.getAttribute('href'), status: r.status, j, icons };
    });
    expect(man.href).toBe('manifest.webmanifest');
    expect(man.status).toBe(200);
    expect(man.j).toMatchObject({ name: APP.manifestName, short_name: expect.any(String), id: './', start_url: './', scope: './', display: 'standalone', orientation: 'portrait', lang: 'fr' });
    expect(man.icons.every((i) => i.status === 200)).toBe(true);
    expect(man.icons.map((i) => i.purpose || 'any')).toEqual(expect.arrayContaining(['any', 'maskable']));
    expect(man.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  });

  test('favicon et apple-touch-icon sont déclarés et servis', async ({ page }) => {
    await page.goto('/');
    const statuses = await page.evaluate(() =>
      Promise.all([...document.querySelectorAll('link[rel=icon],link[rel=apple-touch-icon]')].map(async (l) => [l.rel, (await fetch(l.href)).status])));
    expect(statuses.map((s) => s[0]).sort()).toEqual(['apple-touch-icon', 'icon']);
    expect(statuses.every((s) => s[1] === 200)).toBe(true);
    await expect(page).toHaveTitle(APP.title);
  });

  test('le cache est préfixé par l\'app et le précache est rempli', async ({ page }) => {
    await page.goto('/');
    await swReady(page);
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('st-')))).toEqual(
      [expect.stringMatching(APP.cacheRe)]);
    await expect.poll(() => page.evaluate(async () => {
      const k = (await caches.keys()).find((n) => n.startsWith('st-light-'));
      return (await (await caches.open(k)).keys()).length;
    })).toBeGreaterThanOrEqual(20);
  });

  test('l\'activation ne supprime que les anciens caches de cette app', async ({ page }) => {
    await page.goto('/');
    await swReady(page);
    // On repart d'une nouvelle installation avec un vieux cache de l'app et un cache d'une app sœur
    await page.evaluate(async () => {
      await caches.open('st-light-v0');
      await caches.open('st-autre-v9');
      await caches.open('cache-tiers');
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    });
    await page.reload();
    // Attente de l'activation du nouveau SW : le vieux cache de l'app disparaît
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes('st-light-v0')), { timeout: 15_000 }).toBe(false);
    const keys = await page.evaluate(() => caches.keys());
    expect(keys).toEqual(expect.arrayContaining(['cache-tiers', 'st-autre-v9']));
    expect(keys.some((k) => APP.cacheRe.test(k))).toBe(true);
  });

  test('l\'app se recharge hors ligne (navigation servie depuis le cache)', async ({ page, context }) => {
    await page.goto('/');
    await swReady(page);
    await expect.poll(() => page.evaluate(async () => {
      const k = (await caches.keys()).find((n) => n.startsWith('st-light-'));
      return k ? (await (await caches.open(k)).keys()).length : 0;
    })).toBeGreaterThanOrEqual(20);
    await context.setOffline(true);
    await page.reload();
    await expect(page).toHaveTitle(APP.title);
    await expect(page.locator('.page.active')).toHaveCount(1);
    const css = await page.evaluate(async () => (await fetch('fonts/fonts-core.css')).status);
    expect(css).toBe(200);
    await context.setOffline(false);
  });

  test('jsPDF local est servi (chargé à la demande, jamais depuis un CDN)', async ({ page }) => {
    await page.goto('/');
    const s = await page.evaluate(async () => (await fetch('vendor/jspdf.umd.min.js')).status);
    expect(s).toBe(200);
    expect(await page.evaluate(() => !!window.jspdf)).toBe(false);
  });

  test('le viewport ne bloque pas le zoom', async ({ page }) => {
    await page.goto('/');
    const vp = await page.locator('meta[name=viewport]').getAttribute('content');
    expect(vp).not.toMatch(/user-scalable\s*=\s*(no|0)|maximum-scale|minimum-scale/);
  });
});
