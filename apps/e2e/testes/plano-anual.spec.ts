import { expect, test } from '@playwright/test';
import { criarContaConfirmada, emailNovo, vigiarErros } from './apoio';

test('plano anual: escolhe o anual, paga uma vez e recebe os créditos do ano; cancelar é não renovar', async ({ page }) => {
  const erros = vigiarErros(page);
  await criarContaConfirmada(page, emailNovo('anual'));
  await page.goto('/planos');

  // O seletor troca os preços para o anual.
  await page.getByRole('radio', { name: /Anual/ }).click();
  await expect(page).toHaveURL(/ciclo=anual/);
  const projetista = page.locator('li.l-plano').filter({ has: page.getByRole('heading', { name: 'Projetista' }) });
  await expect(projetista.locator('.l-plano-preco')).toContainText('R$ 1.990,00');
  await expect(projetista).toContainText('Equivale a R$ 165,83/mês · economia de R$ 398,00 no ano');
  await expect(projetista).toContainText('240 consultas por ano');

  await projetista.getByRole('button', { name: /Ir para o pagamento|Assinar por um ano/ }).click();
  await expect(page).toHaveURL(/pagamento-simulado\/assinatura/);
  await page.getByRole('button', { name: 'Simular pagamento' }).click();
  await expect(page.getByText('Pagamento confirmado')).toBeVisible();

  await page.goto('/planos');
  await expect(page.getByText('Projetista (anual)')).toBeVisible();
  await expect(page.getByText(/renova em \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
  await expect(page.locator('.saldo-planos')).toContainText('241 consultas'); // 1 grátis + 240 do ano

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Cancelar renovação' }).click();
  await expect(page.getByText(/Renovação cancelada\. Seu plano continua valendo até/)).toBeVisible();
  await expect(page.getByText(/renovação cancelada: vale até/)).toBeVisible();
  expect(erros).toEqual([]);
});
