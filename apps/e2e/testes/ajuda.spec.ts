import { expect, test } from '@playwright/test';
import { criarContaConfirmada, emailNovo, semRolagemLateral, vigiarErros } from './apoio';

test('central de ajuda: sugestões da tela, resposta pronta para a dúvida escrita e link para a tela certa', async ({ page }) => {
  const erros = vigiarErros(page);
  await page.goto('/lote');
  await page.getByRole('button', { name: 'Abrir a central de ajuda' }).click();
  const chat = page.getByRole('dialog', { name: 'Central de ajuda' });
  // Na tela do lote, as dúvidas do lote aparecem primeiro.
  await expect(chat.getByRole('button', { name: 'Como consulto vários imóveis de uma vez?' })).toBeVisible();

  await chat.getByPlaceholder('Escreva sua dúvida…').fill('esqueci minha senha');
  await chat.getByPlaceholder('Escreva sua dúvida…').press('Enter');
  await expect(chat.getByText('O link vale por 1 hora')).toBeVisible();
  await chat.getByRole('link', { name: 'Recuperar a senha' }).click();
  await expect(page).toHaveURL(/\/esqueci-senha$/);
  await expect(chat).toHaveCount(0);

  // Dúvida sem resposta pronta: oferece os assuntos em vez de inventar.
  await page.getByRole('button', { name: 'Abrir a central de ajuda' }).click();
  await chat.getByPlaceholder('Escreva sua dúvida…').fill('xyzw qwerty');
  await chat.getByPlaceholder('Escreva sua dúvida…').press('Enter');
  await expect(chat.getByText('Não achei uma resposta pronta')).toBeVisible();
  await chat.getByRole('button', { name: 'Ver os assuntos' }).click();
  await chat.getByRole('button', { name: 'Créditos e pagamento' }).click();
  await chat.getByRole('button', { name: 'Como eu pago? Aceita Pix?' }).click();
  await expect(chat.getByText('Pix, cartão ou boleto')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(chat).toHaveCount(0);
  expect(erros).toEqual([]);
});

test('página de ajuda: busca sem acento e resposta aberta pelo endereço', async ({ page }) => {
  await page.goto('/ajuda');
  await page.getByRole('searchbox').fill('modulo fiscal');
  await expect(page.getByText('O que são os módulos fiscais e por que pedem?')).toBeVisible();
  await page.getByRole('searchbox').fill('carta ao banco');
  await expect(page.getByText('O dossiê escreve a carta ao banco ou o requerimento?')).toBeVisible();
  await page.goto('/ajuda#quilombolas');
  await expect(page.getByText('o acervo do Incra exige login')).toBeVisible();
});

test('tour de boas-vindas: aparece na primeira entrada, não volta depois de pular e pode ser visto de novo', async ({ page }) => {
  await criarContaConfirmada(page, emailNovo('tour'), 'Técnica do Tour', { pularTour: false });
  await page.goto('/consultar');
  const tour = page.getByRole('dialog', { name: /Boas-vindas ao Apto Rural/ });
  await expect(tour).toBeVisible();
  await tour.getByRole('button', { name: 'Mostrar' }).click();
  await expect(page.getByRole('dialog', { name: 'Comece pelo código do CAR' })).toBeVisible();
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/v1/conta/tour') && r.ok()), page.getByRole('button', { name: 'Pular tour' }).click()]);
  await expect(page.locator('.tour')).toHaveCount(0);

  // Outra visita: o tour não aparece de novo.
  await page.reload();
  await expect(page.getByLabel('Código do CAR')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.locator('.tour')).toHaveCount(0);

  // Pela Central de ajuda, dá para ver de novo, do começo ao fim.
  await page.getByRole('button', { name: 'Abrir a central de ajuda' }).click();
  await page.getByRole('button', { name: 'Ver o tour do sistema' }).click();
  await expect(page.getByText('Passo 1 de 8')).toBeVisible();
  for (let i = 0; i < 7; i++) await page.locator('.tour-botoes .botao-primario').click();
  await expect(page.getByText('Passo 8 de 8')).toBeVisible();
  await page.getByRole('button', { name: 'Começar a usar' }).click();
  await expect(page.locator('.tour')).toHaveCount(0);
});

test.describe('no celular', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('o menu leva a todas as telas e fecha ao navegar', async ({ page }) => {
    await page.goto('/');
    const botao = page.getByRole('button', { name: 'Menu com todas as telas' });
    await botao.click();
    const menu = page.getByRole('navigation', { name: 'Todas as telas' });
    for (const tela of ['Consultar imóvel', 'Consulta em lote', 'Entrar', 'Planos e preços', 'Perguntas frequentes', 'Regras e fontes'])
      await expect(menu.getByRole('link', { name: new RegExp(tela) })).toBeVisible();
    await menu.getByRole('link', { name: /Consulta em lote/ }).click();
    await expect(page).toHaveURL(/\/lote$/);
    await expect(menu).toHaveCount(0);
    await semRolagemLateral(page);

    // "Tirar uma dúvida agora" abre o chat.
    await botao.click();
    await menu.getByRole('button', { name: /Tirar uma dúvida agora/ }).click();
    await expect(page.getByRole('dialog', { name: 'Central de ajuda' })).toBeVisible();
    await semRolagemLateral(page);
  });
});
