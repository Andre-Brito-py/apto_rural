import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.APTO_DEMO = '1';
process.env.ADMIN_EMAILS = 'admin@exemplo.com';
process.env.LOG_LEVEL = 'silent';
delete process.env.DATABASE_URL;

const { criarServidor, criarContexto } = await import('../src/servidor.js');
const { EnviadorMemoria } = await import('../src/email/enviador.js');
const { VerificadorGoogle } = await import('../src/contas/google.js');
const { codigoDoPasso, passoAtual } = await import('../src/contas/totp.js');

type App = ReturnType<typeof criarServidor>;
const CLIENTE = '123456789012-abcdefghij0123456789.apps.googleusercontent.com';
const SENHA = 'senha-bem-longa';

/** Google falso: chaves de teste servidas como as do Google (JWKS) e tokens assinados com elas. */
const { privateKey, publicKey } = await generateKeyPair('RS256');
const outraChave = (await generateKeyPair('RS256')).privateKey;
const jwk = { ...(await exportJWK(publicKey)), kid: 'teste', alg: 'RS256', use: 'sig' };
const servidorChaves = createServer((_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ keys: [jwk] }));
});
let enderecoChaves = '';
beforeAll(async () => {
  await new Promise<void>((ok) => servidorChaves.listen(0, '127.0.0.1', ok));
  enderecoChaves = `http://127.0.0.1:${(servidorChaves.address() as AddressInfo).port}/certs`;
});
afterAll(() => servidorChaves.close());

interface Dados {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  hd?: string;
  aud?: string;
  iss?: string;
  expira?: string;
  chave?: CryptoKey;
}

function token(d: Dados = {}) {
  const { sub = 'google-1', email = 'maria@gmail.com', email_verified = true, name = 'Maria Produtora', hd, aud = CLIENTE, iss = 'https://accounts.google.com', expira = '1h', chave = privateKey } = d;
  return new SignJWT({ email, email_verified, name, ...(hd ? { hd } : {}) })
    .setProtectedHeader({ alg: 'RS256', kid: 'teste' })
    .setSubject(sub)
    .setAudience(aud)
    .setIssuer(iss)
    .setIssuedAt()
    .setExpirationTime(expira)
    .sign(chave);
}

describe('conferência do ID token (como manda a documentação do Google)', () => {
  const v = () => new VerificadorGoogle(enderecoChaves);

  it('aceita o token certo e diz se o Google responde pelo e-mail', async () => {
    expect(await v().verificar(await token(), CLIENTE)).toMatchObject({ sub: 'google-1', email: 'maria@gmail.com', emailVerificado: true, autoritativo: true });
    // Emissor sem https também vale.
    expect(await v().verificar(await token({ iss: 'accounts.google.com' }), CLIENTE)).not.toBeNull();
    // E-mail de outro provedor, sem Google Workspace: o Google não responde por ele.
    expect((await v().verificar(await token({ email: 'joao@empresa.com.br' }), CLIENTE))!.autoritativo).toBe(false);
    // Google Workspace (hd) com e-mail verificado: responde.
    expect((await v().verificar(await token({ email: 'joao@empresa.com.br', hd: 'empresa.com.br' }), CLIENTE))!.autoritativo).toBe(true);
  });

  it('recusa assinatura falsa, outro cliente, outro emissor e token vencido', async () => {
    expect(await v().verificar(await token({ chave: outraChave }), CLIENTE)).toBeNull();
    expect(await v().verificar(await token({ aud: '999-outro.apps.googleusercontent.com' }), CLIENTE)).toBeNull();
    expect(await v().verificar(await token({ iss: 'https://accounts.google.com.golpe.com' }), CLIENTE)).toBeNull();
    expect(await v().verificar(await token({ expira: '-1m' }), CLIENTE)).toBeNull();
    expect(await v().verificar('isso-nao-e-um-token', CLIENTE)).toBeNull();
  });
});

