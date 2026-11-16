import { expect, test } from '@playwright/test';

test('dashboard, navigation and document exports work', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bonjour, Eudes' })).toBeVisible();
  await expect(page.locator('.stat-value').first()).not.toContainText('0 FCFA');
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  const screens = [
    ['Fiche du jour', 'Fiche du jour'], ['Personnel', 'Votre équipe'],
    ['Catalogue produits', 'Catalogue produits'], ['Stock & inventaire', 'Stock & inventaire'],
    ['Dettes & manquants', 'Dettes & manquants'], ['Salaires', 'Salaires'], ['Rapports', 'Rapports & performance'],
  ];
  for (const [nav, heading] of screens) {
    await page.getByRole('navigation').getByRole('button', { name: nav, exact: nav !== 'Dettes & manquants' }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Rapport PDF', exact: true }).click()]);
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel', exact: true }).click()]);
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
  await page.getByRole('button', { name: 'Journal d’activité' }).click();
  await expect(page.getByRole('heading', { name: 'Journal d’activité' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a daily sheet updates stock, creates the shortage and survives reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nouvelle fiche', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Serveuse', { exact: true }).selectOption({ label: 'Rose Akakpo' });
  await dialog.getByRole('button', { name: 'Ajouter un produit' }).click();
  await dialog.getByLabel('Reçu 1', { exact: true }).fill('10');
  await dialog.getByLabel('Vendu 1', { exact: true }).fill('8');
  await dialog.getByLabel('Cash remis', { exact: true }).fill('4000');
  await dialog.getByLabel('Mobile Money remis', { exact: true }).fill('1000');
  await dialog.getByRole('button', { name: 'Valider la fiche' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('status')).toContainText('Fiche validée');
  await page.getByRole('navigation').getByRole('button', { name: 'Stock & inventaire' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Beaufort' })).toContainText('176 bouteilles');
  await page.getByRole('navigation').getByRole('button', { name: 'Dettes & manquants' }).click();
  const row = page.getByRole('row').filter({ hasText: 'Rose Akakpo' });
  await expect(row).toContainText('2 000 FCFA');
  await row.getByRole('button', { name: 'Régulariser' }).click();
  await page.getByLabel('Montant remboursé (FCFA)').fill('200');
  await page.getByRole('button', { name: 'Confirmer le remboursement' }).click();
  await expect(row).toContainText('1 800 FCFA');
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Dettes & manquants' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Rose Akakpo' })).toContainText('1 800 FCFA');
});

test('phone layout stays within viewport and supports forms', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bonjour, Eudes' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Personnel', exact: true }).click();
  await page.getByRole('button', { name: 'Ajouter une serveuse' }).click();
  await page.getByLabel('Nom et prénoms').fill('Test Mobile');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Test Mobile' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
