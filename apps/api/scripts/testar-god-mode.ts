/**
 * FERRAMENTA DE TESTE — god mode de ponta a ponta, com o banco real.
 * Cria um admin e um cliente de teste, exercita ficha, "entrar como" (só
 * leitura), bloqueio, papéis e auditoria, e apaga tudo no fim.
 *
 * Uso:  npx tsx --env-file=../../.env scripts/testar-god-mode.ts
 */
import assert from 'node:assert/strict';
import pg from 'pg';

const sufixo = Date.now();
const EMAIL_ADMIN = `admin-${sufixo}@exemplo.com`;
process.env.ADMIN_EMAILS = EMAIL_ADMIN;
process.env.LOG_LEVEL = 'silent';

const { criarContexto, criarServidor } = await import('../src/servidor.js');
const { EnviadorMemoria } = await import('../src/email/enviador.js');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const ctx = criarContexto();
ctx.email = new EnviadorMemoria();
const app = criarServidor(ctx);
const ids: string[] = [];
const cookieDe = (r: { headers: Record<string, unknown> }) => String(r.headers['set-cookie']).split(';')[0]!;

async function conta(email: string) {
  const r = await app.inject({ method: 'POST', url: '/v1/conta', payload: { nome: 'Teste God Mode', email, senha: 'senha-teste-god-mode', aceiteTermos: true } });
  const id = r.json().usuario.id as string;
  ids.push(id);
  await pool.query('UPDATE usuario SET email_confirmado_em = now() WHERE id = $1', [id]);
  return { id, cookie: cookieDe(r) };
}

async function main() {
  const admin = await conta(EMAIL_ADMIN);
  const cliente = await conta(`cliente-${sufixo}@exemplo.com`);
  await pool.query(`INSERT INTO credito_lancamento (usuario_id, tipo, quantidade, motivo, referencia) VALUES ($1,'consulta',5,'teste',$2)`, [
    cliente.id,
    `teste-god:${cliente.id}`,
  ]);
  let adm = admin.cookie;

  // Ficha do cliente.
  const ficha = await app.inject({ method: 'GET', url: `/v1/admin/usuarios/${cliente.id}`, headers: { cookie: adm } });
  assert.equal(ficha.statusCode, 200);
  assert.equal(ficha.json().saldo.consulta, 5);
  console.log('✓ ficha do cliente com saldo');

  // Entrar como: vê a conta do cliente, mas não pode alterar nada.
  const entrar = await app.inject({ method: 'POST', url: `/v1/admin/usuarios/${cliente.id}/entrar-como`, headers: { cookie: adm } });
  assert.equal(entrar.statusCode, 200);
  const comoCliente = cookieDe(entrar);
  const eu = (await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie: comoCliente } })).json();
  assert.equal(eu.usuario.id, cliente.id);
  assert.equal(eu.personificadoPor.email, EMAIL_ADMIN);
  assert.equal(eu.nivelAdmin, null, 'no modo entrar como não há poder de admin');
  const tentativa = await app.inject({ method: 'POST', url: '/v1/pedidos', headers: { cookie: comoCliente }, payload: { produto: 'consulta-avulsa' } });
  assert.equal(tentativa.statusCode, 403);
  const painel = await app.inject({ method: 'GET', url: '/v1/admin/resumo', headers: { cookie: comoCliente } });
  assert.equal(painel.statusCode, 403);
  console.log('✓ entrar como: vê a conta, não compra nem acessa o painel');

  const voltar = await app.inject({ method: 'POST', url: '/v1/admin/voltar', headers: { cookie: comoCliente } });
  assert.equal(voltar.statusCode, 200);
  adm = cookieDe(voltar);
  assert.equal((await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie: adm } })).json().nivelAdmin, 'admin');
  assert.equal((await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie: comoCliente } })).statusCode, 401);
  console.log('✓ voltar: sessão de visualização encerrada, admin de volta');

  // Bloqueio derruba a sessão e impede o login.
  const bloq = await app.inject({ method: 'POST', url: `/v1/admin/usuarios/${cliente.id}/bloquear`, headers: { cookie: adm }, payload: { motivo: 'Teste de bloqueio' } });
  assert.equal(bloq.statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/v1/eu', headers: { cookie: cliente.cookie } })).statusCode, 401);
  const login = await app.inject({ method: 'POST', url: '/v1/sessao', payload: { email: `cliente-${sufixo}@exemplo.com`, senha: 'senha-teste-god-mode' } });
  assert.equal(login.statusCode, 403);
  await app.inject({ method: 'POST', url: `/v1/admin/usuarios/${cliente.id}/desbloquear`, headers: { cookie: adm } });
  const login2 = await app.inject({ method: 'POST', url: '/v1/sessao', payload: { email: `cliente-${sufixo}@exemplo.com`, senha: 'senha-teste-god-mode' } });
  assert.equal(login2.statusCode, 200);
  console.log('✓ bloquear derruba a sessão e impede o login; desbloquear libera');

  // Papel suporte: vê o painel, não altera.
  await app.inject({ method: 'POST', url: `/v1/admin/usuarios/${cliente.id}/papel`, headers: { cookie: adm }, payload: { papel: 'suporte' } });
  const suporte = cookieDe(login2);
  assert.equal((await app.inject({ method: 'GET', url: '/v1/admin/resumo', headers: { cookie: suporte } })).statusCode, 200);
  const ajuste = await app.inject({
    method: 'POST',
    url: `/v1/admin/usuarios/${admin.id}/creditos`,
    headers: { cookie: suporte },
    payload: { tipo: 'consulta', quantidade: 10, motivo: 'tentativa do suporte' },
  });
  assert.equal(ajuste.statusCode, 403);
  console.log('✓ suporte vê o painel e não ajusta créditos');

  // Admin não muda o próprio papel nem se bloqueia.
  assert.equal((await app.inject({ method: 'POST', url: `/v1/admin/usuarios/${admin.id}/papel`, headers: { cookie: adm }, payload: { papel: 'usuario' } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: `/v1/admin/usuarios/${admin.id}/bloquear`, headers: { cookie: adm }, payload: { motivo: 'teste' } })).statusCode, 400);

  // Auditoria registrou tudo.
  const acoes = (await app.inject({ method: 'GET', url: '/v1/admin/auditoria', headers: { cookie: adm } }))
    .json()
    .auditoria.filter((a: { alvoId?: string }) => a.alvoId === cliente.id)
    .map((a: { acao: string }) => a.acao);
  for (const a of ['entrou_como', 'saiu_do_modo_entrar_como', 'bloqueou', 'desbloqueou', 'mudou_papel']) assert.ok(acoes.includes(a), `faltou ${a}`);
  console.log('✓ auditoria:', acoes.reverse().join(' → '));
}

main()
  .then(() => console.log('\nGod mode: tudo certo.'))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const id of ids) {
      await pool.query('DELETE FROM auditoria_admin WHERE admin_id = $1 OR alvo_usuario_id = $1', [id]);
      await pool.query('DELETE FROM credito_lancamento WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM usuario WHERE id = $1', [id]);
    }
    await pool.end();
    process.exit();
  });
