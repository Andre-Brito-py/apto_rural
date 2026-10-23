/**
 * FERRAMENTA DE TESTE — equipes do plano Escritório de ponta a ponta, com o banco real.
 *
 * Ana assina o Escritório (pagamento simulado) e convida Bruno (técnico) e
 * Carla (administradora). Confere convite por e-mail, créditos e carteira
 * compartilhados, o que cada papel pode fazer, o limite de pessoas, a saída e
 * a remoção, e que a exclusão da conta da responsável desfaz a equipe.
 * Apaga tudo o que criou ao terminar.
 *
 * Uso:  npx tsx --env-file=../../.env scripts/testar-equipe.ts
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { hashEmail } from '../src/documento.js';
import { EnviadorMemoria } from '../src/email/enviador.js';
import { monitorarCarteira } from '../src/monitorar.js';
import { criarContexto, criarServidor } from '../src/servidor.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const ctx = criarContexto();
const caixa = new EnviadorMemoria();
ctx.email = caixa;
const app = criarServidor(ctx);
const marca = Date.now();
const SENHA = 'senha-do-teste-123';
const criados: string[] = [];
const consultas: string[] = [];
const emailDe = (nome: string) => `${nome}-${marca}@exemplo.com`;

const cookieDe = (r: { headers: Record<string, unknown> }) => String(r.headers['set-cookie']).split(';')[0]!;

async function conta(nome: string, confirmar = true) {
  const r = await app.inject({ method: 'POST', url: '/v1/conta', payload: { nome, email: emailDe(nome.toLowerCase()), senha: SENHA, aceiteTermos: true } });
  assert.equal(r.statusCode, 201, r.body);
  const id = r.json().usuario.id as string;
  criados.push(id);
  if (confirmar) await pool.query('UPDATE usuario SET email_confirmado_em = now() WHERE id = $1', [id]);
  return { id, cookie: cookieDe(r) };
}

const pedir = (cookie: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

/** Token do último convite mandado para este e-mail. */
function tokenDoConvite(para: string): string {
  // Só e-mails de convite: criar a conta também manda um e-mail (de confirmação) com outro link.
  const m = [...caixa.enviadas].reverse().find((e) => e.para === para && e.assunto.includes('convidou'));
  assert.ok(m, `nenhum convite para ${para}`);
  return decodeURIComponent(/token=([^\s]+)/.exec(m.texto)![1]!);
}

async function assinarEPagar(cookie: string, plano: string) {
  const a = await pedir(cookie, 'POST', '/v1/assinaturas', { plano });
  assert.equal(a.statusCode, 201, a.body);
  await pedir(cookie, 'POST', `/v1/dev/assinaturas/${a.json().id}/pagar-mes`);
}

const eu = async (cookie: string) => (await pedir(cookie, 'GET', '/v1/eu')).json();

