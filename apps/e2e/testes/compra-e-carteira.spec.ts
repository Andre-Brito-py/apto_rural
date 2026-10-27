import { expect, test } from '@playwright/test';
import { criarContaConfirmada, emailNovo } from './apoio';

/** CAR no formato certo, que não existe em base nenhuma do banco dos testes. */
const carDeTeste = () => `MT-5104906-${Array.from({ length: 32 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('')}`;

/** Um quadrado pequeno em Mato Grosso, como se fosse o contorno do imóvel. */
const CONTORNO = JSON.stringify({
  type: 'Feature',
  properties: {},
  geometry: { type: 'Polygon', coordinates: [[[-56.9, -15.0], [-56.88, -15.0], [-56.88, -14.98], [-56.9, -14.98], [-56.9, -15.0]]] },
});

test('comprar uma consulta (pagamento simulado), consultar um imóvel real, explicar e acompanhar na carteira', async ({ page }) => {
  await criarContaConfirmada(page, emailNovo('compra'));

  // Compra: a fatura simulada substitui o Asaas; o crédito entra quando o pagamento confirma.
  await page.goto('/planos');
  // A consulta avulsa: com o pagamento simulado não há CPF a pedir, então o 1º toque já vai à fatura.
  const avulsa = page.locator('li.avulso').filter({ has: page.getByRole('heading', { name: 'Consulta avulsa' }) });
  await avulsa.getByRole('button', { name: /Comprar|Ir para o pagamento/ }).click();
  await expect(page).toHaveURL(/pagamento-simulado/);
  await page.getByRole('button', { name: 'Simular pagamento confirmado' }).click();
  await expect(page.getByText('Pagamento confirmado')).toBeVisible();
  await expect(page.locator('.saldo')).toHaveText('2 consultas');

  // Consulta de um imóvel "real" (sem as bases oficiais neste banco: itens não verificados).
  await page.goto('/consultar');
  await page.locator('.entrada-car').fill(carDeTeste());
  await page.getByLabel('Ativo').check();
  await page.locator('input[type=file]').setInputFiles({ name: 'imovel.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(CONTORNO) });
  await expect(page.getByText('Contorno lido')).toBeVisible();
  await page.getByRole('button', { name: 'Consultar imóvel' }).click();
  await expect(page).toHaveURL(/\/consulta\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.saldo')).toHaveText('1 consulta');
  await expect(page.locator('.mapa-entorno')).toBeVisible();

  // Explicação para o produtor: sem IA configurada, sai a explicação montada das regras.
  await page.getByRole('button', { name: 'Explicar para o produtor' }).click();
  await expect(page.locator('.explicacao-texto')).toContainText('banco');
  await expect(page.getByText('Explicação montada direto do resultado oficial')).toBeVisible();

  // Carteira.
  await page.getByPlaceholder(/Apelido/).fill('Fazenda do Teste');
  await page.getByRole('button', { name: 'Acompanhar' }).click();
  await expect(page.getByText('Imóvel na sua carteira')).toBeVisible();
  await page.goto('/carteira');
  await expect(page.getByText('Fazenda do Teste')).toBeVisible();
});

test('sem crédito, a consulta real pede para comprar', async ({ page }) => {
  await criarContaConfirmada(page, emailNovo('semcredito'));
  for (let i = 0; i < 2; i++) {
    await page.goto('/consultar');
    await page.locator('.entrada-car').fill(carDeTeste());
    await page.getByRole('button', { name: 'Consultar imóvel' }).click();
    if (i === 0) await expect(page).toHaveURL(/\/consulta\//); // a consulta grátis
  }
  await expect(page.getByRole('link', { name: 'Ver planos' })).toBeVisible();
});
