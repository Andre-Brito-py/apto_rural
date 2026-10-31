import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

process.env.APTO_DEMO = '1';
process.env.ADMIN_EMAILS = 'admin@exemplo.com';
process.env.LOG_LEVEL = 'silent';
delete process.env.DATABASE_URL;
delete process.env.ASAAS_API_KEY;

const { criarServidor, criarContexto } = await import('../src/servidor.js');
const { EnviadorMemoria } = await import('../src/email/enviador.js');
const { ProvedorSimulado } = await import('../src/pagamentos/simulado.js');
const { ProvedorAsaas } = await import('../src/pagamentos/asaas.js');
const { encerrarAnuaisVencidas, proximaValidade } = await import('../src/assinaturas/mensalidades.js');
const { PLANOS_PADRAO } = await import('../src/produtos.js');

type App = ReturnType<typeof criarServidor>;

/** Servidor do modo demonstração (pagamento simulado, tudo na memória). */
function servidor() {
  const ctx = criarContexto();
  const email = new EnviadorMemoria();
  ctx.email = email;
  return { app: criarServidor(ctx), ctx, email };
}

const cookieDe = (res: { headers: Record<string, unknown> }) => {
  const c = res.headers['set-cookie'];
  return String(Array.isArray(c) ? c[0] : c).split(';')[0]!;
};

/** Conta com o e-mail confirmado (ganha a consulta grátis). */
async function conta(app: App, email: InstanceType<typeof EnviadorMemoria>, endereco: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/conta',
    payload: { nome: 'Pessoa Teste', email: endereco, senha: 'senha-bem-longa', aceiteTermos: true },
  });
  const cookie = cookieDe(res);
  const token = decodeURIComponent(/token=([^\s]+)/.exec(email.enviadas.at(-1)!.texto)![1]!);
  await app.inject({ method: 'POST', url: '/v1/conta/confirmar', payload: { token } });
  const id = (await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie } })).json().usuario.id as string;
  return { cookie, id };
}

const UM_ANO = 365 * 24 * 3600 * 1000;

