import { expect, test } from '@playwright/test';

test('charts compare periods, support keyboard/touch, and expose the underlying amounts', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const trend = page.getByRole('region', { name: 'Évolution des ventes', exact: true });
  await expect(trend.getByRole('img', { name: 'Courbe des ventes', exact: true })).toBeVisible();
  const chart = trend.getByRole('group', { name: /Courbe des ventes/ });
  await chart.focus(); await chart.press('End');
  await expect(trend.locator('.chart-readout')).toContainText('FCFA');
  await trend.getByRole('button', { name: 'Période précédente', exact: true }).click();
  await expect(trend.getByRole('button', { name: 'Période précédente', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await trend.getByText('Voir les chiffres', { exact: true }).click();
  await expect(trend.locator('tbody tr')).toHaveCount(7);
  await page.getByRole('group', { name: 'Période des graphiques', exact: true }).getByRole('button', { name: 'Jour', exact: true }).click();
  await expect(trend.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('navigation').getByRole('button', { name: 'Rapports', exact: true }).click();
  await expect(page.locator('.visual-card')).toHaveCount(11);
  await page.getByRole('group', { name: 'Période du rapport' }).getByRole('button', { name: '90 derniers jours' }).click();
  await page.getByLabel('Regrouper les graphiques').selectOption('month');
  await page.getByRole('region', { name: 'Évolution des ventes', exact: true }).getByText('Voir les chiffres', { exact: true }).click();
  const rows = page.getByRole('region', { name: 'Évolution des ventes', exact: true }).locator('tbody tr');
  expect(await rows.count()).toBeGreaterThanOrEqual(3); expect(await rows.count()).toBeLessThanOrEqual(4);
  await page.getByRole('region', { name: 'Activité des jours', exact: true }).locator('.activity-cell').last().click();
  await expect(page.locator('.activity-readout')).toContainText('FCFA');
  await page.screenshot({ path: 'test-results/analytics-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('region', { name: 'Évolution des ventes', exact: true }).getByRole('group', { name: /Courbe des ventes/ }).click({ position: { x: 100, y: 100 } });
  await expect(page.getByRole('region', { name: 'Évolution des ventes', exact: true }).locator('.chart-readout')).toContainText('FCFA');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/analytics-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('a period without recorded sheets shows empty charts, not invented figures', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'Rapports', exact: true }).click();
  await page.getByLabel('Date de fin du rapport').fill('2020-01-01');
  await expect(page.getByRole('region', { name: 'Évolution des ventes', exact: true }).getByText('Aucune donnée à afficher')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ventes par produit', exact: true }).getByText('Aucune donnée à afficher')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ventes par serveuse', exact: true }).getByText('Aucune donnée à afficher')).toBeVisible();
  expect(await page.locator('main').innerText()).not.toMatch(/NaN|Infinity/);
});
