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
const { precoComCupom, situacao } = await import('../src/cupons/regras.js');

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

/** Conta com o e-mail confirmado (o admin precisa; o cliente ganha a consulta grátis). */
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

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const dia = (desloca: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + desloca * 24 * 3600 * 1000));

describe('regras do cupom', () => {
  it('calcula percentual e valor fixo em centavos, sem ficar negativo', () => {
    expect(precoComCupom({ tipo: 'percentual', valor: 30 }, 199)).toEqual({ final: 139.3, desconto: 59.7 });
    expect(precoComCupom({ tipo: 'percentual', valor: 33 }, 39)).toEqual({ final: 26.13, desconto: 12.87 });
    expect(precoComCupom({ tipo: 'fixo', valor: 50 }, 39)).toEqual({ final: 0, desconto: 39 });
    expect(precoComCupom({ tipo: 'percentual', valor: 100 }, 190)).toEqual({ final: 0, desconto: 190 });
  });

  it('situação: pausado, agendado, vencido e esgotado', () => {
    const base = {
      id: 'x',
      codigo: 'X',
      descricao: '',
      tipo: 'percentual' as const,
      valor: 10,
      alvos: [],
      meses: 1,
      limiteUsos: 2,
      limitePorConta: 1,
      apenasNovos: false,
      validoDe: null,
      validoAte: null,
      ativo: true,
      criadoEm: '',
      atualizadoEm: '',
    };
    expect(situacao(base, '2026-10-27', 0)).toBe('ativo');
    expect(situacao({ ...base, ativo: false }, '2026-10-27', 0)).toBe('pausado');
    expect(situacao({ ...base, validoDe: '2026-11-01' }, '2026-10-27', 0)).toBe('agendado');
    expect(situacao({ ...base, validoAte: '2026-10-26' }, '2026-10-27', 0)).toBe('vencido');
    // O último dia ainda vale.
    expect(situacao({ ...base, validoAte: '2026-10-27' }, '2026-10-27', 0)).toBe('ativo');
    expect(situacao(base, '2026-10-27', 2)).toBe('esgotado');
  });
});

describe('cupons no painel', () => {
  const { app, email } = servidor();
  let admin = '';
  let comum = '';

  beforeAll(async () => {
    admin = (await conta(app, email, 'admin@exemplo.com')).cookie;
    comum = (await conta(app, email, 'comum@exemplo.com')).cookie;
  });

  const criar = (payload: Record<string, unknown>, cookie = admin) =>
    app.inject({ method: 'POST', url: '/v1/admin/cupons', headers: { cookie }, payload });

  it('só o administrador cria, vê e muda', async () => {
    expect((await criar({ codigo: 'TESTE', tipo: 'percentual', valor: 10 }, comum)).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/v1/admin/cupons', headers: { cookie: comum } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/v1/admin/cupons' })).statusCode).toBe(403);
  });

  it('cria em maiúsculas e recusa código repetido, porcentagem acima de 100 e datas trocadas', async () => {
    const r = await criar({ codigo: ' bemvindo30 ', tipo: 'percentual', valor: 30, descricao: 'Lançamento' });
    expect(r.statusCode).toBe(201);
    expect(r.json().cupom).toMatchObject({ codigo: 'BEMVINDO30', meses: 1, limitePorConta: 1, limiteUsos: null, ativo: true, alvos: [] });
    expect((await criar({ codigo: 'BEMVINDO30', tipo: 'fixo', valor: 5 })).statusCode).toBe(409);
    expect((await criar({ codigo: 'DEMAIS', tipo: 'percentual', valor: 120 })).json().erro.mensagem).toMatch(/até 100%/);
    expect((await criar({ codigo: 'com espaço', tipo: 'fixo', valor: 5 })).statusCode).toBe(400);
    expect((await criar({ codigo: 'DATAS', tipo: 'fixo', valor: 5, validoDe: '2026-12-10', validoAte: '2026-12-01' })).json().erro.mensagem).toMatch(
      /início/,
    );
  });

  it('lista com a situação, os números e os itens para escolher', async () => {
    const r = (await app.inject({ method: 'GET', url: '/v1/admin/cupons', headers: { cookie: admin } })).json();
    const c = r.cupons.find((x: { codigo: string }) => x.codigo === 'BEMVINDO30');
    expect(c).toMatchObject({ situacao: 'ativo', usados: 0, reservados: 0, descontoConcedido: 0, receita: 0 });
    expect(r.itens.map((i: { id: string }) => i.id)).toEqual(['plano-projetista', 'plano-escritorio', 'consulta-avulsa', 'dossie-avulso']);
  });

  it('edita e apaga cupom sem uso', async () => {
    const { cupom } = (await criar({ codigo: 'RASCUNHO', tipo: 'fixo', valor: 10 })).json();
    const editado = await app.inject({
      method: 'PUT',
      url: `/v1/admin/cupons/${cupom.id}`,
      headers: { cookie: admin },
      payload: { ...cupom, codigo: 'RASCUNHO2', valor: 15, ativo: false },
    });
    expect(editado.json().cupom).toMatchObject({ codigo: 'RASCUNHO2', valor: 15, ativo: false });
    expect((await app.inject({ method: 'DELETE', url: `/v1/admin/cupons/${cupom.id}`, headers: { cookie: admin } })).statusCode).toBe(200);
  });
});

