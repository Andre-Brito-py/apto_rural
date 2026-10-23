/**
 * FERRAMENTA DE TESTE — carteira e monitor de ponta a ponta, com o banco real.
 *
 * Usa duas fazendas reais da amostra do MMA (teste_imovel_mma), simula um
 * embargo novo sobre uma delas (termo de teste, apagado no fim) e confere que
 * o monitor avisa só ela, uma única vez, por e-mail. Depois confere a virada
 * de data do Prodes. Apaga a conta de teste ao terminar.
 *
 * Uso:  npx tsx --env-file=../../.env scripts/testar-carteira.ts
 */
import assert from 'node:assert/strict';
import { EnviadorMemoria } from '../src/email/enviador.js';
import { monitorarCarteira } from '../src/monitorar.js';
import { criarContexto, criarServidor } from '../src/servidor.js';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const ctx = criarContexto();
const email = new EnviadorMemoria();
ctx.email = email;
const app = criarServidor(ctx);
const SEQ_TESTE = 'TESTE-CARTEIRA';
let usuarioId = '';

async function main() {
  // Conta de teste, já confirmada, com créditos.
  const cad = await app.inject({
    method: 'POST',
    url: '/v1/conta',
    payload: { nome: 'Teste Carteira', email: `carteira-${Date.now()}@exemplo.com`, senha: 'teste-carteira-123', aceiteTermos: true },
  });
  const cookie = String(cad.headers['set-cookie']).split(';')[0]!;
  usuarioId = cad.json().usuario.id;
  await pool.query('UPDATE usuario SET email_confirmado_em = now() WHERE id = $1', [usuarioId]);
  await pool.query(`INSERT INTO credito_lancamento (usuario_id, tipo, quantidade, motivo, referencia) VALUES ($1,'consulta',10,'teste',$2)`, [
    usuarioId,
    `teste-carteira:${usuarioId}`,
  ]);

  // Duas fazendas reais sem nenhuma sobreposição hoje, de 4 a 15 módulos fiscais.
  const { rows: fazendas } = await pool.query(
    `SELECT t.cod_car, t.geojson FROM teste_imovel_mma t
      WHERE t.status_car = 'AT' AND t.modulos_fiscais > 4 AND t.modulos_fiscais <= 15
        AND NOT EXISTS (SELECT 1 FROM ibama_embargo e WHERE e.ativo AND ST_Intersects(e.geom, t.geom))
        AND NOT EXISTS (SELECT 1 FROM funai_ti f WHERE ST_Intersects(f.geom, t.geom))
        AND NOT EXISTS (SELECT 1 FROM cnuc_uc u WHERE ST_Intersects(u.geom, t.geom))
        AND NOT EXISTS (SELECT 1 FROM sfb_floresta_tipo_b s WHERE ST_Intersects(s.geom, t.geom))
        -- Fazendas que já estão na carteira de alguém (ex.: testes manuais) mudariam junto.
        AND NOT EXISTS (SELECT 1 FROM imovel_monitorado m WHERE m.cod_car = t.cod_car)
      ORDER BY md5(t.cod_car) LIMIT 2`,
  );
  assert.equal(fazendas.length, 2, 'amostra sem fazendas suficientes');
  // Acerta antes as carteiras que já existem no banco, para contar só as do teste.
  await monitorarCarteira(ctx);

  for (const [i, f] of fazendas.entries()) {
    const c = await app.inject({ method: 'POST', url: '/v1/consultas', headers: { cookie }, payload: { car: f.cod_car, geometria: f.geojson } });
    assert.equal(c.statusCode, 201, c.body);
    const a = await app.inject({ method: 'POST', url: '/v1/carteira', headers: { cookie }, payload: { consultaId: c.json().id, apelido: `Fazenda ${i + 1}` } });
    assert.equal(a.statusCode, 201, a.body);
  }
  const lista = (await app.inject({ method: 'GET', url: '/v1/carteira', headers: { cookie } })).json();
  assert.equal(lista.imoveis.length, 2);
  console.log('✓ 2 fazendas reais na carteira');

  // 1) Sem mudança nas bases: nenhum aviso.
  let r = await monitorarCarteira(ctx);
  assert.equal(r.comMudanca, 0);
  console.log('✓ monitor sem mudança: nenhum aviso');

  // 2) Embargo novo (de teste) no meio da Fazenda 1.
  await pool.query(
    `INSERT INTO ibama_embargo (seq, numero, data_embargo, area_ha, descricao, ativo, geom)
     SELECT $1, 'TESTE/0001', current_date, NULL, 'Embargo de teste (apagado ao final)', true,
            ST_Buffer(ST_PointOnSurface(geom)::geography, 200)::geometry
       FROM teste_imovel_mma WHERE cod_car = $2`,
    [SEQ_TESTE, fazendas[0].cod_car],
  );
  r = await monitorarCarteira(ctx);
  assert.equal(r.comMudanca, 1, 'deveria mudar só a Fazenda 1');
  assert.equal(r.emails, 1);
  const msg = email.enviadas.at(-1)!;
  assert.match(msg.texto, /Fazenda 1/);
  assert.match(msg.texto, /Embargos ambientais: OK → Impedimento/);
  assert.doesNotMatch(msg.texto, /Fazenda 2/);
  const avisos = (await app.inject({ method: 'GET', url: '/v1/avisos', headers: { cookie } })).json();
  assert.equal(avisos.naoLidos, 1);
  const consultaNova = (await app.inject({ method: 'GET', url: `/v1/consultas/${avisos.avisos[0].consultaId}`, headers: { cookie } })).json();
  assert.equal(consultaNova.resultado.itens.find((i: { regraId: string }) => i.regraId === 'embargo').status, 'impedimento');
  console.log('✓ embargo novo: aviso só da Fazenda 1, e-mail enviado, consulta nova aberta com o impedimento');
  console.log('\n--- e-mail ---\n' + msg.texto + '\n--------------');

  // 3) Rodar de novo não repete o aviso nem o e-mail.
  const enviados = email.enviadas.length;
  r = await monitorarCarteira(ctx);
  assert.equal(r.comMudanca, 0);
  assert.equal(email.enviadas.length, enviados);
  console.log('✓ segunda rodada: sem aviso repetido');

  // 4) Virada de data do Prodes para imóveis de 4 a 15 MF (01/07/2027).
  // A virada vale para todas as carteiras do banco; conta só os avisos novos da conta de teste.
  const antes = (await pool.query('SELECT count(*)::int AS n FROM aviso WHERE usuario_id = $1', [usuarioId])).rows[0].n;
  await monitorarCarteira(ctx, '2027-07-01');
  const depois = (await pool.query('SELECT count(*)::int AS n FROM aviso WHERE usuario_id = $1', [usuarioId])).rows[0].n;
  assert.equal(depois - antes, 2, 'as duas fazendas estão na lista do MMA e passam a impedimento');
  console.log('✓ em 01/07/2027 o Prodes vira impedimento nas duas fazendas');
}

main()
  .then(() => console.log('\nCarteira: tudo certo.'))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.query('DELETE FROM ibama_embargo WHERE seq = $1', [SEQ_TESTE]);
    if (usuarioId) {
      await pool.query('DELETE FROM aviso WHERE usuario_id = $1', [usuarioId]);
      await pool.query('DELETE FROM imovel_monitorado WHERE usuario_id = $1', [usuarioId]);
      await pool.query('DELETE FROM consulta WHERE usuario_id = $1', [usuarioId]);
      await pool.query('DELETE FROM credito_lancamento WHERE usuario_id = $1', [usuarioId]);
      await pool.query('DELETE FROM usuario WHERE id = $1', [usuarioId]);
    }
    await pool.end();
    process.exit();
  });
