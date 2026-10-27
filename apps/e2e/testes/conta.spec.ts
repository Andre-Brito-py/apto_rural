import { expect, test } from '@playwright/test';
import { criarContaConfirmada, emailNovo, SENHA } from './apoio';

test('criar conta, confirmar o e-mail, sair, entrar de novo e excluir a conta (LGPD)', async ({ page }) => {
  const email = emailNovo('conta');
  await criarContaConfirmada(page, email);
  await expect(page.locator('.saldo')).toHaveText('1 consulta'); // a consulta grátis chega com a confirmação

  // Sair e entrar de novo.
  await page.goto('/conta');
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.locator('.saldo')).toHaveCount(0);
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-errada-de-proposito');
  await page.locator('form').getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.locator('form').getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('.saldo')).toHaveText('1 consulta');

  // Baixar meus dados (LGPD): o arquivo traz o e-mail da conta.
  await page.goto('/conta');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: /Baixar meus dados/ }).click()]);
  const conteudo = await (await download.createReadStream()).toArray();
  expect(Buffer.concat(conteudo).toString('utf8')).toContain(email);

  // Excluir a conta: depois disso, o login não funciona mais.
  await page.getByRole('button', { name: 'Excluir minha conta' }).click();
  const confirmacao = page.locator('form.exclusao');
  await expect(confirmacao.getByText('Excluir a conta é definitivo.')).toBeVisible();
  await confirmacao.getByLabel('Sua senha', { exact: true }).fill(SENHA);
  await confirmacao.getByLabel('Entendo que a exclusão não pode ser desfeita.').check();
  await confirmacao.getByRole('button', { name: 'Excluir minha conta' }).click();
  await expect(page).toHaveURL(/conta=excluida/);
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.locator('form').getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('a página de recuperar a senha manda o e-mail com o link', async ({ page }) => {
  const email = emailNovo('senha');
  await criarContaConfirmada(page, email);
  await page.context().clearCookies();
  await page.goto('/esqueci-senha');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: /Enviar|Mandar/ }).click();
  await expect(page.getByText(/link|e-mail/i).first()).toBeVisible();
});