describe('cupom na compra avulsa', () => {
  const { app, ctx, email } = servidor();
  let admin = '';
  let cliente = { cookie: '', id: '' };

  beforeAll(async () => {
    admin = (await conta(app, email, 'admin@exemplo.com')).cookie;
    cliente = await conta(app, email, 'cliente@exemplo.com');
  });

  const criar = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/v1/admin/cupons', headers: { cookie: admin }, payload }).then((r) => r.json().cupom);
  const comprar = (cookie: string, produto: string, cupom?: string) =>
    app.inject({ method: 'POST', url: '/v1/pedidos', headers: { cookie }, payload: { produto, cupom } });
  const validar = (codigo: string, cookie?: string) =>
    app.inject({ method: 'POST', url: '/v1/cupons/validar', headers: cookie ? { cookie } : {}, payload: { codigo } });

  it('visitante vê o preço com o cupom em cada plano e produto', async () => {
    await criar({ codigo: 'DOSSIE20', tipo: 'percentual', valor: 20, alvos: ['dossie-avulso'] });
    const r = await validar('dossie20');
    expect(r.statusCode).toBe(200);
    const itens = r.json().itens;
    expect(itens.find((i: { id: string }) => i.id === 'dossie-avulso')).toMatchObject({ valido: true, de: 190, por: 152, desconto: 38 });
    expect(itens.find((i: { id: string }) => i.id === 'consulta-avulsa')).toMatchObject({ valido: false, mensagem: 'Este cupom não vale para Consulta avulsa.' });
  });

  it('código que não existe, pausado, vencido e agendado: mensagem clara', async () => {
    expect((await validar('NAOEXISTE')).json().erro.mensagem).toMatch(/não encontrado/);
    await criar({ codigo: 'PAUSADO', tipo: 'fixo', valor: 5, ativo: false });
    expect((await validar('PAUSADO')).json().erro.mensagem).toMatch(/não está valendo/);
    await criar({ codigo: 'VENCIDO', tipo: 'fixo', valor: 5, validoAte: dia(-1) });
    expect((await validar('VENCIDO')).json().erro.mensagem).toMatch(/venceu em/);
    await criar({ codigo: 'FUTURO', tipo: 'fixo', valor: 5, validoDe: dia(2) });
    expect((await validar('FUTURO')).json().erro.mensagem).toMatch(/começa a valer em/);
    await criar({ codigo: 'HOJE', tipo: 'fixo', valor: 5, validoDe: hoje(), validoAte: hoje() });
    expect((await validar('HOJE')).statusCode).toBe(200);
  });

  it('o preço com desconto vai para a cobrança; pago, conta como usado; a mesma conta não usa duas vezes', async () => {
    const r = await comprar(cliente.cookie, 'dossie-avulso', 'dossie20');
    expect(r.statusCode).toBe(201);
    const pedido = await ctx.contas.buscarPedido(r.json().id);
    expect(pedido).toMatchObject({ valor: 152, cupom: 'DOSSIE20', desconto: 38 });
    await app.inject({ method: 'POST', url: `/v1/dev/pedidos/${pedido!.id}/pagar`, headers: { cookie: cliente.cookie } });
    expect((await ctx.contas.saldo(cliente.id)).dossie).toBe(1);

    const lista = (await app.inject({ method: 'GET', url: '/v1/admin/cupons', headers: { cookie: admin } })).json().cupons;
    expect(lista.find((c: { codigo: string }) => c.codigo === 'DOSSIE20')).toMatchObject({ usados: 1, descontoConcedido: 38, receita: 152 });

    const de_novo = await comprar(cliente.cookie, 'dossie-avulso', 'DOSSIE20');
    expect(de_novo.statusCode).toBe(400);
    expect(de_novo.json().erro).toMatchObject({ mensagem: 'Você já usou este cupom.', campo: 'cupom' });
  });

  it('gerar outra cobrança com o mesmo cupom, sem pagar a primeira, não gasta o limite da conta', async () => {
    await criar({ codigo: 'DUASVEZES', tipo: 'fixo', valor: 10 });
    expect((await comprar(cliente.cookie, 'consulta-avulsa', 'DUASVEZES')).statusCode).toBe(201);
    expect((await comprar(cliente.cookie, 'consulta-avulsa', 'DUASVEZES')).statusCode).toBe(201);
    const { cupons } = (await app.inject({ method: 'GET', url: '/v1/admin/cupons', headers: { cookie: admin } })).json();
    expect(cupons.find((c: { codigo: string }) => c.codigo === 'DUASVEZES')).toMatchObject({ reservados: 1, usados: 0 });
  });

  it('a cobrança nova cancela a antiga com o mesmo cupom: não dá para pagar os dois links e levar o desconto duas vezes', async () => {
    await criar({ codigo: 'SOUMAVEZ', tipo: 'percentual', valor: 50 });
    const cancelar = vi.spyOn(ctx.pagamento!, 'cancelar');
    const primeira = (await comprar(cliente.cookie, 'consulta-avulsa', 'SOUMAVEZ')).json().id as string;
    const segunda = (await comprar(cliente.cookie, 'consulta-avulsa', 'SOUMAVEZ')).json().id as string;
    const antiga = await ctx.contas.buscarPedido(primeira);
    expect(antiga!.status).toBe('cancelado');
    expect(cancelar).toHaveBeenCalledWith(antiga!.provedorId);
    expect((await ctx.contas.buscarPedido(segunda))!.status).toBe('pendente');
    // O link antigo não paga mais; o novo paga, e o cupom fica usado uma vez só.
    expect((await app.inject({ method: 'POST', url: `/v1/dev/pedidos/${primeira}/pagar`, headers: { cookie: cliente.cookie } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: `/v1/dev/pedidos/${segunda}/pagar`, headers: { cookie: cliente.cookie } })).statusCode).toBe(200);
    const { cupons } = (await app.inject({ method: 'GET', url: '/v1/admin/cupons', headers: { cookie: admin } })).json();
    expect(cupons.find((c: { codigo: string }) => c.codigo === 'SOUMAVEZ')).toMatchObject({ usados: 1, reservados: 0 });
    cancelar.mockRestore();
  });

  it('se o provedor não cancelar a cobrança antiga, a nova não é criada', async () => {
    await criar({ codigo: 'TRAVADO', tipo: 'percentual', valor: 50 });
    const primeira = (await comprar(cliente.cookie, 'consulta-avulsa', 'TRAVADO')).json().id as string;
    const cancelar = vi.spyOn(ctx.pagamento!, 'cancelar').mockRejectedValueOnce(new Error('cobrança já paga'));
    const r = await comprar(cliente.cookie, 'consulta-avulsa', 'TRAVADO');
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toMatchObject({ campo: 'cupom', mensagem: expect.stringMatching(/pagamento em aberto/) });
    expect((await ctx.contas.buscarPedido(primeira))!.status).toBe('pendente');
    cancelar.mockRestore();
  });

  it('limite total: quando esgota, a próxima pessoa ouve que esgotou; cancelar a cobrança devolve o uso', async () => {
    await criar({ codigo: 'PRIMEIRO', tipo: 'percentual', valor: 50, limiteUsos: 1 });
    const outro = await conta(app, email, 'outro@exemplo.com');
    const r = await comprar(cliente.cookie, 'consulta-avulsa', 'PRIMEIRO');
    expect(r.statusCode).toBe(201);
    const negado = await comprar(outro.cookie, 'consulta-avulsa', 'PRIMEIRO');
    expect(negado.json().erro.mensagem).toMatch(/número máximo de vezes/);

    // A cobrança é cancelada (pelo painel ou pelo Asaas: PAYMENT_DELETED) e o uso volta a ficar livre.
    // Sem banco não há a rota de pedidos do painel; o mesmo caminho é chamado direto.
    const { aplicarEvento } = await import('../src/pagamentos/aplicar.js');
    await aplicarEvento(ctx.contas, (await ctx.contas.buscarPedido(r.json().id))!, 'cancelado', ctx.cupons);
    expect((await comprar(outro.cookie, 'consulta-avulsa', 'PRIMEIRO')).statusCode).toBe(201);
  });

  it('cupom de 100%: sem cobrança, os créditos entram na hora', async () => {
    await criar({ codigo: 'CORTESIA', tipo: 'percentual', valor: 100, alvos: ['consulta-avulsa'] });
    const antes = (await ctx.contas.saldo(cliente.id)).consulta;
    const r = await comprar(cliente.cookie, 'consulta-avulsa', 'CORTESIA');
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ gratis: true });
    expect(r.json().saldo.consulta).toBe(antes + 1);
    expect(await ctx.contas.buscarPedido(r.json().id)).toMatchObject({ valor: 0, status: 'pago', provedor: 'cupom' });
  });

  it('valor final entre R$ 0,01 e R$ 4,99 é recusado (mínimo do Asaas)', async () => {
    await criar({ codigo: 'QUASE', tipo: 'fixo', valor: 36 });
    const r = await comprar(cliente.cookie, 'consulta-avulsa', 'QUASE');
    expect(r.statusCode).toBe(400);
    expect(r.json().erro.mensagem).toMatch(/mínimo de uma cobrança/);
  });

  it('"só na primeira compra" recusa quem já pagou', async () => {
    await criar({ codigo: 'NOVOS', tipo: 'percentual', valor: 10, apenasNovos: true });
    expect((await comprar(cliente.cookie, 'consulta-avulsa', 'NOVOS')).json().erro.mensagem).toMatch(/primeira compra/);
    const novo = await conta(app, email, 'novinho@exemplo.com');
    expect((await comprar(novo.cookie, 'consulta-avulsa', 'NOVOS')).statusCode).toBe(201);
  });

  it('depois do primeiro uso, o código não muda e o cupom não é apagado (só pausado)', async () => {
    const { cupons } = (await app.inject({ method: 'GET', url: '/v1/admin/cupons', headers: { cookie: admin } })).json();
    const c = cupons.find((x: { codigo: string }) => x.codigo === 'DOSSIE20');
    const { situacao: _s, usados: _u, reservados: _r, descontoConcedido: _d, receita: _x, id, criadoEm: _c, atualizadoEm: _a, ...dados } = c;
    const mudarCodigo = await app.inject({ method: 'PUT', url: `/v1/admin/cupons/${id}`, headers: { cookie: admin }, payload: { ...dados, codigo: 'OUTRO' } });
    expect(mudarCodigo.statusCode).toBe(409);
    expect((await app.inject({ method: 'DELETE', url: `/v1/admin/cupons/${id}`, headers: { cookie: admin } })).statusCode).toBe(409);
    const pausar = await app.inject({ method: 'PUT', url: `/v1/admin/cupons/${id}`, headers: { cookie: admin }, payload: { ...dados, ativo: false } });
    expect(pausar.json().cupom.ativo).toBe(false);
    expect((await validar('DOSSIE20')).json().erro.mensagem).toMatch(/não está valendo/);

    const detalhe = (await app.inject({ method: 'GET', url: `/v1/admin/cupons/${id}`, headers: { cookie: admin } })).json();
    expect(detalhe.usos[0]).toMatchObject({ email: 'cliente@exemplo.com', status: 'usado', valorOriginal: 190, valorFinal: 152 });
  });
});

