import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';

/** Segredos que o painel guarda. Só nomes conhecidos: nada de chave arbitrária. */
export type NomeSegredo = 'openai_api_key';

export interface InfoSegredo {
  definida: boolean;
  /** Últimos 4 caracteres, para reconhecer qual chave está salva sem mostrá-la. */
  final?: string;
  atualizadaEm?: string;
}

/**
 * Chave mestra de 32 bytes. Em produção vem da CHAVE_SEGREDOS (obrigatória, ver
 * config.ts); fora dela, sem a variável, deriva uma chave de desenvolvimento, para o
 * projeto rodar sem configuração. Trocar a CHAVE_SEGREDOS invalida os segredos salvos
 * (é só cadastrar a chave da OpenAI de novo no painel).
 */
export function chaveMestra(hex: string, segredoDesenvolvimento: string): Buffer {
  if (/^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex');
  return createHash('sha256').update(`apto-rural-segredos-dev:${segredoDesenvolvimento}`).digest();
}

/** AES-256-GCM: cifra e autentica. O nome do segredo entra como dado autenticado. */
export function cifrar(chave: Buffer, nome: string, valor: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave, iv);
  c.setAAD(Buffer.from(nome));
  const cifrado = Buffer.concat([c.update(valor, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), cifrado]).toString('base64');
}

export function decifrar(chave: Buffer, nome: string, guardado: string): string {
  const b = Buffer.from(guardado, 'base64');
  const d = createDecipheriv('aes-256-gcm', chave, b.subarray(0, 12));
  d.setAAD(Buffer.from(nome));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

const VALIDADE_CACHE_MS = 30 * 1000;

/**
 * Segredos editáveis pelo painel, cifrados no banco. O valor só sai daqui para quem
 * vai usá-lo (o cliente da OpenAI); as rotas do painel só veem o InfoSegredo.
 */
export class Segredos {
  private memoria = new Map<NomeSegredo, { cifrado: string; final: string; quando: Date }>();
  private cache = new Map<NomeSegredo, { valor: string | null; quando: number }>();

  constructor(
    private pool: pg.Pool | null,
    private chave: Buffer,
  ) {}

  async definir(nome: NomeSegredo, valor: string, adminId: string): Promise<InfoSegredo> {
    const cifrado = cifrar(this.chave, nome, valor);
    const final = valor.slice(-4);
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO segredo (nome, valor_cifrado, final, atualizado_por) VALUES ($1, $2, $3, $4)
         ON CONFLICT (nome) DO UPDATE SET valor_cifrado = EXCLUDED.valor_cifrado, final = EXCLUDED.final,
                                          atualizado_em = now(), atualizado_por = EXCLUDED.atualizado_por`,
        [nome, cifrado, final, adminId],
      );
    } else {
      this.memoria.set(nome, { cifrado, final, quando: new Date() });
    }
    this.cache.delete(nome);
    return this.info(nome);
  }

  async apagar(nome: NomeSegredo): Promise<void> {
    if (this.pool) await this.pool.query('DELETE FROM segredo WHERE nome = $1', [nome]);
    else this.memoria.delete(nome);
    this.cache.delete(nome);
  }

  async info(nome: NomeSegredo): Promise<InfoSegredo> {
    const linha = await this.linha(nome);
    return linha ? { definida: true, final: linha.final, atualizadaEm: linha.quando.toISOString() } : { definida: false };
  }

  /** O valor em claro, para usar na chamada. Null se não há segredo ou ele não decifra (CHAVE_SEGREDOS trocada). */
  async obter(nome: NomeSegredo): Promise<string | null> {
    const c = this.cache.get(nome);
    if (c && Date.now() - c.quando < VALIDADE_CACHE_MS) return c.valor;
    const linha = await this.linha(nome);
    let valor: string | null = null;
    if (linha) {
      try {
        valor = decifrar(this.chave, nome, linha.cifrado);
      } catch {
        console.error(`Segredo "${nome}" não decifra: a CHAVE_SEGREDOS mudou? Cadastre o segredo de novo no painel.`);
      }
    }
    this.cache.set(nome, { valor, quando: Date.now() });
    return valor;
  }

  private async linha(nome: NomeSegredo) {
    if (!this.pool) return this.memoria.get(nome) ?? null;
    const { rows } = await this.pool.query<{ valor_cifrado: string; final: string; atualizado_em: Date }>(
      'SELECT valor_cifrado, final, atualizado_em FROM segredo WHERE nome = $1',
      [nome],
    );
    const r = rows[0];
    return r ? { cifrado: r.valor_cifrado, final: r.final, quando: r.atualizado_em } : null;
  }
}
