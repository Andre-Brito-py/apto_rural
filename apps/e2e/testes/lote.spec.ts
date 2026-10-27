import { expect, test } from '@playwright/test';
import { CAR_DEMO } from './apoio';

test('consulta em lote com a planilha do Excel: lê, consulta e baixa o resultado', async ({ page }) => {
  // Planilha como o Excel em português salva: ponto e vírgula e acento em Windows-1252.
  const csv = `Código do CAR;Nome da fazenda\r\n${CAR_DEMO.embargo};Fazenda São João\r\n${CAR_DEMO.limpo};Sítio Boa Vista\r\nMT-123;Linha com erro\r\n`;
  await page.goto('/lote');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'lote.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'latin1') });

  await expect(page.getByText('lote.csv: 2 imóveis')).toBeVisible();
  await expect(page.getByText('1 linha precisa de atenção')).toBeVisible();
  await expect(page.getByText('Fazenda São João')).toBeVisible(); // acento lido certo
  await expect(page.getByText('Exemplos fictícios: grátis.')).toBeVisible();

  await page.getByRole('button', { name: 'Consultar 2 imóveis' }).click();
  await expect(page.getByText('Pronto: 2 imóveis consultados')).toBeVisible();
  await expect(page.locator('.linha-lote').filter({ hasText: 'Fazenda São João' }).getByText('Impedimento')).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Baixar resultado/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/^apto-rural-lote-\d{4}-\d{2}-\d{2}\.csv$/);
  const texto = Buffer.concat(await (await download.createReadStream()).toArray()).toString('utf8');
  expect(texto.charCodeAt(0)).toBe(0xfeff); // marca de UTF-8: o Excel abre com acento certo
  expect(texto).toContain('Fazenda São João;Impedimento provável');
});
