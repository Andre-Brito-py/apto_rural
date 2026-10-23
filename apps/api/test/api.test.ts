import { beforeAll, describe, expect, it } from 'vitest';

process.env.APTO_DEMO = '1';
process.env.ADMIN_EMAILS = 'admin@exemplo.com';
process.env.LOG_LEVEL = 'silent';
delete process.env.DATABASE_URL;
delete process.env.ASAAS_API_KEY;

const { criarServidor, criarContexto } = await import('../src/servidor.js');
const { ProvedorAsaas } = await import('../src/pagamentos/asaas.js');
const { CARS_DEMO } = await import('../src/repositorio/demo.js');
const { EnviadorMemoria } = await import('../src/email/enviador.js');
const { RegistroErros } = await import('../src/monitoramento/erros.js');

/** Servidor com e-mails guardados em memória, para ler os links nos testes. */
function servidorComEmail() {
  const ctx = criarContexto();
  const email = new EnviadorMemoria();
  ctx.email = email;
  return { app: criarServidor(ctx), email, ctx };
}

function tokenDoUltimoEmail(email: InstanceType<typeof EnviadorMemoria>): string {
  const texto = email.enviadas.at(-1)!.texto;
  return decodeURIComponent(/token=([^\s]+)/.exec(texto)![1]!);
}

const TOKEN_WEBHOOK = 'x'.repeat(40);

function cookieDe(res: { headers: Record<string, unknown> }): string {
  const c = res.headers['set-cookie'];
  return String(Array.isArray(c) ? c[0] : c).split(';')[0]!;
}

async function novaConta(app: ReturnType<typeof criarServidor>, email = 'tecnico@exemplo.com') {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/conta',
    payload: { nome: 'Técnico Teste', email, senha: 'senha-bem-longa', aceiteTermos: true, whatsapp: '(65) 99999-0000' },
  });
  return { res, cookie: cookieDe(res) };
}

describe('contas', () => {
  const { app, email } = servidorComEmail();

  it('cadastro abre sessão e manda o e-mail de confirmação; a amostra grátis espera a confirmação', async () => {
    const { res, cookie } = await novaConta(app);
    expect(res.statusCode).toBe(201);
    expect(res.json().saldo).toEqual({ consulta: 0, dossie: 0 });
    expect(res.json().usuario.emailConfirmado).toBe(false);
    expect(res.headers['set-cookie']).toMatch(/HttpOnly/i);
    expect(email.enviadas.at(-1)!.para).toBe('tecnico@exemplo.com');

    const token = tokenDoUltimoEmail(email);
    const conf = await app.inject({ method: 'POST', url: '/v1/conta/confirmar', payload: { token } });
    expect(conf.json().saldo).toEqual({ consulta: 1, dossie: 0 });
    const eu = await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie } });
    expect(eu.json().usuario.emailConfirmado).toBe(true);

    // O mesmo link não vale duas vezes, e a amostra não é dada de novo.
    const repetido = await app.inject({ method: 'POST', url: '/v1/conta/confirmar', payload: { token } });
    expect(repetido.statusCode).toBe(400);
  });

  it('e-mail repetido é recusado, sem diferença de maiúsculas', async () => {
    const { res } = await novaConta(app, 'TECNICO@exemplo.com');
    expect(res.statusCode).toBe(409);
  });

  it('exige aceite dos termos e senha de 10+ caracteres', async () => {
    const r1 = await app.inject({ method: 'POST', url: '/v1/conta', payload: { nome: 'A B', email: 'a@b.com', senha: 'curta', aceiteTermos: true } });
    expect(r1.statusCode).toBe(400);
    const r2 = await app.inject({ method: 'POST', url: '/v1/conta', payload: { nome: 'A B', email: 'a@b.com', senha: 'senha-bem-longa' } });
    expect(r2.statusCode).toBe(400);
  });

  it('senha errada e e-mail inexistente têm a mesma resposta', async () => {
    const a = await app.inject({ method: 'POST', url: '/v1/sessao', payload: { email: 'tecnico@exemplo.com', senha: 'errada-errada' } });
    const b = await app.inject({ method: 'POST', url: '/v1/sessao', payload: { email: 'ninguem@exemplo.com', senha: 'errada-errada' } });
    expect(a.statusCode).toBe(401);
    expect(b.json()).toEqual(a.json());
  });

  it('esqueci a senha não revela se o e-mail existe', async () => {
    const enviadasAntes = email.enviadas.length;
    const a = await app.inject({ method: 'POST', url: '/v1/senha/esqueci', payload: { email: 'ninguem@exemplo.com' } });
    const b = await app.inject({ method: 'POST', url: '/v1/senha/esqueci', payload: { email: 'tecnico@exemplo.com' } });
    expect(a.json()).toEqual(b.json());
    await new Promise((r) => setTimeout(r, 50)); // o envio é assíncrono
    expect(email.enviadas.length).toBe(enviadasAntes + 1);
    expect(email.enviadas.at(-1)!.para).toBe('tecnico@exemplo.com');
  });

  it('nova senha pelo link derruba as sessões antigas e entra com a nova', async () => {
    const antiga = cookieDe(await app.inject({ method: 'POST', url: '/v1/sessao', payload: { email: 'tecnico@exemplo.com', senha: 'senha-bem-longa' } }));
    await app.inject({ method: 'POST', url: '/v1/senha/esqueci', payload: { email: 'tecnico@exemplo.com' } });
    await new Promise((r) => setTimeout(r, 50));
    const token = tokenDoUltimoEmail(email);

    const curta = await app.inject({ method: 'POST', url: '/v1/senha/redefinir', payload: { token, senha: 'curta' } });
    expect(curta.statusCode).toBe(400);
    const r = await app.inject({ method: 'POST', url: '/v1/senha/redefinir', payload: { token, senha: 'senha-nova-bem-longa' } });
    expect(r.statusCode).toBe(200);

    expect((await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie: antiga } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie: cookieDe(r) } })).statusCode).toBe(200);
    const velha = await app.inject({ method: 'POST', url: '/v1/sessao', payload: { email: 'tecnico@exemplo.com', senha: 'senha-bem-longa' } });
    expect(velha.statusCode).toBe(401);
    const nova = await app.inject({ method: 'POST', url: '/v1/sessao', payload: { email: 'tecnico@exemplo.com', senha: 'senha-nova-bem-longa' } });
    expect(nova.statusCode).toBe(200);

    // Link de senha usado não vale de novo.
    const outra = await app.inject({ method: 'POST', url: '/v1/senha/redefinir', payload: { token, senha: 'mais-uma-senha-longa' } });
    expect(outra.statusCode).toBe(400);
  });

  it('link de confirmação não serve para trocar senha', async () => {
    await novaConta(app, 'outro@exemplo.com');
    const token = tokenDoUltimoEmail(email);
    const r = await app.inject({ method: 'POST', url: '/v1/senha/redefinir', payload: { token, senha: 'tentativa-de-troca' } });
    expect(r.statusCode).toBe(400);
  });

  it('sair invalida a sessão', async () => {
    const login = await app.inject({ method: 'POST', url: '/v1/sessao', payload: { email: 'tecnico@exemplo.com', senha: 'senha-nova-bem-longa' } });
    const cookie = cookieDe(login);
    await app.inject({ method: 'DELETE', url: '/v1/sessao', headers: { cookie } });
    const eu = await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie } });
    expect(eu.statusCode).toBe(401);
  });
});