describe('cupom na assinatura: desconto por alguns meses e volta sozinha ao valor cheio', () => {
  const { app, ctx, email } = servidor();
  const provedor = ctx.pagamento as InstanceType<typeof ProvedorSimulado>;
  let admin = '';
  let cliente = { cookie: '', id: '' };
  let assinaturaId = '';

  beforeAll(async () => {
    admin = (await conta(app, email, 'admin@exemplo.com')).cookie;
    cliente = await conta(app, email, 'assinante@exemplo.com');
    await app.inject({
      method: 'POST',
      url: '/v1/admin/cupons',
      headers: { cookie: admin },
      payload: { codigo: 'METADE2', tipo: 'percentual', valor: 50, meses: 2, alvos: ['plano-projetista'] },
    });
  });

  const assinatura = async () => (await app.inject({ method: 'GET', url: '/v1/assinatura', headers: { cookie: cliente.cookie } })).json().assinatura;
  const pagarMes = () => app.inject({ method: 'POST', url: `/v1/dev/assinaturas/${assinaturaId}/pagar-mes`, headers: { cookie: cliente.cookie } });

  it('o cupom não vale em plano fora da lista', async () => {
    const r = await app.inject({ method: 'POST', url: '/v1/assinaturas', headers: { cookie: cliente.cookie }, payload: { plano: 'plano-escritorio', cupom: 'METADE2' } });
    expect(r.json().erro.mensagem).toBe('Este cupom não vale para o plano Escritório.');
  });

  it('a assinatura é criada no provedor com o valor com desconto', async () => {
    const r = await app.inject({ method: 'POST', url: '/v1/assinaturas', headers: { cookie: cliente.cookie }, payload: { plano: 'plano-projetista', cupom: 'metade2' } });
    expect(r.statusCode).toBe(201);
    assinaturaId = r.json().id;
    expect(await assinatura()).toMatchObject({ valorMensal: 99.5, valorCheio: 199, cupom: 'METADE2', desconto: { mesesRestantes: 2, valorCheio: 199 } });
  });

  it('1ª mensalidade: créditos do mês, desconto continua', async () => {
    await pagarMes();
    expect(await ctx.contas.saldo(cliente.id)).toEqual({ consulta: 21, dossie: 2 }); // 1 grátis + 20 do plano
    expect(provedor.valoresAtualizados).toEqual([]);
    expect((await assinatura()).desconto.mesesRestantes).toBe(1);
  });

  it('2ª mensalidade: acabam os meses de desconto e o valor cheio vai para o provedor', async () => {
    await pagarMes();
    const a = await ctx.contas.buscarAssinatura(assinaturaId);
    expect(provedor.valoresAtualizados).toEqual([{ provedorId: a!.provedorId, valorMensal: 199 }]);
    expect(await assinatura()).toMatchObject({ valorMensal: 199, desconto: null });
  });

  it('3ª mensalidade em diante: valor cheio, sem mexer no provedor de novo', async () => {
    await pagarMes();
    expect(provedor.valoresAtualizados).toHaveLength(1);
    const { cupons } = (await app.inject({ method: 'GET', url: '/v1/admin/cupons', headers: { cookie: admin } })).json();
    // Só as 2 mensalidades com desconto contam: R$ 99,50 de desconto e de receita em cada.
    expect(cupons[0]).toMatchObject({ codigo: 'METADE2', usados: 1, descontoConcedido: 199, receita: 199 });
  });
});

