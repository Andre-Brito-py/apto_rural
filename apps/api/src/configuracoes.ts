import type pg from 'pg';
import { z } from 'zod';
import { CREDITOS_BOAS_VINDAS_PADRAO, LIMITE_CARTEIRA_PADRAO, PRODUTOS_PADRAO, type Produto } from './produtos.js';

export interface AvisoSite {
  ativo: boolean;
  texto: string;
  tipo: 'info' | 'alerta';
}

export interface Configs {
  produtos: Produto[];
  limite_carteira: number;
  creditos_boas_vindas: { consulta: number; dossie: number };
  aviso_site: AvisoSite;
}

export type ChaveConfig = keyof Configs;

const PADRAO: Configs = {
  produtos: PRODUTOS_PADRAO,
  limite_carteira: LIMITE_CARTEIRA_PADRAO,
  creditos_boas_vindas: CREDITOS_BOAS_VINDAS_PADRAO,
  aviso_site: { ativo: false, texto: '', tipo: 'info' },
};

const creditos = z.object({
  consulta: z.number().int().min(0).max(10000),
  dossie: z.number().int().min(0).max(10000),
});

const produto = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,40}$/, 'O código do pacote usa só letras minúsculas, números e hífen (3 a 40).'),
  nome: z.string().trim().min(2, 'Dê um nome ao pacote.').max(60),
  descricao: z.string().trim().max(200),
  valor: z
    .number()
    .min(1, 'O preço mínimo é R$ 1,00.')
    .max(100000)
    .transform((v) => Math.round(v * 100) / 100),
  creditos: creditos.refine((c) => c.consulta + c.dossie > 0, 'O pacote precisa dar pelo menos 1 crédito.'),
  destaque: z.boolean().optional(),
  ativo: z.boolean(),
});

/** Validação de cada configuração antes de salvar. */
export const ESQUEMAS: { [K in ChaveConfig]: z.ZodType<Configs[K], z.ZodTypeDef, unknown> } = {
  produtos: z
    .array(produto)
    .min(1)
    .max(12)
    .refine((ps) => new Set(ps.map((p) => p.id)).size === ps.length, 'Há dois pacotes com o mesmo código.')
    .refine((ps) => ps.some((p) => p.ativo), 'Deixe pelo menos um pacote ativo.'),
  limite_carteira: z.number().int().min(0).max(10000),
  creditos_boas_vindas: creditos,
  aviso_site: z.object({
    ativo: z.boolean(),
    texto: z.string().trim().max(300),
    tipo: z.enum(['info', 'alerta']),
  }),
};

const VALIDADE_CACHE_MS = 30 * 1000;

/**
 * Configurações do negócio editáveis pelo painel. O padrão vem do código; o
 * que o administrador salvar no banco tem prioridade. Cache de 30 s: a API,
 * o monitor e os testes enxergam a mudança logo depois de salva.
 */
export class Configuracoes {
  private cache: { valor: Configs; quando: number } | null = null;
  private memoria: Partial<Configs> = {};

  constructor(private pool: pg.Pool | null) {}

  async obter(): Promise<Configs> {
    if (this.cache && Date.now() - this.cache.quando < VALIDADE_CACHE_MS) return this.cache.valor;
    let salvas: Partial<Configs> = this.memoria;
    if (this.pool) {
      const { rows } = await this.pool.query<{ chave: ChaveConfig; valor: unknown }>('SELECT chave, valor FROM configuracao');
      salvas = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
    }
    const valor = { ...PADRAO, ...salvas };
    this.cache = { valor, quando: Date.now() };
    return valor;
  }

  /** Valida e salva. Lança Error com mensagem amigável se o valor for inválido. */
  async salvar<K extends ChaveConfig>(chave: K, valor: unknown, adminId: string): Promise<Configs[K]> {
    const r = ESQUEMAS[chave].safeParse(valor);
    if (!r.success) throw new ErroConfiguracao(r.error.issues[0]!.message);
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO configuracao (chave, valor, atualizado_por) VALUES ($1, $2, $3)
         ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now(), atualizado_por = EXCLUDED.atualizado_por`,
        [chave, JSON.stringify(r.data), adminId],
      );
    } else {
      this.memoria[chave] = r.data;
    }
    this.cache = null;
    return r.data;
  }
}

export class ErroConfiguracao extends Error {}