describe('compra com pagamento simulado', () => {
  const app = criarServidor();
  let cookie = '';
  beforeAll(async () => {
    cookie = (await novaConta(app)).cookie;
  });

  it('pedido só credita depois de pago, e pagar duas vezes não duplica', async () => {
    const pedido = await app.inject({ method: 'POST', url: '/v1/pedidos', headers: { cookie }, payload: { produto: 'pacote-projetista' } });
    expect(pedido.statusCode).toBe(201);
    const { id } = pedido.json();
    let eu = await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie } });
    expect(eu.json().saldo).toEqual({ consulta: 0, dossie: 0 });

    await app.inject({ method: 'POST', url: `/v1/dev/pedidos/${id}/pagar`, headers: { cookie } });
    await app.inject({ method: 'POST', url: `/v1/dev/pedidos/${id}/pagar`, headers: { cookie } });
    eu = await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie } });
    expect(eu.json().saldo).toEqual({ consulta: 20, dossie: 2 });
  });

  it('produto inexistente é recusado', async () => {
    const r = await app.inject({ method: 'POST', url: '/v1/pedidos', headers: { cookie }, payload: { produto: 'gratis' } });
    expect(r.statusCode).toBe(400);
  });

  it('comprar exige conta', async () => {
    const r = await app.inject({ method: 'POST', url: '/v1/pedidos', payload: { produto: 'consulta-avulsa' } });
    expect(r.statusCode).toBe(401);
  });
});