describe('plano anual (pagamento simulado)', () => {
  const { app, ctx, email } = servidor();
  let cliente = { cookie: '', id: '' };
  let assinaturaId = '';
  const atual = async () => (await app.inject({ method: 'GET', url: '/v1/assinatura', headers: { cookie: cliente.cookie } })).json();

  beforeAll(async () => {
    cliente = await conta(app, email, 'anual@exemplo.com');
  });

  it('os planos vêm com o preço anual (10 mensalidades)', async () => {
    const planos = (await app.inject({ method: 'GET', url: '/v1/planos' })).json().planos;
    expect(planos.map((p: { id: string; valorAnual: number }) => [p.id, p.valorAnual])).toEqual([
      ['plano-projetista', 1990],
      ['plano-escritorio', 4990],
    ]);
  });

  it('assinar no anual cria a cobrança da anuidade, sem créditos antes de pagar', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/v1/assinaturas',
      headers: { cookie: cliente.cookie },
      payload: { plano: 'plano-projetista', ciclo: 'anual' },
    });
    expect(r.statusCode).toBe(201);
    assinaturaId = r.json().id;
    const a = await atual();
    expect(a.assinatura).toMatchObject({ ciclo: 'anual', nomePlano: 'Projetista (anual)', valorMensal: 1990, status: 'pendente' });
    expect(a.limiteCarteira).toBe(5);
    expect(await ctx.contas.saldo(cliente.id)).toEqual({ consulta: 1, dossie: 0 }); // só a grátis
  });

  it('pagar a anuidade libera os créditos do ano inteiro, a carteira do plano e a validade de 12 meses', async () => {
    await app.inject({ method: 'POST', url: `/v1/dev/assinaturas/${assinaturaId}/pagar-mes`, headers: { cookie: cliente.cookie } });
    expect(await ctx.contas.saldo(cliente.id)).toEqual({ consulta: 241, dossie: 24 }); // 1 grátis + 12 × 20
    const a = await atual();
    expect(a.assinatura.status).toBe('ativa');
    expect(a.limiteCarteira).toBe(50);
    const falta = new Date(a.assinatura.validaAte).getTime() - Date.now();
    expect(falta).toBeGreaterThan(UM_ANO - 2 * 24 * 3600 * 1000);
    expect(falta).toBeLessThan(UM_ANO + 2 * 24 * 3600 * 1000);
    const pedido = (await ctx.contas.pedidosDoUsuario(cliente.id)).find((p) => p.assinaturaId === assinaturaId);
    expect(pedido).toMatchObject({ valor: 1990, nomeProduto: 'Assinatura Projetista (anual)', status: 'pago' });
  });

  it('cancelar é não renovar: o plano continua valendo até o fim do ano pago', async () => {
    const r = await app.inject({ method: 'POST', url: '/v1/assinatura/cancelar', headers: { cookie: cliente.cookie } });
    expect(r.statusCode).toBe(200);
    const a = await atual();
    expect(r.json().validaAte).toBe(a.assinatura.validaAte);
    expect(a.assinatura.status).toBe('ativa');
    expect(a.assinatura.renovacaoCanceladaEm).toBeTruthy();
    expect(a.limiteCarteira).toBe(50);
    // Cancelar de novo não dá erro.
    expect((await app.inject({ method: 'POST', url: '/v1/assinatura/cancelar', headers: { cookie: cliente.cookie } })).statusCode).toBe(
      200,
    );
    // Outro plano só depois do fim do ano pago.
    const outra = await app.inject({
      method: 'POST',
      url: '/v1/assinaturas',
      headers: { cookie: cliente.cookie },
      payload: { plano: 'plano-escritorio' },
    });
    expect(outra.statusCode).toBe(409);
    expect(outra.json().erro.mensagem).toMatch(/^Seu plano anual vale até \d{2}\/\d{2}\/\d{4}/);
  });

  it('quando o ano pago acaba, a reconferência diária encerra o plano; os créditos ficam', async () => {
    expect(await encerrarAnuaisVencidas(ctx.contas, new Date())).toBe(0); // ainda dentro do ano
    expect(await encerrarAnuaisVencidas(ctx.contas, new Date(Date.now() + UM_ANO + 3 * 24 * 3600 * 1000))).toBe(1);
    const a = await atual();
    expect(a.assinatura).toBeNull();
    expect(a.limiteCarteira).toBe(5);
    expect(await ctx.contas.saldo(cliente.id)).toEqual({ consulta: 241, dossie: 24 });
  });

  it('anual sem pagar: cancelar encerra na hora, como no mensal', async () => {
    const outro = await conta(app, email, 'anual-desistiu@exemplo.com');
    await app.inject({
      method: 'POST',
      url: '/v1/assinaturas',
      headers: { cookie: outro.cookie },
      payload: { plano: 'plano-escritorio', ciclo: 'anual' },
    });
    await app.inject({ method: 'POST', url: '/v1/assinatura/cancelar', headers: { cookie: outro.cookie } });
    expect(await ctx.contas.assinaturaAtual(outro.id)).toBeNull();
  });
});

