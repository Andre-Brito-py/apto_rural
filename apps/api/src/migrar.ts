/**
 * Aplica as migrações de db/migrations em ordem, uma única vez cada, registrando
 * em schema_migracao. Roda antes da API subir em produção.
 *
 * Banco criado pelo docker-compose de desenvolvimento já vem com 001 e 002
 * aplicadas pelo próprio Postgres: nesse caso elas são só registradas.
 *
 * Uso:  node dist/migrar.js   (ou npm run migrar)
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import pg from 'pg';

const PASTA = resolve(process.env.MIGRACOES_DIR ?? join(import.meta.dirname, '../../../db/migrations'));

// Tabela que cada migração cria: se já existe, a migração foi aplicada fora do registro.
const MARCADORES: Record<string, string> = {
  '001_inicial.sql': 'consulta',
  '002_contas_e_pagamentos.sql': 'usuario',
};

/** Espera o banco aceitar conexões (até ~60 s), útil logo após o container subir. */
async function conectar(pool: pg.Pool): Promise<pg.PoolClient> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await pool.connect();
    } catch (e) {
      if (tentativa >= 30) throw e;
      console.log(`Banco ainda não respondeu (${(e as Error).message}); nova tentativa em 2 s.`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const c = await conectar(pool);
  try {
    // Uma migração por vez, mesmo com dois containers subindo juntos.
    await c.query('SELECT pg_advisory_lock(727001)');
    await c.query(`CREATE TABLE IF NOT EXISTS schema_migracao (nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now())`);
    const feitas = new Set((await c.query<{ nome: string }>('SELECT nome FROM schema_migracao')).rows.map((r) => r.nome));
    const arquivos = (await readdir(PASTA)).filter((a) => a.endsWith('.sql')).sort();

    for (const arquivo of arquivos) {
      if (feitas.has(arquivo)) continue;
      const marcador = MARCADORES[arquivo];
      if (marcador && (await c.query('SELECT to_regclass($1) AS t', [`public.${marcador}`])).rows[0].t) {
        await c.query('INSERT INTO schema_migracao (nome) VALUES ($1)', [arquivo]);
        console.log(`registrada (já aplicada): ${arquivo}`);
        continue;
      }
      const sql = await readFile(join(PASTA, arquivo), 'utf8');
      await c.query('BEGIN');
      try {
        await c.query(sql);
        await c.query('INSERT INTO schema_migracao (nome) VALUES ($1)', [arquivo]);
        await c.query('COMMIT');
        console.log(`aplicada: ${arquivo}`);
      } catch (e) {
        await c.query('ROLLBACK');
        throw new Error(`Falha na migração ${arquivo}: ${(e as Error).message}`);
      }
    }
    console.log('Banco em dia.');
  } finally {
    await c.query('SELECT pg_advisory_unlock(727001)').catch(() => undefined);
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
