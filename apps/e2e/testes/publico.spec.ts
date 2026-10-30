import { expect, test } from '@playwright/test';
import { vigiarErros } from './apoio';

test.describe('páginas públicas', () => {
  test('a landing abre sem erro de JavaScript e leva à consulta', async ({ page }) => {
    const erros = vigiarErros(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('crédito rural');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/og\.png$/);
    await page.getByRole('link', { name: /Consultar uma fazenda grátis/ }).first().click();
    await expect(page).toHaveURL(/\/(consultar|entrar)/);
    expect(erros).toEqual([]);
  });

  test('planos mostram os preços e a compra avulsa', async ({ page }) => {
    await page.goto('/planos');
    await expect(page.getByText('R$', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Consulta avulsa')).toBeVisible();
  });

  test('regras e fontes, termos e privacidade abrem', async ({ page }) => {
    for (const [caminho, texto] of [
      ['/fontes', 'MCR'],
      ['/termos', 'Termos'],
      ['/privacidade', 'rivacidade'],
    ] as const) {
      await page.goto(caminho);
      await expect(page.locator('main')).toContainText(texto);
    }
  });

  test('link do rodapé abre a tela nova do topo; voltar devolve à mesma altura', async ({ page }) => {
    await page.goto('/ajuda');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const antes = await page.evaluate(() => window.scrollY);
    expect(antes).toBeGreaterThan(500);
    await page.locator('.rodape').getByRole('link', { name: 'Planos e preços' }).click();
    await expect(page).toHaveURL(/\/planos$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/ajuda$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  });

  test('endereço que não existe mostra a página do site, não erro do servidor', async ({ page }) => {
    const r = await page.goto('/nao-existe-esta-pagina');
    expect(r?.status()).toBe(200);
    await expect(page.locator('header.cabecalho')).toBeVisible();
  });
});
