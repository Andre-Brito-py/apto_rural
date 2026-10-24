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

  it('login ignora espaços nas pontas da senha (copiar e colar); cadastro não aceita senha com espaço nas pontas', async () => {
    const r = await app.inject({ method: 'POST', url: '/v1/sessao', payload: { email: ' TECNICO@exemplo.com ', senha: '  senha-bem-longa \n' } });
    expect(r.statusCode).toBe(200);
    const comEspaco = await app.inject({
      method: 'POST',
      url: '/v1/conta',
      payload: { nome: 'Com Espaço', email: 'espaco@exemplo.com', senha: 'senha-bem-longa ', aceiteTermos: true },
    });
    expect(comEspaco.statusCode).toBe(400);
    expect(comEspaco.json().erro.mensagem).toMatch(/espaço/);
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
    const pedido = await app.inject({ method: 'POST', url: '/v1/pedidos', headers: { cookie }, payload: { produto: 'dossie-avulso' } });
    expect(pedido.statusCode).toBe(201);
    const { id } = pedido.json();
    let eu = await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie } });
    expect(eu.json().saldo).toEqual({ consulta: 0, dossie: 0 });

    await app.inject({ method: 'POST', url: `/v1/dev/pedidos/${id}/pagar`, headers: { cookie } });
    await app.inject({ method: 'POST', url: `/v1/dev/pedidos/${id}/pagar`, headers: { cookie } });
    eu = await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie } });
    expect(eu.json().saldo).toEqual({ consulta: 0, dossie: 1 });
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
    expect(eu.json().nivelAdmin).toBe('admin');
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

  it('enviarAgora espera o envio que o temporizador já começou (o processo não sai antes)', async () => {
    // Achado no ensaio de produção: na reconferência rodada uma vez, o temporizador disparava o
    // envio, o processo saía no meio e o e-mail de alerta se perdia.
    const enviadas: string[] = [];
    const lenta = { enviar: async (m: { assunto: string }) => void (await new Promise((r) => setTimeout(r, 50)), enviadas.push(m.assunto)) };
    const reg = new RegistroErros(null, lenta as never, ['admin@exemplo.com'], 'https://aptorural.com.br');
    reg.avisar({ origem: 'coletor', mensagem: 'Coletor funai_ti falhou' });
    await new Promise((r) => setTimeout(r, 5)); // o temporizador dispara e o envio começa
    await reg.enviarAgora();
    expect(enviadas).toEqual(['[Apto Rural] 1 erro: Coletor funai_ti falhou']);
  });
});

describe('configurações editáveis', () => {
  const { app, ctx } = servidorComEmail();

  it('recusa configuração inválida com mensagem clara', async () => {
    await expect(ctx.config.salvar('produtos', [], 'admin')).rejects.toThrow();
    const semAtivo = (await ctx.config.obter()).produtos.map((p) => ({ ...p, ativo: false }));
    await expect(ctx.config.salvar('produtos', semAtivo, 'admin')).rejects.toThrow('pelo menos um pacote ativo');
    await expect(ctx.config.salvar('limite_carteira', -1, 'admin')).rejects.toThrow();
  });

  it('preço novo aparece na página de preços; pacote inativo some', async () => {
    const produtos = (await ctx.config.obter()).produtos.map((p) =>
      p.id === 'consulta-avulsa' ? { ...p, valor: 49.9 } : p.id === 'dossie-avulso' ? { ...p, ativo: false } : p,
    );
    await ctx.config.salvar('produtos', produtos, 'admin');
    const lista = (await app.inject({ method: 'GET', url: '/v1/produtos' })).json().produtos;
    expect(lista.find((p: { id: string }) => p.id === 'consulta-avulsa').valor).toBe(49.9);
    expect(lista.some((p: { id: string }) => p.id === 'dossie-avulso')).toBe(false);
  });

  it('créditos ficam fixados no pedido: mudar o pacote depois não muda a compra', async () => {
    const { cookie } = await novaConta(app, 'fixado@exemplo.com');
    const pedido = (await app.inject({ method: 'POST', url: '/v1/pedidos', headers: { cookie }, payload: { produto: 'consulta-avulsa' } })).json();
    const outros = (await ctx.config.obter()).produtos.map((p) =>
      p.id === 'consulta-avulsa' ? { ...p, creditos: { consulta: 999, dossie: 99 } } : p,
    );
    await ctx.config.salvar('produtos', outros, 'admin');
    await app.inject({ method: 'POST', url: `/v1/dev/pedidos/${pedido.id}/pagar`, headers: { cookie } });
    const saldo = (await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie } })).json().saldo;
    expect(saldo).toEqual({ consulta: 1, dossie: 0 });
  });

  it('aviso do site aparece na rota de saúde só quando ativo', async () => {
    await ctx.config.salvar('aviso_site', { ativo: true, texto: 'Manutenção às 22h', tipo: 'alerta' }, 'admin');
    expect((await app.inject({ method: 'GET', url: '/v1/saude' })).json().aviso).toEqual({ texto: 'Manutenção às 22h', tipo: 'alerta' });
    await ctx.config.salvar('aviso_site', { ativo: false, texto: 'Manutenção às 22h', tipo: 'alerta' }, 'admin');
    expect((await app.inject({ method: 'GET', url: '/v1/saude' })).json().aviso).toBeNull();
  });
});

