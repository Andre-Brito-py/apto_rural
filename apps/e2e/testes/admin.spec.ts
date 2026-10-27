import { expect, test } from '@playwright/test';
import { criarContaConfirmada, emailNovo } from './apoio';

test('quem não é administrador não entra no painel', async ({ page }) => {
  await criarContaConfirmada(page, emailNovo('comum'));
  await page.goto('/admin');
  await expect(page).not.toHaveURL(/\/admin/);
});

test('painel do administrador: visão geral com o servidor, abas e a aba de IA', async ({ page }) => {
  // admin@e2e.local está em ADMIN_EMAILS (servidor.mjs). O banco é recriado a cada rodada.
  await criarContaConfirmada(page, 'admin@e2e.local', 'Administradora de Teste');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Servidor' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bases oficiais' })).toBeVisible();

  for (const aba of ['Usuários', 'Pedidos', 'Preços e limites', 'Auditoria']) {
    await page.getByRole('navigation', { name: 'Seções do painel' }).getByRole('button', { name: aba }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(aba);
  }

  await page.getByRole('navigation', { name: 'Seções do painel' }).getByRole('button', { name: 'Inteligência artificial' }).click();
  await expect(page.getByText('Sem chave')).toBeVisible();
  await page.getByPlaceholder('sk-…').fill('isto-nao-e-uma-chave');
  await page.getByRole('button', { name: 'Salvar chave' }).click();
  await expect(page.getByText(/não parece uma chave da OpenAI/)).toBeVisible();
});
