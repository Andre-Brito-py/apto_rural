import { expect, test, type Page } from '@playwright/test';
import { criarContaConfirmada, emailNovo, entrarComoAdmin, SENHA } from './apoio';

/**
 * Entrar com a conta Google (docs/login-google.md), sem falar com o Google de verdade:
 * - o script do Google (accounts.google.com/gsi/client) é trocado por um falso, que desenha
 *   um botão e entrega um ID token pedido ao Google falso de servidor.mjs;
 * - a API confere o token com as chaves desse Google falso (GOOGLE_CERTS_URL).
 */
const CLIENTE = '123456789012-testesdonavegador.apps.googleusercontent.com';
const GOOGLE_FALSO = `http://127.0.0.1:${process.env.E2E_GOOGLE_PORTA ?? '3401'}`;

const SCRIPT_FALSO = `
window.google = { accounts: { id: {
  initialize(o) { window.__aoEntrarGoogle = o.callback; },
  renderButton(el) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Continuar com o Google';
    b.onclick = async () => {
      const c = window.__contaGoogle;
      const q = new URLSearchParams({ sub: c.sub, email: c.email, name: c.nome });
      const r = await fetch('${GOOGLE_FALSO}/token?' + q).then((x) => x.json());
      window.__aoEntrarGoogle({ credential: r.credential });
    };
    el.appendChild(b);
  },
} } };`;

/** A conta Google que o botão falso vai "escolher". */
async function prepararGoogle(page: Page, conta: { sub: string; email: string; nome: string }) {
  await page.route('https://accounts.google.com/gsi/client', (rota) => rota.fulfill({ contentType: 'application/javascript', body: SCRIPT_FALSO }));
  await page.addInitScript((c) => Object.assign(window, { __contaGoogle: c }), conta);
}

test.describe.serial('entrar com a conta Google', () => {
  test.afterAll(async ({ browser }) => {
    // Desliga de novo: os outros testes não carregam o script do Google.
    const page = await browser.newPage();
    await entrarComoAdmin(page);
    await page.request.put('/v1/admin/configuracoes/google', { data: { valor: { clienteId: '' } } });
    await page.close();
  });

  test('o administrador liga pelo painel e o botão aparece em Entrar', async ({ page }) => {
    await page.goto('/entrar');
    await expect(page.getByRole('button', { name: 'Continuar com o Google' })).toHaveCount(0);

    await entrarComoAdmin(page);
    await page.goto('/admin?aba=configuracoes');
    // O bloco é o cartão do título (o pai do <strong>), não a seção de configurações em volta.
    const bloco = page.getByText('Entrar com a conta Google', { exact: true }).locator('..');
    await bloco.getByLabel('ID do cliente do Google').fill('isso-nao-e-um-id');
    await bloco.getByRole('button', { name: 'Salvar' }).click();
    await expect(bloco.getByText(/googleusercontent\.com/).last()).toBeVisible();
    await bloco.getByLabel('ID do cliente do Google').fill(CLIENTE);
    await bloco.getByRole('button', { name: 'Salvar' }).click();
    await expect(bloco.getByText('Salvo.')).toBeVisible();
    await page.request.delete('/v1/sessao');

    await prepararGoogle(page, { sub: 'x', email: 'x@gmail.com', nome: 'X' });
    await page.goto('/entrar');
    await expect(page.getByRole('button', { name: 'Continuar com o Google' })).toBeVisible();
    await expect(page.getByText('ou com e-mail e senha')).toBeVisible();
  });

  test('conta nova pelo Google: aceita os termos, entra com a amostra grátis e sem senha', async ({ page }) => {
    const email = `google-${Date.now()}@gmail.com`;
    await prepararGoogle(page, { sub: `sub-${Date.now()}`, email, nome: 'Técnica do Google' });
    await page.goto('/entrar?modo=criar');
    await page.getByRole('button', { name: 'Continuar com o Google' }).click();

    const passo = page.getByRole('form', { name: 'Continuar com o Google' });
    await expect(passo.getByText(email)).toBeVisible();
    await passo.getByRole('button', { name: 'Criar minha conta' }).click();
    // Sem o aceite, não cria.
    await expect(passo.getByRole('alert')).toContainText('Aceite os termos');
    await passo.getByRole('checkbox').check();
    await passo.getByRole('button', { name: 'Criar minha conta' }).click();

    // Primeira entrada: o tour de boas-vindas aparece.
    await page.getByRole('button', { name: 'Pular tour' }).click();
    await expect(page.locator('header.cabecalho').getByText('1 consulta')).toBeVisible();
    await page.goto('/conta');
    await expect(page.getByText('Técnica do Google')).toBeVisible();
    await expect(page.getByText('conta Google', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Criar uma senha' })).toBeVisible();
  });

  test('conta com senha (e-mail que não é do Google): pede a senha uma vez para ligar', async ({ page }) => {
    const email = emailNovo('ligar-google');
    await criarContaConfirmada(page, email, 'Pessoa Com Senha');
    await page.request.delete('/v1/sessao');

    await prepararGoogle(page, { sub: `sub-ligar-${Date.now()}`, email, nome: 'Pessoa Com Senha' });
    await page.goto('/entrar');
    await page.getByRole('button', { name: 'Continuar com o Google' }).click();
    const passo = page.getByRole('form', { name: 'Continuar com o Google' });
    await expect(passo.getByText('Digite a senha dela uma vez')).toBeVisible();
    await passo.getByLabel('Senha da conta do Apto Rural').fill('senha-errada-123');
    await passo.getByRole('button', { name: 'Continuar' }).click();
    await expect(passo.getByRole('alert')).toContainText('Senha incorreta');
    await passo.getByLabel('Senha da conta do Apto Rural').fill(SENHA);
    await passo.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL(/\/$/);

    // Ligada: da próxima vez, entra direto pelo Google.
    await page.request.delete('/v1/sessao');
    await page.goto('/entrar');
    await page.getByRole('button', { name: 'Continuar com o Google' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/conta');
    await expect(page.getByText('e-mail e senha ou conta Google')).toBeVisible();
  });
});
