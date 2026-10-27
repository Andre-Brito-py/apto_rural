import { describe, expect, it } from 'vitest';

process.env.APTO_DEMO = '1';
process.env.ADMIN_EMAILS = 'admin@exemplo.com';
process.env.LOG_LEVEL = 'silent';
delete process.env.DATABASE_URL;

const { criarServidor, criarContexto } = await import('../src/servidor.js');
const { EnviadorMemoria } = await import('../src/email/enviador.js');
const { config } = await import('../src/config.js');
const { base32, codigoDoPasso, conferirCodigo, passoAtual } = await import('../src/contas/totp.js');
const { RepositorioContasMemoria } = await import('../src/contas/memoria.js');

type App = ReturnType<typeof criarServidor>;
const SENHA = 'senha-bem-longa';

function montar() {
  const ctx = criarContexto();
  const email = new EnviadorMemoria();
  ctx.email = email;
  const auditoria: string[] = [];
  // Sem banco nos testes: o painel só precisa registrar a auditoria.
  ctx.admin = { auditar: async (_a: string, acao: string) => void auditoria.push(acao) } as never;
  return { app: criarServidor(ctx), ctx, email, auditoria };
}

const cookieDe = (res: { headers: Record<string, unknown> }) => {
  const c = res.headers['set-cookie'];
  return c ? String(Array.isArray(c) ? c[0] : c).split(';')[0]! : '';
};

async function conta(app: App, email: InstanceType<typeof EnviadorMemoria>, endereco: string) {
  const res = await app.inject({ method: 'POST', url: '/v1/conta', payload: { nome: 'Pessoa Teste', email: endereco, senha: SENHA, aceiteTermos: true } });
  const token = decodeURIComponent(/token=([^\s]+)/.exec(email.enviadas.at(-1)!.texto)![1]!);
  await app.inject({ method: 'POST', url: '/v1/conta/confirmar', payload: { token } });
  return cookieDe(res);
}

const entrar = (app: App, email: string, codigo?: string) =>
  app.inject({ method: 'POST', url: '/v1/sessao', payload: { email, senha: SENHA, codigo } });

/** Liga a verificação e devolve o segredo e os códigos de recuperação. */
async function ligar(app: App, cookie: string) {
  const ini = await app.inject({ method: 'POST', url: '/v1/conta/dois-fatores/iniciar', headers: { cookie }, payload: { senha: SENHA } });
  const { segredo } = ini.json();
  const at = await app.inject({
    method: 'POST',
    url: '/v1/conta/dois-fatores/ativar',
    headers: { cookie },
    payload: { codigo: codigoDoPasso(segredo, passoAtual() - 1) },
  });
  return { segredo: segredo as string, codigos: at.json().codigosRecuperacao as string[], ini, at };
}

describe('TOTP (RFC 6238)', () => {
  // Vetores de teste do apêndice B da RFC 6238 (SHA-1, segredo "12345678901234567890"), nos 6 últimos dígitos.
  const segredo = base32(Buffer.from('12345678901234567890'));

  it('gera os códigos da norma', () => {
    expect(segredo).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(codigoDoPasso(segredo, passoAtual(59_000))).toBe('287082');
    expect(codigoDoPasso(segredo, passoAtual(1_111_111_109_000))).toBe('081804');
    expect(codigoDoPasso(segredo, passoAtual(1_234_567_890_000))).toBe('005924');
    expect(codigoDoPasso(segredo, passoAtual(2_000_000_000_000))).toBe('279037');
  });

  it('aceita o intervalo de antes e o de depois (relógio do celular fora), e só isso', () => {
    const t = 1_111_111_109_000;
    const p = passoAtual(t);
    expect(conferirCodigo(segredo, codigoDoPasso(segredo, p - 1), t)).toBe(p - 1);
    expect(conferirCodigo(segredo, codigoDoPasso(segredo, p + 1), t)).toBe(p + 1);
    expect(conferirCodigo(segredo, codigoDoPasso(segredo, p + 2), t)).toBeNull();
    expect(conferirCodigo(segredo, '12345', t)).toBeNull();
  });
});