describe('assinatura mensal (pagamento simulado)', () => {
  const { app } = servidorComEmail();
  let cookie = '';
  let assinaturaId = '';
  const saldo = async () => (await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie } })).json().saldo;
  const atual = async () => (await app.inject({ method: 'GET', url: '/v1/assinatura', headers: { cookie } })).json();

  beforeAll(async () => {
    cookie = (await novaConta(app, 'assinante@exemplo.com')).cookie;
  });

  it('lista os planos ativos', async () => {
    const planos = (await app.inject({ method: 'GET', url: '/v1/planos' })).json().planos;
    expect(planos.map((p: { id: string }) => p.id)).toEqual(['plano-projetista', 'plano-escritorio']);
  });

  it('assinar cria a assinatura pendente; sem pagar, nada de créditos nem carteira maior', async () => {
    const r = await app.inject({ method: 'POST', url: '/v1/assinaturas', headers: { cookie }, payload: { plano: 'plano-projetista' } });
    expect(r.statusCode).toBe(201);
    assinaturaId = r.json().id;
    expect(r.json().link).toContain('/pagamento-simulado/assinatura/');
    const a = await atual();
    expect(a.assinatura.status).toBe('pendente');
    expect(a.limiteCarteira).toBe(5);
    expect(await saldo()).toEqual({ consulta: 0, dossie: 0 });
  });

  it('cada mensalidade paga credita o mês, os créditos acumulam e a carteira vai para 50', async () => {
    await app.inject({ method: 'POST', url: `/v1/dev/assinaturas/${assinaturaId}/pagar-mes`, headers: { cookie } });
    expect(await saldo()).toEqual({ consulta: 20, dossie: 2 });
    const a = await atual();
    expect(a.assinatura.status).toBe('ativa');
    expect(a.limiteCarteira).toBe(50);
    await app.inject({ method: 'POST', url: `/v1/dev/assinaturas/${assinaturaId}/pagar-mes`, headers: { cookie } });
    expect(await saldo()).toEqual({ consulta: 40, dossie: 4 });
  });

  it('não deixa ter duas assinaturas ao mesmo tempo', async () => {
    const r = await app.inject({ method: 'POST', url: '/v1/assinaturas', headers: { cookie }, payload: { plano: 'plano-escritorio' } });
    expect(r.statusCode).toBe(409);
  });

  it('cancelar encerra a recorrência e mantém os créditos já recebidos', async () => {
    expect((await app.inject({ method: 'POST', url: '/v1/assinatura/cancelar', headers: { cookie } })).statusCode).toBe(200);
    const a = await atual();
    expect(a.assinatura).toBeNull();
    expect(a.limiteCarteira).toBe(5);
    expect(await saldo()).toEqual({ consulta: 40, dossie: 4 });
    // Depois de cancelar, pode assinar de novo.
    const r = await app.inject({ method: 'POST', url: '/v1/assinaturas', headers: { cookie }, payload: { plano: 'plano-escritorio' } });
    expect(r.statusCode).toBe(201);
  });
});

