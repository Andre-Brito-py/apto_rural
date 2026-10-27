import { expect, test } from '@playwright/test';
import { vigiarErros } from './apoio';

test('consulta de exemplo sem conta: resultado, mapa e dossiê', async ({ page }) => {
  const erros = vigiarErros(page);
  await page.goto('/consultar');
  await page.getByRole('button', { name: 'Embargo + Prodes' }).click();
  await page.getByRole('button', { name: 'Consultar imóvel' }).click();

  await expect(page).toHaveURL(/\/consulta\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Impedimento provável');
  await expect(page.getByText('Resultado de demonstração com dados fictícios')).toBeVisible();
  await expect(page.getByText('Item por item do MCR 2-9')).toBeVisible();
  await expect(page.getByText('Embargos ambientais').first()).toBeVisible();

  // Mapa ilustrado do entorno, com o embargo fictício numerado.
  const mapa = page.locator('.mapa-entorno');
  await expect(mapa.getByText('Mapa do imóvel e do entorno')).toBeVisible();
  await expect(mapa.locator('.mapa-legenda').getByText('Embargo DEMO-0001 (fictício)')).toBeVisible();

  // Dossiê (nos exemplos, aberto sem gastar crédito): QR e seções.
  await page.getByRole('link', { name: /dossiê do imóvel/i }).click();
  await expect(page.getByRole('heading', { name: 'Impedimentos socioambientais do crédito rural' })).toBeVisible();
  await expect(page.locator('.dossie-lateral svg, .dossie-lateral canvas, .dossie-lateral img').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Observações do responsável técnico' })).toBeVisible();
  expect(erros).toEqual([]);
});

test('sem conta não aparece o botão de explicação por IA (gerar custa)', async ({ page }) => {
  await page.goto('/consultar');
  await page.getByRole('button', { name: 'Sem impedimento' }).click();
  await page.getByRole('button', { name: 'Consultar imóvel' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explicar para o produtor' })).toHaveCount(0);
});

test('código do CAR inválido é recusado com explicação', async ({ page }) => {
  await page.goto('/consultar');
  await page.locator('.entrada-car').fill('MT-123');
  await page.getByRole('button', { name: 'Consultar imóvel' }).click();
  await expect(page.getByText('Confira o código')).toBeVisible();
  await expect(page).toHaveURL(/\/consultar$/);
});
