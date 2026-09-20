// Test e2e de fumée : l'app s'ouvre depuis le build de prod (dist/) et on
// peut jouer un tour minimal (choisir un préréglage, lancer la partie,
// incrémenter le score d'un joueur). Nécessite `npm run build` au préalable.
import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const distIndex = pathToFileURL(path.resolve(import.meta.dirname, '..', 'dist', 'index.html')).href;

test('parcours minimal : préréglage -> lancement -> +1 point', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto(distIndex);

  // Premier lancement : consentement de confidentialité obligatoire
  // (checkFirstLaunch/showPrivacy dans game.ts) avant l'écran de démarrage.
  await page.locator('#btn-privacy-accept').click();

  // Écran de démarrage : au moins un préréglage de jeu proposé.
  const firstPreset = page.locator('.preset-card').first();
  await expect(firstPreset).toBeVisible();
  await firstPreset.click();

  // Le préréglage sélectionné active le bouton "Suivant".
  const goBtn = page.locator('#go-btn');
  await expect(goBtn).toBeEnabled();
  await goBtn.click();

  // Écran des noms (optionnel) -> lancer la partie sans saisir de nom.
  const namesGoBtn = page.locator('#names-go-btn');
  await expect(namesGoBtn).toBeVisible();
  await namesGoBtn.click();

  // Écran de jeu : au moins une carte joueur, score initial affiché.
  const firstScore = page.locator('.pcard .score').first();
  await expect(firstScore).toBeVisible();
  const before = Number((await firstScore.textContent())?.replace(/[^\d-]/g, ''));
  expect(Number.isNaN(before)).toBe(false);

  // Taper sur la moitié droite de la zone de la première carte (repère "＋",
  // décoratif et non cliquable lui-même) -> le score augmente de 1 (voir
  // buildCard/getIsPlus dans game.ts).
  const tapZone = page.locator('.pcard .tap-zone').first();
  const box = await tapZone.boundingBox();
  if (!box) throw new Error('tap-zone introuvable');
  await tapZone.click({ position: { x: box.width - 4, y: box.height / 2 } });
  await expect(firstScore).toHaveText(String(before + 1));

  expect(pageErrors).toEqual([]);
});