describe('webhook de mensalidade do Asaas', () => {
  const ctx = criarContexto();
  ctx.pagamento = new ProvedorAsaas('chave-de-teste', 'sandbox', TOKEN_WEBHOOK);
  const app = criarServidor(ctx);
  let usuarioId = '';
  let assinaturaId = '';

  beforeAll(async () => {
    const { cookie } = await novaConta(app, 'mensalista@exemplo.com');
    usuarioId = (await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie } })).json().usuario.id;
    const a = await ctx.contas.criarAssinatura({
      usuarioId,
      planoId: 'plano-projetista',
      nomePlano: 'Projetista',
      valorMensal: 199,
      creditos: { consulta: 20, dossie: 2 },
      limiteCarteira: 50,
      provedor: 'asaas',
    });
    if (a === 'ja_existe') throw new Error('inesperado');
    assinaturaId = a.id;
    await ctx.contas.atualizarAssinatura(a.id, { provedorId: 'sub_1' });
  });

  const enviar = (evento: string, id: string, pagamento: string) =>
    app.inject({
      method: 'POST',
      url: '/v1/webhooks/asaas',
      headers: { 'asaas-access-token': TOKEN_WEBHOOK },
      payload: { id, event: evento, payment: { id: pagamento, subscription: 'sub_1', externalReference: assinaturaId, value: 199 } },
    });

  it('mensalidade paga credita uma vez, mesmo com CONFIRMED e RECEIVED da mesma cobrança', async () => {
    await enviar('PAYMENT_CONFIRMED', 'evt_m1', 'pay_m1');
    await enviar('PAYMENT_RECEIVED', 'evt_m2', 'pay_m1');
    await enviar('PAYMENT_RECEIVED', 'evt_m2', 'pay_m1');
    expect(await ctx.contas.saldo(usuarioId)).toEqual({ consulta: 20, dossie: 2 });
    expect((await ctx.contas.buscarAssinatura(assinaturaId))!.status).toBe('ativa');
  });

  it('mensalidade atrasada deixa inadimplente; pagar reativa', async () => {
    await enviar('PAYMENT_OVERDUE', 'evt_m3', 'pay_m2');
    expect((await ctx.contas.buscarAssinatura(assinaturaId))!.status).toBe('inadimplente');
    await enviar('PAYMENT_RECEIVED', 'evt_m4', 'pay_m2');
    expect((await ctx.contas.buscarAssinatura(assinaturaId))!.status).toBe('ativa');
    expect(await ctx.contas.saldo(usuarioId)).toEqual({ consulta: 40, dossie: 4 });
  });

  it('estorno da mensalidade retira os créditos daquele mês', async () => {
    await enviar('PAYMENT_REFUNDED', 'evt_m5', 'pay_m2');
    expect(await ctx.contas.saldo(usuarioId)).toEqual({ consulta: 20, dossie: 2 });
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

/** Quadrado com `n` vértices no contorno, perto de Cuiabá. */
function poligono(n: number, deslocar = 0) {
  const anel = Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    return [-56.1 + 0.01 * Math.cos(t) + deslocar, -15.6 + 0.01 * Math.sin(t)];
  });
  anel.push(anel[0]!);
  return { type: 'Polygon', coordinates: [anel] };
}

describe('segurança', () => {
  it('senha errada demais no mesmo e-mail trava o login, mesmo trocando de IP', async () => {
    const { app } = servidorComEmail();
    await novaConta(app, 'alvo@exemplo.com');
    for (let i = 0; i < 8; i++) {
      const r = await app.inject({ method: 'POST', url: '/v1/sessao', remoteAddress: `10.0.0.${i}`, payload: { email: 'alvo@exemplo.com', senha: 'chute-errado' } });
      expect(r.statusCode).toBe(401);
    }
    const certa = await app.inject({ method: 'POST', url: '/v1/sessao', remoteAddress: '10.0.1.1', payload: { email: 'ALVO@exemplo.com', senha: 'senha-bem-longa' } });
    expect(certa.statusCode).toBe(429);
    // Outro e-mail segue normal.
    const outro = await app.inject({ method: 'POST', url: '/v1/sessao', remoteAddress: '10.0.1.1', payload: { email: 'outro@exemplo.com', senha: 'chute-errado' } });
    expect(outro.statusCode).toBe(401);
  });

  it('o freio por e-mail some depois da janela de 15 minutos', async () => {
    const { TentativasLogin } = await import('../src/contas/tentativas.js');
    let agora = 0;
    const t = new TentativasLogin(() => agora);
    for (let i = 0; i < 8; i++) t.falhou('a@b.com');
    expect(t.bloqueado('A@B.com')).toBe(true);
    agora += 16 * 60 * 1000;
    expect(t.bloqueado('a@b.com')).toBe(false);
  });

  it('recusa coordenadas fora do planeta e contornos com pontos demais', async () => {
    const app = criarServidor();
    const fora = await app.inject({
      method: 'POST',
      url: '/v1/consultas',
      payload: { car: CARS_DEMO.limpo, geometria: { type: 'Polygon', coordinates: [[[0, 0], [500, 0], [0, 1], [0, 0]]] } },
    });
    expect(fora.statusCode).toBe(400);
    const enorme = await app.inject({ method: 'POST', url: '/v1/consultas', payload: { car: CARS_DEMO.limpo, geometria: poligono(100_001) } });
    expect(enorme.statusCode).toBe(400);
  });

  it('lista enorme de pontos inválidos é recusada rápido, sem esgotar a memória (GHSA-mrhx-c7xc-m3w5)', async () => {
    const app = criarServidor();
    const lixo = Array.from({ length: 600_000 }, () => 'x');
    const corpo = JSON.stringify({ car: CARS_DEMO.limpo, geometria: { type: 'Polygon', coordinates: [lixo] } });
    const antes = process.memoryUsage().heapUsed;
    const inicio = Date.now();
    const r = await app.inject({ method: 'POST', url: '/v1/consultas', headers: { 'content-type': 'application/json' }, payload: corpo });
    expect(r.statusCode).toBe(400);
    expect(Date.now() - inicio).toBeLessThan(5000);
    expect(process.memoryUsage().heapUsed - antes).toBeLessThan(300 * 1024 * 1024);
  });

  it('aceita contorno de fazenda grande (mais de 1 MB)', async () => {
    const app = criarServidor();
    const corpo = JSON.stringify({ car: CARS_DEMO.limpo, geometria: poligono(60_000) });
    expect(corpo.length).toBeGreaterThan(1024 * 1024);
    const r = await app.inject({ method: 'POST', url: '/v1/consultas', headers: { 'content-type': 'application/json' }, payload: corpo });
    expect(r.statusCode).not.toBe(413);
  });

  it('erro interno não vaza detalhes para quem chamou', async () => {
    const app = criarServidor();
    app.get('/v1/teste-falha', async () => {
      throw new Error('senha do banco: segredo');
    });
    const r = await app.inject({ method: 'GET', url: '/v1/teste-falha' });
    expect(r.statusCode).toBe(500);
    expect(r.body).not.toContain('segredo');
  });
});

