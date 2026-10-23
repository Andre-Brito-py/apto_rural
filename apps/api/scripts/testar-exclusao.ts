/**
 * FERRAMENTA DE TESTE — direitos do titular (LGPD) de ponta a ponta, com o banco real.
 *
 * Cria uma conta com consulta de fazenda real, carteira, assinatura paga
 * (pagamento simulado) e um técnico de suporte; confere o arquivo "baixar meus
 * dados", que o suporte não consegue baixá-lo no modo "entrar como", e o que a
 * exclusão apaga e o que ela guarda. Apaga tudo o que criou ao terminar.
 *
 * Uso:  npx tsx --env-file=../../.env scripts/testar-exclusao.ts
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { hashEmail } from '../src/documento.js';
import { EnviadorMemoria } from '../src/email/enviador.js';
import { criarContexto, criarServidor } from '../src/servidor.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const ctx = criarContexto();
const email = new EnviadorMemoria();
ctx.email = email;
const app = criarServidor(ctx);
const marca = Date.now();
const EMAIL_TITULAR = `titular-${marca}@exemplo.com`;
const criados: string[] = [];
const consultasCriadas: string[] = [];

const cookieDe = (r: { headers: Record<string, unknown> }) => String(r.headers['set-cookie']).split(';')[0]!;

async function conta(nome: string, emailConta: string) {
  const r = await app.inject({ method: 'POST', url: '/v1/conta', payload: { nome, email: emailConta, senha: 'senha-do-teste-123', aceiteTermos: true } });
  assert.equal(r.statusCode, 201, r.body);
  const id = r.json().usuario.id as string;
  criados.push(id);
  await pool.query('UPDATE usuario SET email_confirmado_em = now() WHERE id = $1', [id]);
  return { id, cookie: cookieDe(r) };
}

async function main() {
  if (ctx.pagamento?.nome !== 'simulado') throw new Error('Rode com APTO_DEMO=1 e sem ASAAS_API_KEY (pagamento simulado).');
  const titular = await conta('Maria Titular', EMAIL_TITULAR);
  await pool.query(`INSERT INTO credito_lancamento (usuario_id, tipo, quantidade, motivo, referencia) VALUES ($1,'consulta',3,'teste',$2)`, [
    titular.id,
    `teste-exclusao:${titular.id}`,
  ]);
  const cookie = titular.cookie;

  // Consulta de uma fazenda real e carteira.
  const { rows: fazendas } = await pool.query(`SELECT cod_car, geojson FROM teste_imovel_mma WHERE status_car = 'AT' ORDER BY md5(cod_car) LIMIT 1`);
  const c = await app.inject({ method: 'POST', url: '/v1/consultas', headers: { cookie }, payload: { car: fazendas[0].cod_car, geometria: fazendas[0].geojson } });
  assert.equal(c.statusCode, 201, c.body);
  const consultaId = c.json().id as string;
  consultasCriadas.push(consultaId);
  const cart = await app.inject({ method: 'POST', url: '/v1/carteira', headers: { cookie }, payload: { consultaId, apelido: 'Fazenda Teste' } });
  assert.equal(cart.statusCode, 201, cart.body);

  // Assinatura com uma mensalidade paga.
  const a = await app.inject({ method: 'POST', url: '/v1/assinaturas', headers: { cookie }, payload: { plano: 'plano-projetista' } });
  assert.equal(a.statusCode, 201, a.body);
  await app.inject({ method: 'POST', url: `/v1/dev/assinaturas/${a.json().id}/pagar-mes`, headers: { cookie } });
  console.log('✓ conta com consulta real, carteira e assinatura paga');

  // 1) Baixar meus dados.
  const d = await app.inject({ method: 'GET', url: '/v1/conta/dados', headers: { cookie } });
  assert.equal(d.statusCode, 200);
  const dados = d.json();
  assert.equal(dados.conta.email, EMAIL_TITULAR);
  assert.equal(dados.consultas.length, 1);
  assert.equal(dados.carteira[0].apelido, 'Fazenda Teste');
  assert.equal(dados.assinaturas[0].status, 'ativa');
  assert.ok(dados.pedidos.length >= 1);
  assert.doesNotMatch(d.body, /scrypt|senha_hash|token_hash/);
  console.log(`✓ arquivo de dados: conta, ${dados.consultas.length} consulta, carteira, assinatura, ${dados.pedidos.length} pedido(s), sem senha`);

  // 2) O suporte, no modo "entrar como", não baixa os dados de ninguém nem exclui a conta.
  const suporte = await conta('Suporte Teste', `suporte-${marca}@exemplo.com`);
  await pool.query(`UPDATE usuario SET papel = 'suporte' WHERE id = $1`, [suporte.id]);
  const comoCliente = cookieDe(await app.inject({ method: 'POST', url: `/v1/admin/usuarios/${titular.id}/entrar-como`, headers: { cookie: suporte.cookie } }));
  assert.equal((await app.inject({ method: 'GET', url: '/v1/conta/dados', headers: { cookie: comoCliente } })).statusCode, 403);
  const excluirComoCliente = await app.inject({
    method: 'POST',
    url: '/v1/conta/excluir',
    headers: { cookie: comoCliente },
    payload: { senha: 'senha-do-teste-123', confirmo: true },
  });
  assert.equal(excluirComoCliente.statusCode, 403);
  console.log('✓ "entrar como": suporte não baixa os dados nem exclui a conta');

  // 3) Exclusão.
  const r = await app.inject({ method: 'POST', url: '/v1/conta/excluir', headers: { cookie }, payload: { senha: 'senha-do-teste-123', confirmo: true } });
  assert.equal(r.statusCode, 200, r.body);
  await new Promise((ok) => setTimeout(ok, 20));
  assert.equal(email.enviadas.at(-1)?.para, EMAIL_TITULAR);

  const um = async (sql: string) => (await pool.query(sql, [titular.id])).rows[0];
  const u = await um('SELECT nome, email, whatsapp, profissao, senha_hash, excluida_em, bloqueado_em FROM usuario WHERE id = $1');
  assert.equal(u.nome, 'Conta excluída');
  assert.match(u.email, /^excluida-.*@excluida\.invalid$/);
  assert.equal(u.whatsapp, null);
  assert.equal(u.senha_hash, 'excluida');
  assert.ok(u.excluida_em && u.bloqueado_em);
  const conta0 = async (tabela: string) => Number((await um(`SELECT count(*) AS n FROM ${tabela} WHERE usuario_id = $1`)).n);
  for (const t of ['imovel_monitorado', 'aviso', 'sessao', 'token_email', 'consulta']) assert.equal(await conta0(t), 0, `${t} deveria estar vazio`);
  console.log('✓ apagados: nome, e-mail, WhatsApp, senha, carteira, avisos, sessões e links; consultas desligadas da conta');

  assert.ok((await conta0('pedido')) >= 1, 'pedidos devem ficar (CTN art. 195)');
  assert.ok((await conta0('credito_lancamento')) >= 1);
  assert.equal((await um(`SELECT status FROM assinatura WHERE usuario_id = $1`)).status, 'cancelada');
  const qr = await app.inject({ method: 'GET', url: `/v1/consultas/${consultaId}` });
  assert.equal(qr.statusCode, 200);
  assert.equal(qr.json().minha, false);
  assert.equal((await pool.query('SELECT 1 FROM email_excluido WHERE email_hash = $1', [hashEmail(EMAIL_TITULAR)])).rowCount, 1);
  console.log('✓ guardados: pedidos e créditos (conta anonimizada), assinatura cancelada; o QR do relatório continua abrindo, sem dono');

  const login = await app.inject({ method: 'POST', url: '/v1/sessao', payload: { email: EMAIL_TITULAR, senha: 'senha-do-teste-123' } });
  assert.equal(login.statusCode, 401);
  console.log('✓ o e-mail e a senha antigos não entram mais');
}

main()
  .then(() => console.log('\nDireitos do titular: tudo certo.'))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const id of criados) {
      await pool.query('DELETE FROM auditoria_admin WHERE admin_id = $1 OR alvo_usuario_id = $1', [id]);
      await pool.query('DELETE FROM aviso WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM imovel_monitorado WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM credito_lancamento WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM pedido WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM assinatura WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM consulta WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM usuario WHERE id = $1', [id]);
    }
    // Depois da exclusão a consulta fica sem dono: apaga pelo id.
    await pool.query('DELETE FROM consulta WHERE id = ANY($1::uuid[])', [consultasCriadas]);
    await pool.query('DELETE FROM email_excluido WHERE email_hash = $1', [hashEmail(EMAIL_TITULAR)]);
    await pool.end();
    process.exit();
  });