describe('cupom na assinatura: cancelar antes de pagar e encerrar o desconto pelo painel', () => {
  const { app, ctx, email } = servidor();
  const provedor = ctx.pagamento as InstanceType<typeof ProvedorSimulado>;
  let admin = '';
  let cliente = { cookie: '', id: '' };

  beforeAll(async () => {
    admin = (await conta(app, email, 'admin@exemplo.com')).cookie;
    cliente = await conta(app, email, 'mensal@exemplo.com');
    await app.inject({
      method: 'POST',
      url: '/v1/admin/cupons',
      headers: { cookie: admin },
      payload: { codigo: 'SEMPRE10', tipo: 'percentual', valor: 10, meses: null, limiteUsos: 1 },
    });
  });
  const assinar = (cupom?: string) =>
    app.inject({ method: 'POST', url: '/v1/assinaturas', headers: { cookie: cliente.cookie }, payload: { plano: 'plano-projetista', cupom } });

  it('assinatura pendente sem cupom: pede para cancelar antes de usar o cupom', async () => {
    expect((await assinar()).statusCode).toBe(201);
    const r = await assinar('SEMPRE10');
    expect(r.statusCode).toBe(409);
    expect(r.json().erro.mensagem).toMatch(/Cancele-a/);
    await app.inject({ method: 'POST', url: '/v1/assinatura/cancelar', headers: { cookie: cliente.cookie } });
  });

  it('cancelar antes do primeiro pagamento libera o cupom (limite de 1 uso)', async () => {
    expect((await assinar('SEMPRE10')).statusCode).toBe(201);
    await app.inject({ method: 'POST', url: '/v1/assinatura/cancelar', headers: { cookie: cliente.cookie } });
    expect((await assinar('SEMPRE10')).statusCode).toBe(201);
  });

  it('desconto sem prazo: o admin encerra pelo painel e o valor cheio vai para o provedor', async () => {
    const a = (await ctx.contas.assinaturaAtual(cliente.id))!;
    await app.inject({ method: 'POST', url: `/v1/dev/assinaturas/${a.id}/pagar-mes`, headers: { cookie: cliente.cookie } });
    expect(provedor.valoresAtualizados).toEqual([]);
    const uso = (await ctx.cupons.porAssinatura(a.id))!;
    expect(uso).toMatchObject({ status: 'usado', mensalidadesPagas: 1, meses: null });

    const comum = await app.inject({ method: 'POST', url: `/v1/admin/cupons/usos/${uso.id}/encerrar-desconto`, headers: { cookie: cliente.cookie } });
    expect(comum.statusCode).toBe(403);
    const r = await app.inject({ method: 'POST', url: `/v1/admin/cupons/usos/${uso.id}/encerrar-desconto`, headers: { cookie: admin } });
    expect(r.statusCode).toBe(200);
    expect(provedor.valoresAtualizados).toEqual([{ provedorId: a.provedorId, valorMensal: 199 }]);
    expect((await ctx.contas.buscarAssinatura(a.id))!.valorMensal).toBe(199);
    const repetido = await app.inject({ method: 'POST', url: `/v1/admin/cupons/usos/${uso.id}/encerrar-desconto`, headers: { cookie: admin } });
    expect(repetido.statusCode).toBe(409);
  });
});