describe('direitos do titular (LGPD)', () => {
  const { app, email } = servidorComEmail();
  const EMAIL = 'titular@exemplo.com';
  let cookie = '';

  beforeAll(async () => {
    cookie = (await novaConta(app, EMAIL)).cookie;
    await app.inject({ method: 'POST', url: '/v1/conta/confirmar', payload: { token: tokenDoUltimoEmail(email) } });
  });

  it('baixar os dados exige conta e entrega um arquivo sem a senha', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/conta/dados' })).statusCode).toBe(401);
    const r = await app.inject({ method: 'GET', url: '/v1/conta/dados', headers: { cookie } });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-disposition']).toMatch(/attachment; filename="apto-rural-meus-dados-\d{4}-\d{2}-\d{2}\.json"/);
    const dados = r.json();
    expect(dados.conta.email).toBe(EMAIL);
    expect(dados.creditos).toEqual([expect.objectContaining({ motivo: 'Amostra grátis', quantidade: 1 })]);
    expect(r.body).not.toMatch(/scrypt|senha_?hash/i);
  });

  it('excluir pede a senha e a confirmação', async () => {
    const semMarcar = await app.inject({ method: 'POST', url: '/v1/conta/excluir', headers: { cookie }, payload: { senha: 'senha-bem-longa' } });
    expect(semMarcar.statusCode).toBe(400);
    const senhaErrada = await app.inject({ method: 'POST', url: '/v1/conta/excluir', headers: { cookie }, payload: { senha: 'outra-senha', confirmo: true } });
    expect(senhaErrada.statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie } })).statusCode).toBe(200);
  });

  it('excluir cancela a assinatura, apaga os dados pessoais, encerra a sessão e manda o comprovante', async () => {
    const a = await app.inject({ method: 'POST', url: '/v1/assinaturas', headers: { cookie }, payload: { plano: 'plano-projetista' } });
    expect(a.statusCode).toBe(201);

    const r = await app.inject({ method: 'POST', url: '/v1/conta/excluir', headers: { cookie }, payload: { senha: 'senha-bem-longa', confirmo: true } });
    expect(r.statusCode).toBe(200);
    expect(String(r.headers['set-cookie'])).toMatch(/apto_sessao=;/);
    await new Promise((ok) => setTimeout(ok, 10));
    expect(email.enviadas.at(-1)).toMatchObject({ para: EMAIL, assunto: 'Sua conta no Apto Rural foi excluída' });

    // A sessão antiga não vale mais, e o e-mail e a senha antigos não entram.
    expect((await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie } })).statusCode).toBe(401);
    const login = await app.inject({ method: 'POST', url: '/v1/sessao', payload: { email: EMAIL, senha: 'senha-bem-longa' } });
    expect(login.statusCode).toBe(401);
  });

  it('o e-mail fica livre para uma conta nova, mas sem a amostra grátis de novo', async () => {
    const { res, cookie: novo } = await novaConta(app, EMAIL);
    expect(res.statusCode).toBe(201);
    await app.inject({ method: 'POST', url: '/v1/conta/confirmar', payload: { token: tokenDoUltimoEmail(email) } });
    const eu = (await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie: novo } })).json();
    expect(eu.usuario.emailConfirmado).toBe(true);
    expect(eu.saldo).toEqual({ consulta: 0, dossie: 0 });
  });
});
