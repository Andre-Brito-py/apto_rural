import type pg from 'pg';

export type ResultadoChamada = 'ok' | 'rejeitado' | 'erro';

/**
 * Preço por 1 milhão de tokens (US$, entrada e saída), da tabela oficial
 * developers.openai.com/api/docs/pricing em 26/10/2026. Serve só para a estimativa
 * do painel; o valor cobrado de verdade está no painel da OpenAI.
 */
export const PRECOS_USD_POR_MILHAO: Record<string, [number, number]> = {
  'gpt-6-luna': [0.1, 0.5],
  'gpt-6.1-terra': [1, 5],
  'gpt-6.1-sol': [2, 10],
  'gpt-5.6-luna': [0.2, 1.2],
  'gpt-5-mini': [0.25, 2],
  'gpt-5-nano': [0.05, 0.4],
  'gpt-4.1-mini': [0.4, 1.6],
  'gpt-4o-mini': [0.15, 0.6],
};

export interface UsoDoMes {
  chamadas: number;
  ok: number;
  rejeitadas: number;
  erros: number;
  tokensEntrada: number;
  tokensSaida: number;
  /** Estimativa em US$, só com os modelos da tabela acima; null se algum não estiver nela. */
  custoEstimadoUsd: number | null;
}

interface Registro {
  quando: Date;
  modelo: string;
  tokensEntrada: number;
  tokensSaida: number;
  resultado: ResultadoChamada;
}

// Início do dia e do mês no fuso de Brasília, que é o que o painel mostra.
const INICIO_DIA = `(date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')`;
const INICIO_MES = `(date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')`;

/** Contagem de chamadas à IA: limite diário e uso do mês. Sem texto nem dado da consulta. */
export class UsoIA {
  private memoria: Registro[] = [];

  constructor(private pool: pg.Pool | null) {}

  async registrar(r: Omit<Registro, 'quando'>): Promise<void> {
    if (!this.pool) {
      this.memoria.push({ ...r, quando: new Date() });
      return;
    }
    await this.pool.query('INSERT INTO ia_uso (modelo, tokens_entrada, tokens_saida, resultado) VALUES ($1, $2, $3, $4)', [
      r.modelo,
      r.tokensEntrada,
      r.tokensSaida,
      r.resultado,
    ]);
  }

  /** Chamadas feitas hoje (todas contam no limite, inclusive as rejeitadas). */
  async hoje(): Promise<number> {
    if (!this.pool) {
      const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      return this.memoria.filter((r) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(r.quando) === hoje).length;
    }
    const { rows } = await this.pool.query<{ n: string }>(`SELECT count(*) AS n FROM ia_uso WHERE quando >= ${INICIO_DIA}`);
    return Number(rows[0]!.n);
  }

  async doMes(): Promise<UsoDoMes> {
    let linhas: { modelo: string; resultado: ResultadoChamada; n: number; ent: number; sai: number }[];
    if (!this.pool) {
      const mes = new Date().toISOString().slice(0, 7);
      linhas = this.memoria
        .filter((r) => r.quando.toISOString().slice(0, 7) === mes)
        .map((r) => ({ modelo: r.modelo, resultado: r.resultado, n: 1, ent: r.tokensEntrada, sai: r.tokensSaida }));
    } else {
      const { rows } = await this.pool.query(
        `SELECT modelo, resultado, count(*)::int AS n, sum(tokens_entrada)::int AS ent, sum(tokens_saida)::int AS sai
           FROM ia_uso WHERE quando >= ${INICIO_MES} GROUP BY modelo, resultado`,
      );
      linhas = rows;
    }
    const soma = (f: (l: (typeof linhas)[number]) => number) => linhas.reduce((t, l) => t + f(l), 0);
    let custo: number | null = 0;
    for (const l of linhas) {
      const preco = PRECOS_USD_POR_MILHAO[l.modelo];
      if (!preco) custo = null;
      else if (custo != null) custo += (l.ent * preco[0] + l.sai * preco[1]) / 1_000_000;
    }
    return {
      chamadas: soma((l) => l.n),
      ok: soma((l) => (l.resultado === 'ok' ? l.n : 0)),
      rejeitadas: soma((l) => (l.resultado === 'rejeitado' ? l.n : 0)),
      erros: soma((l) => (l.resultado === 'erro' ? l.n : 0)),
      tokensEntrada: soma((l) => l.ent),
      tokensSaida: soma((l) => l.sai),
      // Seis casas: cada explicação custa frações de centavo de dólar.
      custoEstimadoUsd: custo == null ? null : Math.round(custo * 1_000_000) / 1_000_000,
    };
  }
}
