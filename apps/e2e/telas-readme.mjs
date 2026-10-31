// Fotos das telas para o README (docs/telas.md). Roda contra o servidor dos testes de navegador
// (modo demonstração, dados fictícios) e grava em docs/img/telas/.
//   node apps/e2e/servidor.mjs   (em outro terminal, com o Mailpit no ar)
//   node apps/e2e/telas-readme.mjs
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'img', 'telas');
const BASE = `http://127.0.0.1:${process.env.E2E_PORTA ?? '3400'}`;
const MAILPIT = process.env.E2E_MAILPIT ?? 'http://127.0.0.1:8025';
const SENHA = 'Senha-das-fotos-do-README';
mkdirSync(OUT, { recursive: true });

/** Link de confirmação que chegou ao Mailpit. */
async function linkConfirmacao(email) {
  for (let i = 0; i < 40; i++) {
    const busca = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then((r) => r.json());
    const id = busca.messages?.[0]?.ID;
    if (id) {
      const msg = await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json());
      const link = /https?:\/\/[^\s"<>]+\/confirmar-email\?[^\s"<>]*/.exec(msg.Text)?.[0];
      if (link) return new URL(link).pathname + new URL(link).search;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Sem e-mail de confirmação para ${email}`);
}
async function criarConta(page, email, nome) {
  await page.goto(`${BASE}/entrar?modo=criar`);
  await page.getByLabel('Nome').fill(nome);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.waitForTimeout(900);
  await page.request.post(`${BASE}/v1/conta/tour`);
  await page.goto(BASE + (await linkConfirmacao(email)));
  await page.waitForTimeout(900);
}
const LIMPO = '.faixa-demo{display:none!important} .cabecalho,.dossie-barra{position:static!important}';
const SEM_AJUDA = '.ajuda-chat{display:none!important}';
async function limpar(page, comAjuda = false) {
  await page.addStyleTag({ content: LIMPO + (comAjuda ? '' : SEM_AJUDA) });
}
const foto = async (page, nome, opts = {}, comAjuda = false) => {
  await limpar(page, comAjuda);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${nome}.png`, ...opts });
  console.log('ok', nome);
};
const b = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--lang=pt-BR'],
  env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' },
});

// Visitante
const vis = await (
  await b.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', viewport: { width: 1280, height: 800 } })
).newPage();
await vis.goto(BASE + '/');
await foto(vis, '01-inicio');

// Técnica
const ctx = await b.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
await criarConta(p, 'tecnica@exemplo.test', 'Técnica Exemplo');
await p.goto(BASE + '/consultar');
await foto(p, '02-nova-consulta');
await p.getByRole('button', { name: 'Embargo + Prodes' }).click();
await p.getByRole('button', { name: 'Consultar imóvel' }).click();
await p.waitForURL(/\/consulta\/[0-9a-f-]{36}$/);
await foto(p, '03-resultado', { fullPage: true, clip: { x: 0, y: 0, width: 1280, height: 1700 } });
await limpar(p);
await p.locator('.mapa-entorno').scrollIntoViewIfNeeded();
await p.locator('.mapa-entorno').screenshot({ path: `${OUT}/04-mapa.png` });
console.log('ok mapa');
await p.locator('.secao-itens').screenshot({ path: `${OUT}/04b-itens.png` });
console.log('ok itens');
const explicar = p.getByRole('button', { name: 'Explicar para o produtor' });
if (await explicar.count()) {
  await limpar(p);
  await explicar.click();
  await p.waitForTimeout(1500);
  const bloco = p.locator('.explicacao, [class*=explicacao]').first();
  if (await bloco.count()) {
    await bloco.scrollIntoViewIfNeeded();
    await bloco.screenshot({ path: `${OUT}/05-explicacao.png` });
    console.log('ok explicacao');
  }
}
const urlResultado = p.url();
await p.getByRole('link', { name: /dossiê do imóvel/i }).click();
await p.getByRole('heading', { name: 'Impedimentos socioambientais do crédito rural' }).waitFor();
await foto(p, '06-dossie');
const apoio = p.locator('.apoio').first();
await apoio.getByRole('button', { name: /carta ao banco/i }).click();
await apoio.locator('.apoio-cartao').first().waitFor();
await limpar(p);
await apoio.scrollIntoViewIfNeeded();
await apoio.screenshot({ path: `${OUT}/07-dossie-apoio.png` });
console.log('ok apoio');
await p.goto(BASE + '/lote');
await foto(p, '08-lote');
await p.goto(BASE + '/carteira');
await foto(p, '09-carteira');
await p.goto(BASE + '/planos');
await foto(p, '10-planos');
await p.getByRole('radio', { name: /Anual/ }).click();
await foto(p, '10b-planos-anual', { fullPage: true, clip: { x: 0, y: 0, width: 1280, height: 1250 } });
await p.goto(urlResultado);
await p.waitForTimeout(800);
await p.getByRole('button', { name: 'Abrir a central de ajuda' }).click();
const chat = p.getByRole('dialog', { name: 'Central de ajuda' });
await chat.getByPlaceholder('Escreva sua dúvida…').fill('carta ao banco');
await chat.getByPlaceholder('Escreva sua dúvida…').press('Enter');
await foto(p, '11-central-de-ajuda', {}, true);
await p.keyboard.press('Escape');
await p.goto(BASE + '/conta');
await foto(p, '12-minha-conta');

// Celular
const cel = await (
  await b.newContext({
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    storageState: await ctx.storageState(),
  })
).newPage();
await cel.goto(urlResultado);
await foto(cel, '13-celular-resultado');

// Administradora
const actx = await b.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', viewport: { width: 1280, height: 900 } });
const a = await actx.newPage();
await criarConta(a, 'admin@e2e.local', 'Administradora Exemplo');
await a.goto(BASE + '/admin');
await foto(a, '14-painel');
await a.goto(BASE + '/admin?aba=cupons');
await a.getByRole('button', { name: 'Novo cupom' }).click();
await a.getByPlaceholder('Ex.: BEMVINDO30').fill('LANCAMENTO30');
await a.getByPlaceholder('Ex.: Feira de Sorriso, parceiro X').fill('Primeiros clientes do lançamento');
await a.locator('input[type=number]').first().fill('30');
await a.locator('input[type=number]').nth(1).fill('3');
await a.getByLabel('Sem limite no total').uncheck();
await a.locator('input[type=number]').nth(2).fill('50');
await a.locator('input[type=date]').nth(1).fill('2026-12-31');
await foto(a, '15-painel-novo-cupom', { fullPage: true });
await a.getByRole('button', { name: 'Criar cupom' }).click();
await a.waitForTimeout(900);
await a.getByRole('button', { name: 'Novo cupom' }).click();
await a.getByPlaceholder('Ex.: BEMVINDO30').fill('BETA100');
await a.getByPlaceholder('Ex.: Feira de Sorriso, parceiro X').fill('Beta fechado');
await a.locator('input[type=number]').first().fill('100');
await a.getByRole('button', { name: 'Criar cupom' }).click();
await a.waitForTimeout(900);
await a.reload();
await a.waitForTimeout(900);
await foto(a, '16-painel-cupons');
await a.goto(BASE + '/admin?aba=ia');
await foto(a, '17-painel-ia', { fullPage: true });
await b.close();