describe('verificação em duas etapas na conta', () => {
  const { app, email } = montar();
  let cookie = '';
  let segredo = '';
  let codigos: string[] = [];

  it('ligar pede a senha; o primeiro código errado não liga', async () => {
    cookie = await conta(app, email, 'tecnico@exemplo.com');
    const errada = await app.inject({ method: 'POST', url: '/v1/conta/dois-fatores/iniciar', headers: { cookie }, payload: { senha: 'outra-senha-qualquer' } });
    expect(errada.statusCode).toBe(401);
    const ini = await app.inject({ method: 'POST', url: '/v1/conta/dois-fatores/iniciar', headers: { cookie }, payload: { senha: SENHA } });
    expect(ini.json().endereco).toMatch(/^otpauth:\/\/totp\/Apto%20Rural%3Atecnico%40exemplo\.com\?secret=[A-Z2-7]{32}&issuer=Apto%20Rural/);
    const ruim = await app.inject({ method: 'POST', url: '/v1/conta/dois-fatores/ativar', headers: { cookie }, payload: { codigo: '000000' } });
    expect(ruim.statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/v1/conta/dois-fatores', headers: { cookie } })).json().ativo).toBe(false);
  });

  it('com o código certo, liga, mostra 10 códigos de recuperação e derruba as outras sessões', async () => {
    const outroAparelho = cookieDe(await entrar(app, 'tecnico@exemplo.com'));
    const r = await ligar(app, cookie);
    segredo = r.segredo;
    codigos = r.codigos;
    expect(r.at.statusCode).toBe(200);
    expect(codigos).toHaveLength(10);
    expect(codigos[0]).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect((await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie } })).json().usuario.doisFatores).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie: outroAparelho } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/v1/conta/dois-fatores', headers: { cookie } })).json()).toEqual({ ativo: true, codigosRestantes: 10 });
  });

  it('entrar pede o código; código errado conta como tentativa; o mesmo código não vale duas vezes', async () => {
    const sem = await entrar(app, 'tecnico@exemplo.com');
    expect(sem.statusCode).toBe(401);
    expect(sem.json().erro.campo).toBe('codigo');
    expect(cookieDe(sem)).toBe('');
    expect((await entrar(app, 'tecnico@exemplo.com', '111111')).json().erro.mensagem).toMatch(/Código incorreto/);
    const codigo = codigoDoPasso(segredo, passoAtual());
    const ok = await entrar(app, 'tecnico@exemplo.com', codigo);
    expect(ok.statusCode).toBe(200);
    expect(cookieDe(ok)).not.toBe('');
    // Quem viu o código por cima do ombro não entra com ele depois.
    expect((await entrar(app, 'tecnico@exemplo.com', codigo)).statusCode).toBe(401);
  });

  it('código de recuperação entra uma vez só (com ou sem hífen, maiúscula ou minúscula)', async () => {
    const r1 = await entrar(app, 'tecnico@exemplo.com', codigos[0]!.toLowerCase());
    expect(r1.statusCode).toBe(200);
    expect((await entrar(app, 'tecnico@exemplo.com', codigos[0]!)).statusCode).toBe(401);
    expect((await entrar(app, 'tecnico@exemplo.com', codigos[1]!.replace('-', ''))).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/v1/conta/dois-fatores', headers: { cookie } })).json().codigosRestantes).toBe(8);
  });

  it('o link de nova senha por e-mail não basta para entrar: pede a senha nova e o código', async () => {
    await app.inject({ method: 'POST', url: '/v1/senha/esqueci', payload: { email: 'tecnico@exemplo.com' } });
    await new Promise((r) => setTimeout(r, 20));
    const token = decodeURIComponent(/token=([^\s]+)/.exec(email.enviadas.at(-1)!.texto)![1]!);
    const r = await app.inject({ method: 'POST', url: '/v1/senha/redefinir', payload: { token, senha: SENHA } });
    expect(r.json()).toEqual({ ok: true, entrar: true });
    expect(cookieDe(r)).toBe('');
  });

  it('desligar pede a senha e um código', async () => {
    cookie = cookieDe(await entrar(app, 'tecnico@exemplo.com', codigos[2]!));
    const semCodigo = await app.inject({ method: 'POST', url: '/v1/conta/dois-fatores/desativar', headers: { cookie }, payload: { senha: SENHA, codigo: '123456' } });
    expect(semCodigo.statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/v1/conta/dois-fatores/desativar', headers: { cookie }, payload: { senha: SENHA, codigo: codigos[3]! } });
    expect(ok.statusCode).toBe(200);
    expect((await entrar(app, 'tecnico@exemplo.com')).statusCode).toBe(200);
  });
});

