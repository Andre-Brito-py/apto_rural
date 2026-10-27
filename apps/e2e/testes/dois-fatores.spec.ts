import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { criarContaConfirmada, emailNovo, SENHA, vigiarErros } from './apoio';

/** Código TOTP (RFC 6238) do segredo em base32, como o aplicativo autenticador calcula. */
function codigoTotp(segredo: string, deslocamento = 0) {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of segredo.replace(/\s/g, '')) bits += alfabeto.indexOf(c).toString(2).padStart(5, '0');
  const chave = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + deslocamento));
  const h = createHmac('sha1', chave).update(contador).digest();
  const o = h[h.length - 1]! & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

test('ligar a verificação em duas etapas, sair e entrar com o código do aplicativo e com um código de recuperação', async ({ page }) => {
  const erros = vigiarErros(page);
  const email = emailNovo('2fa');
  await criarContaConfirmada(page, email);

  await page.goto('/conta');
  const secao = page.locator('#dois-fatores');
  await expect(secao.getByText('Desligada')).toBeVisible();
  await secao.getByRole('button', { name: 'Ligar a verificação em duas etapas' }).click();
  await secao.getByLabel('Confirme a sua senha').fill(SENHA);
  await secao.getByRole('button', { name: 'Continuar' }).click();
  await expect(secao.getByRole('img', { name: 'Código QR para o aplicativo autenticador' })).toBeVisible();
  const segredo = (await secao.locator('.chave-2fa').innerText()).replace(/\s/g, '');
  // O código do intervalo anterior também vale: o de agora fica para o login logo abaixo.
  await secao.getByLabel(/Digite o código de 6 dígitos/).fill(codigoTotp(segredo, -1));
  await secao.getByRole('button', { name: 'Ligar', exact: true }).click();
  await expect(secao.getByText('Verificação em duas etapas ligada')).toBeVisible();
  const codigos = await secao.locator('.codigos-recuperacao li').allInnerTexts();
  expect(codigos).toHaveLength(10);
  await secao.getByRole('button', { name: 'Já guardei' }).click();
  await expect(secao.getByText('Ligada', { exact: true })).toBeVisible();

  // Sair e entrar: a senha sozinha não basta.
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByLabel('Código de verificação')).toBeVisible();
  await page.getByLabel('Código de verificação').fill('000000');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText(/Código incorreto ou já usado/)).toBeVisible();
  await page.getByLabel('Código de verificação').fill(codigoTotp(segredo));
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/entrar/);

  // Sem o celular: um código de recuperação entra uma vez.
  await page.goto('/conta');
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByLabel('Código de verificação').fill(codigos[0]!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/entrar/);
  await page.goto('/conta');
  await expect(page.locator('#dois-fatores')).toContainText('Códigos de recuperação que ainda valem: 9');

  // Os 401 da tentativa sem código e com o código errado são as respostas esperadas do login.
  expect(erros.filter((e) => !e.endsWith('/v1/sessao'))).toEqual([]);
});
