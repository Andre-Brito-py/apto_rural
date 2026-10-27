import { expect, test } from '@playwright/test';
import { semRolagemLateral, vigiarErros } from './apoio';

// Roda no projeto "celular" (Pixel 7): o técnico usa o Apto Rural no campo, pelo celular.
test('no celular: landing, consulta de exemplo e resultado sem rolagem lateral', async ({ page }) => {
  const erros = vigiarErros(page);
  for (const caminho of ['/', '/planos', '/consultar', '/lote', '/entrar']) {
    await page.goto(caminho);
    await expect(page.locator('header.cabecalho')).toBeVisible();
    await semRolagemLateral(page);
  }
  await page.goto('/consultar');
  await page.getByRole('button', { name: 'Embargo + Prodes' }).click();
  await page.getByRole('button', { name: 'Consultar imóvel' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Impedimento provável');
  await expect(page.locator('.mapa-entorno')).toBeVisible();
  await semRolagemLateral(page);
  expect(erros).toEqual([]);
});