describe('plano anual: regras', () => {
  it('a renovação paga antes de vencer soma 12 meses ao fim do ano anterior', () => {
    const agora = new Date('2027-03-01T12:00:00Z');
    expect(proximaValidade(undefined, agora)).toBe('2028-03-01T12:00:00.000Z');
    expect(proximaValidade('2027-03-10T12:00:00.000Z', agora)).toBe('2028-03-10T12:00:00.000Z');
    // Já vencido (pagou atrasado): conta a partir de hoje.
    expect(proximaValidade('2027-02-01T12:00:00.000Z', agora)).toBe('2028-03-01T12:00:00.000Z');
  });

  it('plano sem opção anual recusa o ciclo anual', async () => {
    const { app, ctx, email } = servidor();
    const admin = await conta(app, email, 'admin@exemplo.com');
    await ctx.config.salvar(
      'planos',
      PLANOS_PADRAO.map((p) => (p.id === 'plano-escritorio' ? { ...p, valorAnual: null } : p)),
      admin.id,
    );
    const cliente = await conta(app, email, 'sem-anual@exemplo.com');
    const r = await app.inject({
      method: 'POST',
      url: '/v1/assinaturas',
      headers: { cookie: cliente.cookie },
      payload: { plano: 'plano-escritorio', ciclo: 'anual' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().erro.mensagem).toBe('O plano Escritório não tem opção anual.');
    const planos = (await app.inject({ method: 'GET', url: '/v1/planos' })).json().planos;
    expect(planos.find((p: { id: string }) => p.id === 'plano-escritorio').valorAnual).toBeNull();
  });

  it('cupom de algumas mensalidades vale só na primeira anuidade; depois, valor cheio', async () => {
    const { app, ctx, email } = servidor();
    const provedor = ctx.pagamento as InstanceType<typeof ProvedorSimulado>;
    const admin = (await conta(app, email, 'admin@exemplo.com')).cookie;
    await app.inject({
      method: 'POST',
      url: '/v1/admin/cupons',
      headers: { cookie: admin },
      payload: { codigo: 'LANCAMENTO30', tipo: 'percentual', valor: 30, meses: 3 },
    });
    const cliente = await conta(app, email, 'anual-cupom@exemplo.com');

    // Na página de planos, o cupom mostra o preço mensal e o anual.
    const validar = (
      await app.inject({
        method: 'POST',
        url: '/v1/cupons/validar',
        headers: { cookie: cliente.cookie },
        payload: { codigo: 'lancamento30' },
      })
    ).json();
    const projetista = validar.itens.filter((i: { id: string }) => i.id === 'plano-projetista');
    expect(projetista).toEqual([
      expect.objectContaining({ ciclo: 'mensal', de: 199, por: 139.3, meses: 3, texto: '30% de desconto nas 3 primeiras mensalidades' }),
      expect.objectContaining({ ciclo: 'anual', de: 1990, por: 1393, meses: 1, texto: '30% de desconto na primeira anuidade' }),
    ]);

    const r = await app.inject({
      method: 'POST',
      url: '/v1/assinaturas',
      headers: { cookie: cliente.cookie },
      payload: { plano: 'plano-projetista', ciclo: 'anual', cupom: 'LANCAMENTO30' },
    });
    expect(r.statusCode).toBe(201);
    const id = r.json().id;
    const a = (await app.inject({ method: 'GET', url: '/v1/assinatura', headers: { cookie: cliente.cookie } })).json().assinatura;
    expect(a).toMatchObject({ valorMensal: 1393, valorCheio: 1990, desconto: { mesesRestantes: 1, valorCheio: 1990 } });
    await app.inject({ method: 'POST', url: `/v1/dev/assinaturas/${id}/pagar-mes`, headers: { cookie: cliente.cookie } });
    const pago = await ctx.contas.buscarAssinatura(id);
    expect(provedor.valoresAtualizados).toEqual([{ provedorId: pago!.provedorId, valorMensal: 1990 }]);
    expect(pago!.valorMensal).toBe(1990);
  });
});

describe('Asaas: plano anual', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a assinatura anual vai com cycle YEARLY', async () => {
    const corpos: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      if (init.method === 'POST') corpos.push(JSON.parse(String(init.body)));
      if (url.endsWith('/payments'))
        return new Response(JSON.stringify({ data: [{ invoiceUrl: 'https://asaas/fatura' }] }), { status: 200 });
      return new Response(JSON.stringify({ id: 'sub_1' }), { status: 200 });
    });
    const asaas = new ProvedorAsaas('chave', 'sandbox', 'token');
    const r = await asaas.criarAssinatura({
      assinaturaId: 'a1',
      ciclo: 'anual',
      valorMensal: 1990,
      descricao: 'Apto Rural — plano Projetista (anual)',
      // Cliente que já existe no Asaas: não precisa de CPF/CNPJ.
      cliente: { id: 'cus_1', nome: 'Pessoa', email: 'p@exemplo.com' },
    });
    expect(r.link).toBe('https://asaas/fatura');
    expect(corpos.at(-1)).toMatchObject({ cycle: 'YEARLY', value: 1990, externalReference: 'a1' });
  });
});
