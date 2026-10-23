/**
 * FERRAMENTA DE TESTE — roda consultas reais de ponta a ponta pela API.
 *
 * Pré-requisitos: PostGIS com as bases carregadas, amostra do MMA em
 * teste_imovel_mma (coletores/amostra_mma.py) e a API rodando em API_URL.
 * Para cada caso, escolhe imóveis reais, consulta pela API (como o site faz) e
 * confere o resultado contra o que o próprio banco mostra.
 *
 * Uso:  npx tsx --env-file=../../.env scripts/testar-fazendas-reais.ts
 */
import pg from 'pg';

const API = process.env.API_URL ?? 'http://127.0.0.1:3333';
const POR_CASO = Number(process.env.POR_CASO ?? 3);

const CASOS: { nome: string; filtro: string; esperado: (itens: Record<string, string>) => boolean }[] = [
  {
    nome: 'embargo ativo do Ibama (0,1 ha ou mais dentro do imóvel)',
    filtro: `EXISTS (SELECT 1 FROM ibama_embargo e WHERE e.ativo AND ST_Intersects(e.geom, t.geom)
              AND (ST_Dimension(e.geom) < 2 OR ST_Area(ST_Intersection(e.geom, t.geom)::geography) >= 1000))`,
    esperado: (i) => i['embargo'] === 'impedimento',
  },
  {
    nome: 'só embargo de vizinho encostando na divisa (< 0,1 ha)',
    filtro: `EXISTS (SELECT 1 FROM ibama_embargo e WHERE e.ativo AND ST_Intersects(e.geom, t.geom))
             AND NOT EXISTS (SELECT 1 FROM ibama_embargo e WHERE e.ativo AND ST_Intersects(e.geom, t.geom)
              AND (ST_Dimension(e.geom) < 2 OR ST_Area(ST_Intersection(e.geom, t.geom)::geography) >= 1000))`,
    esperado: (i) => i['embargo'] === 'atencao',
  },
  {
    nome: 'terra indígena com fase impeditiva',
    filtro: `EXISTS (SELECT 1 FROM funai_ti f WHERE ST_Intersects(f.geom, t.geom)
              AND (f.fase IN ('Regularizada','Homologada','Encaminhada RI') OR f.modalidade = 'Reserva Indígena'))`,
    esperado: (i) => i['terra-indigena'] === 'impedimento' || i['terra-indigena'] === 'atencao',
  },
  {
    nome: 'UC de Proteção Integral',
    filtro: `EXISTS (SELECT 1 FROM cnuc_uc u WHERE u.grupo = 'Proteção Integral' AND ST_Intersects(u.geom, t.geom))`,
    esperado: (i) => i['unidade-conservacao'] === 'impedimento' || i['unidade-conservacao'] === 'atencao',
  },
  {
    nome: 'só UC de Uso Sustentável',
    filtro: `EXISTS (SELECT 1 FROM cnuc_uc u WHERE u.grupo = 'Uso Sustentável' AND ST_Intersects(u.geom, t.geom))
             AND NOT EXISTS (SELECT 1 FROM cnuc_uc u WHERE u.grupo = 'Proteção Integral' AND ST_Intersects(u.geom, t.geom))`,
    esperado: (i) => i['unidade-conservacao'] === 'atencao',
  },
  {
    nome: 'floresta pública Tipo B',
    filtro: `EXISTS (SELECT 1 FROM sfb_floresta_tipo_b s WHERE ST_Intersects(s.geom, t.geom))`,
    esperado: (i) => i['floresta-publica'] === 'impedimento' || i['floresta-publica'] === 'atencao',
  },
  {
    nome: 'CAR suspenso ou cancelado',
    filtro: `t.status_car IN ('SU','CA')`,
    esperado: (i) => i['car'] === 'impedimento',
  },
  {
    nome: 'nenhuma sobreposição (só Prodes)',
    filtro: `t.status_car = 'AT'
      AND NOT EXISTS (SELECT 1 FROM ibama_embargo e WHERE e.ativo AND ST_Intersects(e.geom, t.geom))
      AND NOT EXISTS (SELECT 1 FROM funai_ti f WHERE ST_Intersects(f.geom, t.geom))
      AND NOT EXISTS (SELECT 1 FROM cnuc_uc u WHERE ST_Intersects(u.geom, t.geom))
      AND NOT EXISTS (SELECT 1 FROM sfb_floresta_tipo_b s WHERE ST_Intersects(s.geom, t.geom))`,
    esperado: (i) =>
      i['embargo'] === 'sem_impedimento' &&
      i['terra-indigena'] === 'sem_impedimento' &&
      i['unidade-conservacao'] === 'sem_impedimento' &&
      i['floresta-publica'] === 'sem_impedimento' &&
      i['car'] === 'sem_impedimento' &&
      // Na lista do MMA, acima do critério: atenção até a data do porte, depois impedimento.
      (i['prodes'] === 'atencao' || i['prodes'] === 'impedimento'),
  },
];

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  // Conta de teste com créditos lançados direto no livro-razão (motivo "teste").
  const email = `teste-real-${Date.now()}@exemplo.com`;
  const cadastro = await fetch(`${API}/v1/conta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'Teste fazendas reais', email, senha: 'teste-fazendas-reais', aceiteTermos: true }),
  });
  const cookie = (cadastro.headers.get('set-cookie') ?? '').split(';')[0]!;
  const { usuario } = (await cadastro.json()) as { usuario: { id: string } };
  await pool.query(
    `INSERT INTO credito_lancamento (usuario_id, tipo, quantidade, motivo, referencia) VALUES ($1, 'consulta', 100, 'teste', $2)`,
    [usuario.id, `teste:${usuario.id}`],
  );

  let falhas = 0;
  const tempos: number[] = [];
  for (const caso of CASOS) {
    const { rows } = await pool.query(
      `SELECT t.cod_car, t.uf, t.municipio, t.modulos_fiscais, t.geojson FROM teste_imovel_mma t
        WHERE ${caso.filtro} ORDER BY md5(t.cod_car) LIMIT $1`,
      [POR_CASO],
    );
    console.log(`\n## ${caso.nome} (${rows.length} imóveis)`);
    for (const r of rows) {
      const inicio = performance.now();
      const resp = await fetch(`${API}/v1/consultas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ car: r.cod_car, geometria: r.geojson }),
      });
      const ms = Math.round(performance.now() - inicio);
      tempos.push(ms);
      const corpo = (await resp.json()) as {
        id: string;
        resultado?: { veredito: string; itens: { regraId: string; status: string; resumo: string }[] };
        erro?: { mensagem: string };
      };
      if (!resp.ok || !corpo.resultado) {
        falhas++;
        console.log(`  ✕ ${r.cod_car}: HTTP ${resp.status} ${corpo.erro?.mensagem}`);
        continue;
      }
      const itens = Object.fromEntries(corpo.resultado.itens.map((i) => [i.regraId, i.status]));
      const ok = caso.esperado(itens);
      if (!ok) falhas++;
      const problemas = corpo.resultado.itens.filter((i) => i.status === 'impedimento' || i.status === 'atencao').map((i) => i.regraId);
      console.log(
        `  ${ok ? '✓' : '✕'} ${r.cod_car} (${r.municipio}/${r.uf}, ${r.modulos_fiscais} MF) → ${corpo.resultado.veredito}` +
          ` [${problemas.join(', ') || 'nada'}] ${ms} ms — /consulta/${corpo.id}`,
      );
      if (!ok) console.log('    itens:', JSON.stringify(itens));
    }
  }

  tempos.sort((a, b) => a - b);
  const p = (q: number) => tempos[Math.min(tempos.length - 1, Math.floor(q * tempos.length))];
  console.log(`\n${tempos.length} consultas, ${falhas} falhas. Tempo: mediana ${p(0.5)} ms, p90 ${p(0.9)} ms, máximo ${tempos.at(-1)} ms.`);
  await pool.end();
  process.exit(falhas ? 1 : 0);
}

main();