describe('Asaas: fim do desconto', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('PUT /subscriptions/{id} com o valor novo e updatePendingPayments', async () => {
    const chamadas: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      return new Response(JSON.stringify({ id: 'sub_9', value: 199 }), { status: 200 });
    });
    await new ProvedorAsaas('chave', 'sandbox', 'token').atualizarValorAssinatura('sub_9', 199);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.url).toBe('https://api-sandbox.asaas.com/v3/subscriptions/sub_9');
    expect(chamadas[0]!.init.method).toBe('PUT');
    expect(JSON.parse(String(chamadas[0]!.init.body))).toEqual({ value: 199, updatePendingPayments: true });
  });

  it('se o Asaas falhar, o erro vai para o painel e o desconto não é dado como encerrado', async () => {
    const { app, ctx, email } = servidor();
    const registrados: string[] = [];
    ctx.erros = { registrar: async (e: { mensagem: string }) => void registrados.push(e.mensagem), enviarAgora: async () => {} } as never;
    const admin = (await conta(app, email, 'admin@exemplo.com')).cookie;
    const cliente = await conta(app, email, 'falha@exemplo.com');
    await app.inject({ method: 'POST', url: '/v1/admin/cupons', headers: { cookie: admin }, payload: { codigo: 'UMMES', tipo: 'fixo', valor: 100, meses: 1 } });
    const { id } = (
      await app.inject({ method: 'POST', url: '/v1/assinaturas', headers: { cookie: cliente.cookie }, payload: { plano: 'plano-projetista', cupom: 'UMMES' } })
    ).json();
    (ctx.pagamento as InstanceType<typeof ProvedorSimulado>).atualizarValorAssinatura = async () => {
      throw new Error('Asaas fora do ar');
    };
    await app.inject({ method: 'POST', url: `/v1/dev/assinaturas/${id}/pagar-mes`, headers: { cookie: cliente.cookie } });
    expect(registrados[0]).toMatch(/valor cheio no Asaas: Asaas fora do ar/);
    expect((await ctx.contas.buscarAssinatura(id))!.valorMensal).toBe(99);
    expect((await ctx.cupons.porAssinatura(id))!.descontoEncerradoEm).toBeUndefined();
  });
});

describe('conferência do cupom na página de planos', () => {
  const { app, email } = servidor();
  let admin = '';

  beforeAll(async () => {
    admin = (await conta(app, email, 'admin@exemplo.com')).cookie;
  });

  it('cupom já usado pela conta: o motivo aparece, não "não vale para o plano"', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/admin/cupons',
      headers: { cookie: admin },
      payload: { codigo: 'SOCONSULTA', tipo: 'percentual', valor: 100, alvos: ['consulta-avulsa'] },
    });
    const cliente = await conta(app, email, 'resgate@exemplo.com');
    const compra = await app.inject({ method: 'POST', url: '/v1/pedidos', headers: { cookie: cliente.cookie }, payload: { produto: 'consulta-avulsa', cupom: 'SOCONSULTA' } });
    expect(compra.json().gratis).toBe(true);
    const r = await app.inject({ method: 'POST', url: '/v1/cupons/validar', headers: { cookie: cliente.cookie }, payload: { codigo: 'SOCONSULTA' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().erro.mensagem).toBe('Você já usou este cupom.');
  });
});