describe('painel: login recente, aviso por e-mail e duas etapas em produção', () => {
  const { app, ctx, email, auditoria } = montar();
  let admin = '';

  it('login de administrador manda o aviso de acesso ao painel; o de cliente, não', async () => {
    admin = await conta(app, email, 'admin@exemplo.com');
    await conta(app, email, 'cliente@exemplo.com');
    const antes = email.enviadas.length;
    await entrar(app, 'cliente@exemplo.com');
    admin = cookieDe(await entrar(app, 'admin@exemplo.com'));
    await new Promise((r) => setTimeout(r, 20));
    const novos = email.enviadas.slice(antes);
    expect(novos).toHaveLength(1);
    expect(novos[0]).toMatchObject({ para: 'admin@exemplo.com', assunto: 'Novo acesso ao painel do Apto Rural' });
    expect(novos[0]!.texto).toContain('/esqueci-senha');
  });

  it('depois de 12 horas do login, o painel pede para entrar de novo', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/admin/cupons', headers: { cookie: admin } })).statusCode).toBe(200);
    const eu = (await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie: admin } })).json();
    (ctx.contas as InstanceType<typeof RepositorioContasMemoria>).envelhecerSessoes(eu.usuario.id, 13);
    expect((await app.inject({ method: 'GET', url: '/v1/admin/cupons', headers: { cookie: admin } })).statusCode).toBe(403);
    const depois = (await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie: admin } })).json();
    expect(depois).toMatchObject({ nivelAdmin: null, bloqueioPainel: 'reentrar' });
    // A conta continua funcionando como a de um cliente: só o painel pede login novo.
    expect(depois.usuario.email).toBe('admin@exemplo.com');
    admin = cookieDe(await entrar(app, 'admin@exemplo.com'));
    expect((await app.inject({ method: 'GET', url: '/v1/admin/cupons', headers: { cookie: admin } })).statusCode).toBe(200);
  });

  it('em produção, o painel exige a verificação em duas etapas ligada', async () => {
    const antes = config.producao;
    (config as { producao: boolean }).producao = true;
    try {
      expect((await app.inject({ method: 'GET', url: '/v1/admin/cupons', headers: { cookie: admin } })).statusCode).toBe(403);
      expect((await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie: admin } })).json().bloqueioPainel).toBe('dois_fatores');
      const { segredo } = await ligar(app, admin);
      expect((await app.inject({ method: 'GET', url: '/v1/admin/cupons', headers: { cookie: admin } })).statusCode).toBe(200);
      expect(segredo).toMatch(/^[A-Z2-7]{32}$/);
    } finally {
      (config as { producao: boolean }).producao = antes;
    }
  });

  it('o admin desliga a verificação de quem perdeu o celular (com motivo e auditoria); a pessoa sai de todos os aparelhos', async () => {
    const cliente = await conta(app, email, 'perdeu@exemplo.com');
    await ligar(app, cliente);
    const id = (await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie: cliente } })).json().usuario.id;
    const semMotivo = await app.inject({ method: 'POST', url: `/v1/admin/usuarios/${id}/desativar-dois-fatores`, headers: { cookie: admin }, payload: {} });
    expect(semMotivo.statusCode).toBe(400);
    const r = await app.inject({
      method: 'POST',
      url: `/v1/admin/usuarios/${id}/desativar-dois-fatores`,
      headers: { cookie: admin },
      payload: { motivo: 'Celular roubado, conferido por telefone' },
    });
    expect(r.statusCode).toBe(200);
    expect(auditoria).toContain('desativou_dois_fatores');
    expect((await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie: cliente } })).statusCode).toBe(401);
    expect((await entrar(app, 'perdeu@exemplo.com')).statusCode).toBe(200);
  });
});