describe('entrar com a conta Google', () => {
  function montar() {
    const ctx = criarContexto();
    const email = new EnviadorMemoria();
    ctx.email = email;
    ctx.google = new VerificadorGoogle(enderecoChaves);
    return { app: criarServidor(ctx), ctx, email };
  }

  const entrarGoogle = (app: App, payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/v1/sessao/google', payload });
  const ligarGoogle = (ctx: ReturnType<typeof montar>['ctx']) => ctx.config.salvar('google', { clienteId: CLIENTE }, 'admin');
  const cookieDe = (res: { headers: Record<string, unknown> }) => String([res.headers['set-cookie']].flat()[0]).split(';')[0]!;

  async function contaComSenha(app: App, email: InstanceType<typeof EnviadorMemoria>, endereco: string, confirmar = true) {
    const res = await app.inject({ method: 'POST', url: '/v1/conta', payload: { nome: 'Pessoa Com Senha', email: endereco, senha: SENHA, aceiteTermos: true } });
    if (confirmar) {
      const t = decodeURIComponent(/token=([^\s]+)/.exec(email.enviadas.at(-1)!.texto)![1]!);
      await app.inject({ method: 'POST', url: '/v1/conta/confirmar', payload: { token: t } });
    }
    return cookieDe(res);
  }

  it('desligado (sem ID do cliente): o site não mostra o botão e a rota recusa', async () => {
    const { app } = montar();
    expect((await app.inject({ method: 'GET', url: '/v1/saude' })).json().google).toBeNull();
    expect((await entrarGoogle(app, { credencial: await token() })).statusCode).toBe(404);
  });

  it('o painel recusa ID do cliente com formato errado', async () => {
    const { ctx } = montar();
    await expect(ctx.config.salvar('google', { clienteId: 'minha-chave-secreta' }, 'admin')).rejects.toThrow(/googleusercontent/);
  });

  it('e-mail novo: pede o aceite dos termos, cria a conta confirmada, sem senha, e com a amostra grátis', async () => {
    const { app, ctx } = montar();
    await ligarGoogle(ctx);
    expect((await app.inject({ method: 'GET', url: '/v1/saude' })).json().google).toBe(CLIENTE);
    const credencial = await token({ sub: 'novo-1', email: 'nova@gmail.com', name: 'Nova Técnica' });

    const semAceite = await entrarGoogle(app, { credencial });
    expect(semAceite.statusCode).toBe(409);
    expect(semAceite.json().erro).toMatchObject({ campo: 'aceiteTermos', mensagem: expect.stringMatching(/nova@gmail\.com/) });

    const r = await entrarGoogle(app, { credencial, aceiteTermos: true });
    expect(r.statusCode).toBe(200);
    expect(r.json().usuario).toMatchObject({ nome: 'Nova Técnica', email: 'nova@gmail.com', emailConfirmado: true, temSenha: false, comGoogle: true });
    expect(r.json().saldo.consulta).toBe(1);
    const eu = await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie: cookieDe(r) } });
    expect(eu.json().usuario.email).toBe('nova@gmail.com');

    // Na próxima vez, entra direto (sem aceite de novo).
    expect((await entrarGoogle(app, { credencial: await token({ sub: 'novo-1', email: 'nova@gmail.com' }) })).statusCode).toBe(200);
    // Sem senha, o login por senha não entra.
    expect((await app.inject({ method: 'POST', url: '/v1/sessao', payload: { email: 'nova@gmail.com', senha: 'qualquer-coisa-123' } })).statusCode).toBe(401);
  });

  it('conta com senha e @gmail.com: o Google responde pelo e-mail e liga direto; a senha continua valendo', async () => {
    const { app, ctx, email } = montar();
    await ligarGoogle(ctx);
    await contaComSenha(app, email, 'ana@gmail.com');
    const r = await entrarGoogle(app, { credencial: await token({ sub: 'ana-sub', email: 'ana@gmail.com' }) });
    expect(r.statusCode).toBe(200);
    expect(r.json().usuario).toMatchObject({ email: 'ana@gmail.com', temSenha: true, comGoogle: true });
    expect((await app.inject({ method: 'POST', url: '/v1/sessao', payload: { email: 'ana@gmail.com', senha: SENHA } })).statusCode).toBe(200);
  });

  it('conta com senha e e-mail de outro provedor: pede a senha da conta antes de ligar', async () => {
    const { app, ctx, email } = montar();
    await ligarGoogle(ctx);
    await contaComSenha(app, email, 'joao@empresa.com.br');
    const credencial = await token({ sub: 'joao-sub', email: 'joao@empresa.com.br' });

    const pede = await entrarGoogle(app, { credencial });
    expect(pede.statusCode).toBe(409);
    expect(pede.json().erro.campo).toBe('senha');
    const errada = await entrarGoogle(app, { credencial, senha: 'senha-errada-123' });
    expect(errada.statusCode).toBe(401);
    expect(errada.json().erro.campo).toBe('senha');
    expect(await ctx.contas.buscarPorGoogle('joao-sub')).toBeNull();

    const certa = await entrarGoogle(app, { credencial, senha: SENHA });
    expect(certa.statusCode).toBe(200);
    expect(certa.json().usuario).toMatchObject({ email: 'joao@empresa.com.br', comGoogle: true });
    // Ligada: da próxima vez não pede a senha.
    expect((await entrarGoogle(app, { credencial })).statusCode).toBe(200);
  });

  it('a conta ainda não confirmada fica confirmada pelo Google e ganha a amostra grátis', async () => {
    const { app, ctx, email } = montar();
    await ligarGoogle(ctx);
    await contaComSenha(app, email, 'semconfirmar@gmail.com', false);
    const r = await entrarGoogle(app, { credencial: await token({ sub: 'sc', email: 'semconfirmar@gmail.com' }) });
    expect(r.json().usuario.emailConfirmado).toBe(true);
    expect(r.json().saldo.consulta).toBe(1);
  });

  it('e-mail não verificado pelo Google e conta Google já ligada a outra conta: recusa', async () => {
    const { app, ctx, email } = montar();
    await ligarGoogle(ctx);
    expect((await entrarGoogle(app, { credencial: await token({ email_verified: false }), aceiteTermos: true })).statusCode).toBe(403);

    await contaComSenha(app, email, 'primeira@gmail.com');
    await contaComSenha(app, email, 'segunda@gmail.com');
    expect((await entrarGoogle(app, { credencial: await token({ sub: 'repetido', email: 'primeira@gmail.com' }) })).statusCode).toBe(200);
    // Mesmo "sub" com o e-mail trocado no Google: entra na conta já ligada, não liga outra.
    const r = await entrarGoogle(app, { credencial: await token({ sub: 'repetido', email: 'segunda@gmail.com' }) });
    expect(r.json().usuario.email).toBe('primeira@gmail.com');
  });

  it('quem tem a verificação em duas etapas digita o código também pelo Google', async () => {
    const { app, ctx, email } = montar();
    await ligarGoogle(ctx);
    const cookie = await contaComSenha(app, email, 'duas@gmail.com');
    const ini = (await app.inject({ method: 'POST', url: '/v1/conta/dois-fatores/iniciar', headers: { cookie }, payload: { senha: SENHA } })).json();
    await app.inject({ method: 'POST', url: '/v1/conta/dois-fatores/ativar', headers: { cookie }, payload: { codigo: codigoDoPasso(ini.segredo, passoAtual() - 1) } });

    const credencial = await token({ sub: 'duas-sub', email: 'duas@gmail.com' });
    const pede = await entrarGoogle(app, { credencial });
    expect(pede.statusCode).toBe(401);
    expect(pede.json().erro.campo).toBe('codigo');
    expect(pede.headers['set-cookie']).toBeUndefined();
    const r = await entrarGoogle(app, { credencial, codigo: codigoDoPasso(ini.segredo, passoAtual()) });
    expect(r.statusCode).toBe(200);
  });

  it('conta bloqueada não entra pelo Google', async () => {
    const { app, ctx, email } = montar();
    await ligarGoogle(ctx);
    await contaComSenha(app, email, 'bloqueada@gmail.com');
    const u = await ctx.contas.buscarPorEmail('bloqueada@gmail.com');
    // Sem banco, não há o bloqueio do painel: marca direto na memória.
    (ctx.contas as unknown as { usuarios: Map<string, { bloqueado: boolean }> }).usuarios.get(u!.id)!.bloqueado = true;
    expect((await entrarGoogle(app, { credencial: await token({ sub: 'b', email: 'bloqueada@gmail.com' }) })).statusCode).toBe(403);
  });
});
