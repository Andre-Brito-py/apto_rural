import { expect, type Page } from '@playwright/test';

/** API do Mailpit (caixa de correio falsa dos testes). */
const MAILPIT = process.env.E2E_MAILPIT ?? 'http://127.0.0.1:8026';

/** E-mail único por teste: o banco é compartilhado entre os testes da rodada. */
export const emailNovo = (prefixo: string) => `${prefixo}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@e2e.local`;

/** Senha só dos testes, gerada a cada rodada (o banco é apagado no começo). */
export const SENHA = `Teste-${Date.now().toString(36)}-Navegador`;

/** Espera o e-mail chegar ao Mailpit e devolve o link que começa com o caminho pedido. */
export async function linkDoEmail(para: string, caminho: string): Promise<string> {
  for (let tentativa = 0; tentativa < 40; tentativa++) {
    const busca = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${para}"`)}`).then((r) => r.json());
    const id = busca.messages?.[0]?.ID;
    if (id) {
      const msg = await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json());
      const link = new RegExp(`https?://[^\\s"<>]+${caminho.replace(/[?]/g, '\\?')}[^\\s"<>]*`).exec(msg.Text as string)?.[0];
      if (link) return new URL(link).pathname + new URL(link).search;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Nenhum e-mail para ${para} com link ${caminho}`);
}

/** Cria a conta pela tela e confirma o e-mail pelo link que chegou na caixa. */
export async function criarContaConfirmada(page: Page, email: string, nome = 'Técnica de Teste') {
  await page.goto('/entrar?modo=criar');
  await page.getByLabel('Nome').fill(nome);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  // O aviso aparece na faixa do topo (e às vezes também na página): basta um.
  await expect(page.getByText('Confirme seu e-mail').first()).toBeVisible();
  await page.goto(await linkDoEmail(email, '/confirmar-email'));
  await expect(page.getByText('E-mail confirmado')).toBeVisible();
}

/** Nenhuma rolagem lateral (erro clássico de layout no celular). */
export async function semRolagemLateral(page: Page) {
  const larguras = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(larguras[0], 'a página não pode rolar para o lado').toBeLessThanOrEqual(larguras[1]!);
}

/** Erros de JavaScript na página quebram o teste (a página "funciona" mas está quebrada). */
export function vigiarErros(page: Page): string[] {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  // Arquivo ou chamada que falhou, com o endereço (o console do navegador não diz qual foi).
  // 401 de /v1/eu é normal para quem não entrou.
  page.on('response', (r) => {
    if (r.status() >= 400 && !(r.status() === 401 && r.url().endsWith('/v1/eu'))) erros.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  return erros;
}

/** Os 3 CARs de exemplo do modo demonstração (repositorio/demo.ts). */
export const CAR_DEMO = {
  embargo: 'MT-0000000-0000.0000.0000.0000.0000.0000.0000.0001',
  limpo: 'MT-0000000-0000.0000.0000.0000.0000.0000.0000.0002',
};