describe('webhook do Asaas', () => {
  const ctx = criarContexto();
  ctx.pagamento = new ProvedorAsaas('chave-de-teste', 'sandbox', TOKEN_WEBHOOK);
  const app = criarServidor(ctx);
  let usuarioId = '';
  let pedidoId = '';

  beforeAll(async () => {
    const { cookie } = await novaConta(app, 'pagador@exemplo.com');
    usuarioId = (await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie } })).json().usuario.id;
    const p = await ctx.contas.criarPedido({ usuarioId, produto: 'dossie-avulso', valor: 190, provedor: 'asaas' });
    await ctx.contas.atualizarPedido(p.id, { provedorId: 'pay_123' });
    pedidoId = p.id;
  });

  const enviar = (evento: string, id: string, token = TOKEN_WEBHOOK) =>
    app.inject({
      method: 'POST',
      url: '/v1/webhooks/asaas',
      headers: { 'asaas-access-token': token },
      payload: { id, event: evento, payment: { id: 'pay_123', externalReference: pedidoId, status: 'RECEIVED' } },
    });

  it('recusa token errado', async () => {
    expect((await enviar('PAYMENT_RECEIVED', 'evt_x', 'y'.repeat(40))).statusCode).toBe(401);
    expect((await ctx.contas.saldo(usuarioId)).dossie).toBe(0);
  });

  it('PAYMENT_RECEIVED credita uma vez, mesmo com evento repetido', async () => {
    await enviar('PAYMENT_RECEIVED', 'evt_1');
    await enviar('PAYMENT_RECEIVED', 'evt_1');
    await enviar('PAYMENT_CONFIRMED', 'evt_2');
    expect((await ctx.contas.saldo(usuarioId)).dossie).toBe(1);
    expect((await ctx.contas.buscarPedido(pedidoId))!.status).toBe('pago');
  });

  it('estorno retira os créditos', async () => {
    await enviar('PAYMENT_REFUNDED', 'evt_3');
    expect((await ctx.contas.saldo(usuarioId)).dossie).toBe(0);
    expect((await ctx.contas.buscarPedido(pedidoId))!.status).toBe('estornado');
  });
});

describe('painel administrativo e erros', () => {
  const { app, email, ctx } = servidorComEmail();
  const registrados: { origem: string; mensagem: string; rota?: string }[] = [];
  ctx.erros = { registrar: async (e) => void registrados.push(e), enviarAgora: async () => {} } as InstanceType<typeof RegistroErros>;
  app.get('/v1/teste-erro', async () => {
    throw new Error('falha de teste com CPF 123.456.789-09 no corpo');
  });

  it('quem não é admin recebe 403, inclusive sem login', async () => {
    const { cookie } = await novaConta(app, 'comum@exemplo.com');
    expect((await app.inject({ method: 'GET', url: '/v1/admin/resumo', headers: { cookie } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/v1/admin/resumo' })).statusCode).toBe(403);
  });

  it('admin precisa ter o e-mail confirmado', async () => {
    const { cookie } = await novaConta(app, 'admin@exemplo.com');
    expect((await app.inject({ method: 'GET', url: '/v1/admin/resumo', headers: { cookie } })).statusCode).toBe(403);
    await app.inject({ method: 'POST', url: '/v1/conta/confirmar', payload: { token: tokenDoUltimoEmail(email) } });
    const eu = await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie } });
    expect(eu.json().admin).toBe(true);
    // Sem banco, o painel avisa que precisa dele (passou pela verificação de acesso).
    expect((await app.inject({ method: 'GET', url: '/v1/admin/resumo', headers: { cookie } })).statusCode).toBe(503);
  });

  it('erro interno: resposta genérica para o visitante e registro com a rota', async () => {
    const r = await app.inject({ method: 'GET', url: '/v1/teste-erro' });
    expect(r.statusCode).toBe(500);
    expect(r.json().erro.mensagem).toBe('Erro interno. Tente de novo em instantes.');
    expect(registrados.at(-1)).toMatchObject({ origem: 'api', rota: 'GET /v1/teste-erro' });
  });

  it('erro do site é registrado', async () => {
    const r = await app.inject({ method: 'POST', url: '/v1/erros', payload: { mensagem: 'Tela quebrou', rota: '/consulta/x' } });
    expect(r.statusCode).toBe(204);
    expect(registrados.at(-1)).toMatchObject({ origem: 'site', mensagem: 'Tela quebrou' });
  });

  it('alerta junta os erros do período num e-mail para cada admin', async () => {
    const caixa = new EnviadorMemoria();
    const reg = new RegistroErros(null, caixa, ['admin@exemplo.com'], 'https://aptorural.com.br');
    await reg.registrar({ origem: 'api', mensagem: 'Primeiro' });
    await reg.registrar({ origem: 'coletor', mensagem: 'Segundo' });
    await reg.enviarAgora();
    expect(caixa.enviadas).toHaveLength(1);
    expect(caixa.enviadas[0]!.assunto).toContain('2 erros');
    expect(caixa.enviadas[0]!.texto).toContain('https://aptorural.com.br/admin');
  });
});

describe('consultas', () => {
  const app = criarServidor();

  it('exemplo fictício é grátis e não exige conta', async () => {
    const r = await app.inject({ method: 'POST', url: '/v1/consultas', payload: { car: CARS_DEMO.limpo } });
    expect(r.statusCode).toBe(201);
    expect(r.json().demo).toBe(true);
    expect(r.json()).not.toHaveProperty('usuarioId');
  });

  it('consulta real sem bases carregadas responde 503', async () => {
    const r = await app.inject({ method: 'POST', url: '/v1/consultas', payload: { car: 'MT-5107925-0123456789ABCDEF0123456789ABCDEF' } });
    expect(r.statusCode).toBe(503);
  });
});
