import { expect, test } from '@playwright/test';
import { criarContaConfirmada, emailNovo, entrarComoAdmin, vigiarErros } from './apoio';

/** Código único por rodada (o banco é compartilhado entre os testes). */
const codigoNovo = (prefixo: string) => `${prefixo}${Date.now().toString(36).toUpperCase()}`;

test('o administrador cria um cupom no painel e o cliente assina com desconto pelo link de divulgação', async ({ browser }) => {
  const codigo = codigoNovo('METADE');

  // Painel: novo cupom de 50% nas 2 primeiras mensalidades, para 10 clientes.
  const admin = await browser.newPage();
  const errosAdmin = vigiarErros(admin);
  await entrarComoAdmin(admin);
  await admin.goto('/admin?aba=cupons');
  await expect(admin.getByRole('heading', { level: 1 })).toContainText('Cupons');
  await admin.getByRole('button', { name: 'Novo cupom' }).click();
  await admin.getByPlaceholder('Ex.: BEMVINDO30').fill(codigo.toLowerCase());
  await admin.getByPlaceholder('Ex.: Feira de Sorriso, parceiro X').fill('Teste de navegador');
  await admin.getByLabel('Quantos por cento (1 a 100)').fill('50');
  await admin.getByLabel(/Quantas mensalidades com desconto/).fill('2');
  await admin.getByLabel('Sem limite no total').uncheck();
  await admin.getByLabel(/Usos no total/).fill('10');
  // A simulação mostra o preço do plano com o desconto antes de salvar.
  await expect(admin.getByRole('row', { name: /Plano Projetista/ })).toContainText('R$ 99,50');
  await admin.getByRole('button', { name: 'Criar cupom' }).click();
  await expect(admin.getByText(`Cupom ${codigo} criado`)).toBeVisible();
  const linha = admin.getByRole('row', { name: new RegExp(codigo) });
  await expect(linha).toContainText('Valendo');
  await expect(linha).toContainText('0 de 10');

  // Cliente: chega pelo link, cria a conta e volta para os planos com o cupom aplicado.
  const cliente = await browser.newPage();
  const errosCliente = vigiarErros(cliente);
  await criarContaConfirmada(cliente, emailNovo('cupom'));
  await cliente.goto(`/planos?cupom=${codigo}`);
  await expect(cliente.getByText(`Cupom ${codigo} aplicado`)).toBeVisible();
  const projetista = cliente.locator('li.l-plano').filter({ has: cliente.getByRole('heading', { name: 'Projetista' }) });
  await expect(projetista.locator('.l-plano-preco')).toContainText('R$ 99,50');
  await expect(projetista).toContainText('50% de desconto nas 2 primeiras mensalidades; depois, R$ 199,00/mês.');
  await projetista.getByRole('button', { name: /Ir para o pagamento|Assinar/ }).click();
  await expect(cliente).toHaveURL(/pagamento-simulado\/assinatura/);
  await cliente.getByRole('button', { name: 'Simular mensalidade paga' }).click();
  await expect(cliente.getByText('Mensalidade confirmada')).toBeVisible();
  await cliente.goto('/planos');
  await expect(cliente.getByText(`cupom ${codigo}; ainda mais 1 mensalidade com desconto`)).toBeVisible();

  // Painel: o uso aparece, com o desconto dado e a contagem das mensalidades.
  await admin.goto('/admin?aba=cupons');
  await expect(linha).toContainText('1 de 10');
  await expect(linha).toContainText('R$ 99,50');
  await linha.getByRole('button', { name: 'Usos' }).click();
  await expect(admin.getByText('1 de 2 mensalidades')).toBeVisible();

  expect(errosAdmin).toEqual([]);
  expect(errosCliente).toEqual([]);
});

test('cupom que não existe ou de 100% na consulta avulsa', async ({ browser }) => {
  const codigo = codigoNovo('GRATIS');
  const admin = await browser.newPage();
  await entrarComoAdmin(admin);
  const r = await admin.request.post('/v1/admin/cupons', {
    data: { codigo, tipo: 'percentual', valor: 100, alvos: ['consulta-avulsa'] },
  });
  expect(r.status()).toBe(201);

  const cliente = await browser.newPage();
  const erros = vigiarErros(cliente);
  await criarContaConfirmada(cliente, emailNovo('gratis'));
  await cliente.goto('/planos');
  await cliente.getByPlaceholder('Ex.: BEMVINDO').fill('NAOEXISTE');
  await cliente.getByRole('button', { name: 'Aplicar' }).click();
  await expect(cliente.getByText('Cupom não encontrado. Confira se digitou certo.')).toBeVisible();

  await cliente.getByPlaceholder('Ex.: BEMVINDO').fill(codigo);
  await cliente.getByRole('button', { name: 'Aplicar' }).click();
  const avulsa = cliente.locator('li.avulso').filter({ has: cliente.getByRole('heading', { name: 'Consulta avulsa' }) });
  await expect(avulsa).toContainText('Grátis');
  await avulsa.getByRole('button', { name: 'Resgatar grátis' }).click();
  await expect(cliente.getByText(/a compra saiu de graça/)).toBeVisible();
  await expect(cliente.locator('.saldo')).toHaveText('2 consultas');
  // Era um uso por conta: a página já avisa.
  await expect(cliente.getByText('Você já usou este cupom.')).toBeVisible();
  // O 404 do código inexistente é a resposta esperada da conferência.
  expect(erros.filter((e) => !e.endsWith('/v1/cupons/validar'))).toEqual([]);
});