async function main() {
  if (ctx.pagamento?.nome !== 'simulado') throw new Error('Rode com APTO_DEMO=1 e sem ASAAS_API_KEY (pagamento simulado).');

  // 0) Sem plano de equipe, não dá para convidar.
  const solo = await conta('Solo');
  assert.equal((await pedir(solo.cookie, 'POST', '/v1/equipe/convites', { email: emailDe('x'), papel: 'tecnico' })).statusCode, 402);
  await assinarEPagar(solo.cookie, 'plano-projetista');
  assert.equal((await pedir(solo.cookie, 'POST', '/v1/equipe/convites', { email: emailDe('x'), papel: 'tecnico' })).statusCode, 402);
  console.log('✓ sem plano e com Projetista (1 pessoa): convite recusado');

  // 1) Ana assina o Escritório e convida.
  const ana = await conta('Ana');
  await assinarEPagar(ana.cookie, 'plano-escritorio');
  const saldoAna = (await eu(ana.cookie)).saldo;
  assert.equal(saldoAna.consulta, 100);
  for (const [nome, papel] of [
    ['bruno', 'tecnico'],
    ['carla', 'administrador'],
  ] as const) {
    const r = await pedir(ana.cookie, 'POST', '/v1/equipe/convites', { email: emailDe(nome), papel });
    assert.equal(r.statusCode, 201, r.body);
  }
  const repetido = await pedir(ana.cookie, 'POST', '/v1/equipe/convites', { email: emailDe('bruno'), papel: 'tecnico' });
  assert.equal(repetido.statusCode, 409);
  let equipe = (await pedir(ana.cookie, 'GET', '/v1/equipe')).json();
  assert.equal(equipe.limite, 5);
  assert.equal(equipe.ocupacao, 3);
  assert.equal(equipe.convites.length, 2);
  console.log('✓ Escritório: 2 convites por e-mail, convite repetido recusado, ocupação 3 de 5');

  // 2) Convite só vale para o e-mail convidado.
  const intruso = await conta('Intruso');
  const tokenBruno = tokenDoConvite(emailDe('bruno'));
  const ver = await app.inject({ method: 'POST', url: '/v1/convites/ver', payload: { token: tokenBruno } });
  assert.equal(ver.json().donoNome, 'Ana');
  assert.equal((await pedir(intruso.cookie, 'POST', '/v1/convites/aceitar', { token: tokenBruno })).statusCode, 403);
  console.log('✓ outra conta não consegue usar o convite de outra pessoa');

  // 3) Bruno cria a conta pelo link (sem confirmar o e-mail) e aceita: o aceite confirma o e-mail.
  const bruno = await conta('Bruno', false);
  const aceite = await pedir(bruno.cookie, 'POST', '/v1/convites/aceitar', { token: tokenBruno });
  assert.equal(aceite.statusCode, 200, aceite.body);
  assert.equal((await pedir(bruno.cookie, 'POST', '/v1/convites/aceitar', { token: tokenBruno })).statusCode, 400);
  const euBruno = await eu(bruno.cookie);
  assert.deepEqual(euBruno.equipe, { papel: 'tecnico', donoNome: 'Ana' });
  assert.equal(euBruno.usuario.emailConfirmado, true);
  assert.equal(euBruno.saldo.consulta, saldoAna.consulta);
  const carla = await conta('Carla');
  const aceiteCarla = await pedir(carla.cookie, 'POST', '/v1/convites/aceitar', { token: tokenDoConvite(emailDe('carla')) });
  assert.equal(aceiteCarla.statusCode, 200, aceiteCarla.body);
  console.log('✓ Bruno e Carla entraram; o convite não vale duas vezes; Bruno vê o saldo da equipe');

  // 4) Créditos compartilhados: Bruno consulta, sai da conta da Ana, com o nome dele no lançamento.
  const { rows: fazendas } = await pool.query(
    `SELECT cod_car, geojson FROM teste_imovel_mma WHERE status_car = 'AT'
        AND NOT EXISTS (SELECT 1 FROM imovel_monitorado m WHERE m.cod_car = teste_imovel_mma.cod_car)
      ORDER BY md5(cod_car) LIMIT 1`,
  );
  const c = await pedir(bruno.cookie, 'POST', '/v1/consultas', { car: fazendas[0].cod_car, geometria: fazendas[0].geojson });
  assert.equal(c.statusCode, 201, c.body);
  const consultaId = c.json().id as string;
  consultas.push(consultaId);
  assert.equal((await eu(ana.cookie)).saldo.consulta, saldoAna.consulta - 1);
  const { rows: lanc } = await pool.query(`SELECT usuario_id, autor_id FROM credito_lancamento WHERE referencia = $1`, [`consulta:${consultaId}`]);
  assert.deepEqual(lanc[0], { usuario_id: ana.id, autor_id: bruno.id });
  assert.equal((await pedir(carla.cookie, 'GET', `/v1/consultas/${consultaId}`)).json().minha, true);
  assert.equal((await pedir(intruso.cookie, 'GET', `/v1/consultas/${consultaId}`)).json().minha, false);
  console.log('✓ consulta do Bruno gastou 1 crédito da conta da Ana, com o Bruno registrado como autor');

  // 5) Dossiê: Carla libera o dossiê da consulta do Bruno, com crédito da equipe.
  const dossie = await pedir(carla.cookie, 'POST', `/v1/consultas/${consultaId}/dossie`);
  assert.equal(dossie.statusCode, 200, dossie.body);
  assert.equal((await pedir(intruso.cookie, 'POST', `/v1/consultas/${consultaId}/dossie`)).statusCode, 200); // já liberado: só confirma
  console.log('✓ a administradora liberou o dossiê da consulta do técnico');

  // 6) Carteira compartilhada: Bruno inclui; todos veem; técnico não tira; administradora tira.
  const inc = await pedir(bruno.cookie, 'POST', '/v1/carteira', { consultaId, apelido: 'Fazenda da Equipe' });
  assert.equal(inc.statusCode, 201, inc.body);
  const carteiraAna = (await pedir(ana.cookie, 'GET', '/v1/carteira')).json();
  assert.equal(carteiraAna.imoveis.length, 1);
  assert.equal(carteiraAna.limite, 300);
  const carteiraBruno = (await pedir(bruno.cookie, 'GET', '/v1/carteira')).json();
  assert.equal(carteiraBruno.podeRemover, false);
  const imovelId = carteiraAna.imoveis[0].id;
  assert.equal((await pedir(bruno.cookie, 'DELETE', `/v1/carteira/${imovelId}`)).statusCode, 403);
  // Aviso da carteira: a administradora recebe também.
  await pool.query(`UPDATE imovel_monitorado SET resultado = jsonb_set(resultado, '{veredito}', '"incompleto"') WHERE id = $1`, [imovelId]);
  await pool.query(
    `UPDATE imovel_monitorado SET resultado = jsonb_set(resultado, '{itens}',
       (SELECT jsonb_agg(jsonb_set(i, '{status}', '"nao_verificado"')) FROM jsonb_array_elements(resultado->'itens') i)) WHERE id = $1`,
    [imovelId],
  );
  const antes = caixa.enviadas.length;
  await monitorarCarteira(ctx);
  const avisosEnviados = caixa.enviadas.slice(antes).map((m) => m.para);
  assert.ok(avisosEnviados.includes(emailDe('ana')) && avisosEnviados.includes(emailDe('carla')), `avisos para: ${avisosEnviados.join(', ')}`);
  assert.ok(!avisosEnviados.includes(emailDe('bruno')));
  assert.equal((await pedir(carla.cookie, 'DELETE', `/v1/carteira/${imovelId}`)).statusCode, 200);
  console.log('✓ carteira da equipe: técnico inclui mas não tira; aviso por e-mail para responsável e administradora; administradora tira');

  // 7) Só a responsável compra e assina.
  assert.equal((await pedir(bruno.cookie, 'POST', '/v1/pedidos', { produto: 'consulta-avulsa' })).statusCode, 403);
  assert.equal((await pedir(carla.cookie, 'POST', '/v1/assinaturas', { plano: 'plano-projetista' })).statusCode, 403);
  assert.equal((await pedir(carla.cookie, 'POST', '/v1/assinatura/cancelar')).statusCode, 403);
  console.log('✓ técnico e administradora não compram, não assinam e não cancelam');

  // 8) Papéis: técnico não convida nem vê e-mails; administradora convida e muda papéis.
  assert.equal((await pedir(bruno.cookie, 'POST', '/v1/equipe/convites', { email: emailDe('dani'), papel: 'tecnico' })).statusCode, 403);
  const vistaBruno = (await pedir(bruno.cookie, 'GET', '/v1/equipe')).json();
  assert.equal(vistaBruno.membros.length, 3);
  assert.ok(vistaBruno.membros.every((m: { email?: string }) => m.email === undefined));
  assert.equal(vistaBruno.convites.length, 0);
  assert.equal((await pedir(carla.cookie, 'PATCH', `/v1/equipe/membros/${bruno.id}`, { papel: 'administrador' })).statusCode, 200);
  assert.equal((await pedir(carla.cookie, 'PATCH', `/v1/equipe/membros/${ana.id}`, { papel: 'tecnico' })).statusCode, 404);
  assert.equal((await pedir(carla.cookie, 'PATCH', `/v1/equipe/membros/${bruno.id}`, { papel: 'tecnico' })).statusCode, 200);
  console.log('✓ técnico não convida nem vê e-mails; administradora muda papéis, mas não o da responsável');

  // 9) Limite de 5 pessoas, contando convites em aberto.
  for (const nome of ['dani', 'edu']) assert.equal((await pedir(carla.cookie, 'POST', '/v1/equipe/convites', { email: emailDe(nome), papel: 'tecnico' })).statusCode, 201);
  const cheio = await pedir(ana.cookie, 'POST', '/v1/equipe/convites', { email: emailDe('fabio'), papel: 'tecnico' });
  assert.equal(cheio.statusCode, 409);
  equipe = (await pedir(ana.cookie, 'GET', '/v1/equipe')).json();
  const conviteEdu = equipe.convites.find((x: { email: string }) => x.email === emailDe('edu'));
  assert.equal((await pedir(ana.cookie, 'DELETE', `/v1/equipe/convites/${conviteEdu.id}`)).statusCode, 200);
  assert.equal((await pedir(ana.cookie, 'POST', '/v1/equipe/convites', { email: emailDe('fabio'), papel: 'tecnico' })).statusCode, 201);
  console.log('✓ limite de 5 pessoas (com convites em aberto); cancelar um convite libera a vaga');

  // 10) Quem tem assinatura própria não entra sem cancelar (não paga em dobro).
  await pool.query('UPDATE usuario SET email = $2 WHERE id = $1', [solo.id, emailDe('dani')]);
  assert.equal((await pedir(solo.cookie, 'POST', '/v1/convites/aceitar', { token: tokenDoConvite(emailDe('dani')) })).statusCode, 409);
  console.log('✓ convidado com assinatura própria precisa cancelá-la antes');

  // 11) Bruno sai; Ana remove Carla: os dois voltam às próprias contas.
  assert.equal((await pedir(ana.cookie, 'DELETE', `/v1/equipe/membros/${ana.id}`)).statusCode, 400);
  assert.equal((await pedir(bruno.cookie, 'DELETE', `/v1/equipe/membros/${bruno.id}`)).statusCode, 200);
  const brunoFora = await eu(bruno.cookie);
  assert.equal(brunoFora.equipe, undefined);
  assert.deepEqual(brunoFora.saldo, { consulta: 0, dossie: 0 });
  assert.equal((await pedir(ana.cookie, 'DELETE', `/v1/equipe/membros/${carla.id}`)).statusCode, 200);
  assert.equal((await eu(carla.cookie)).equipe, undefined);
  console.log('✓ técnico saiu e administradora foi removida: voltam às próprias contas; a responsável não "sai"');

  // 12) LGPD: a responsável exclui a conta e a equipe é desfeita.
  const tokenFabio = tokenDoConvite(emailDe('fabio'));
  const fabio = await conta('Fabio');
  assert.equal((await pedir(fabio.cookie, 'POST', '/v1/convites/aceitar', { token: tokenFabio })).statusCode, 200);
  assert.equal((await eu(fabio.cookie)).equipe.donoNome, 'Ana');
  // A exclusão desliga as consultas da Ana (inclusive as do monitor): guarda os ids para a limpeza.
  consultas.push(...(await pool.query<{ id: string }>('SELECT id FROM consulta WHERE usuario_id = $1', [ana.id])).rows.map((r) => r.id));
  const exc = await pedir(ana.cookie, 'POST', '/v1/conta/excluir', { senha: SENHA, confirmo: true });
  assert.equal(exc.statusCode, 200, exc.body);
  assert.equal((await eu(fabio.cookie)).equipe, undefined);
  assert.equal((await pool.query('SELECT 1 FROM equipe WHERE dono_id = $1', [ana.id])).rowCount, 0);
  console.log('✓ exclusão da conta da responsável desfaz a equipe; quem estava nela volta à própria conta');
}

main()
  .then(() => console.log('\nEquipes: tudo certo.'))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.query('DELETE FROM equipe WHERE dono_id = ANY($1::uuid[])', [criados]);
    await pool.query('DELETE FROM consulta WHERE id = ANY($1::uuid[])', [consultas]);
    for (const id of criados) {
      await pool.query('DELETE FROM aviso WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM imovel_monitorado WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM credito_lancamento WHERE usuario_id = $1 OR autor_id = $1', [id]);
      await pool.query('DELETE FROM pedido WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM assinatura WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM consulta WHERE usuario_id = $1', [id]);
    }
    await pool.query('DELETE FROM usuario WHERE id = ANY($1::uuid[])', [criados]);
    await pool.query('DELETE FROM email_excluido WHERE email_hash = $1', [hashEmail(emailDe('ana'))]);
    await pool.end();
    process.exit();
  });
