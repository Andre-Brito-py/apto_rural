import type pg from 'pg';
import type { Enviador } from '../email/enviador.js';

export type OrigemErro = 'api' | 'site' | 'monitor' | 'coletor' | 'backup' | 'vigia';

export interface NovoErro {
  origem: OrigemErro;
  mensagem: string;
  detalhe?: string;
  rota?: string;
  usuarioId?: string;
}

const INTERVALO_ALERTA_MS = 15 * 60 * 1000;

/**
 * Registra erros no banco (aparecem no painel) e avisa os administradores por
 * e-mail, no máximo um e-mail a cada 15 minutos com o resumo do período.
 * Nunca lança: registrar um erro não pode causar outro.
 */
export class RegistroErros {
  private pendentes: NovoErro[] = [];
  private ultimoEnvio = 0;
  private agendado: NodeJS.Timeout | null = null;
  /** Envio em andamento: enviarAgora espera por ele antes de o processo sair. */
  private enviando: Promise<void> = Promise.resolve();

  constructor(
    private pool: pg.Pool | null,
    private email: Enviador,
    private admins: string[],
    private webOrigin: string,
  ) {}

  async registrar(e: NovoErro): Promise<void> {
    const erro = {
      ...e,
      mensagem: e.mensagem.slice(0, 500),
      detalhe: e.detalhe?.slice(0, 4000),
      rota: e.rota?.split('?')[0]?.slice(0, 200),
    };
    console.error(`[erro:${erro.origem}] ${erro.rota ?? ''} ${erro.mensagem}`);
    if (this.pool) {
      await this.pool
        .query('INSERT INTO erro_registro (origem, mensagem, detalhe, rota, usuario_id) VALUES ($1, $2, $3, $4, $5)', [
          erro.origem,
          erro.mensagem,
          erro.detalhe ?? null,
          erro.rota ?? null,
          erro.usuarioId ?? null,
        ])
        .catch((x) => console.error('Falha ao gravar erro:', x));
    }
    this.pendentes.push(erro);
    this.agendarAlerta();
  }

  /** Só avisa por e-mail um erro que já está gravado (ex.: falha de coletor, gravada pelo próprio coletor). */
  avisar(e: NovoErro) {
    this.pendentes.push({ ...e, mensagem: e.mensagem.slice(0, 500) });
    this.agendarAlerta();
  }

  private agendarAlerta() {
    if (this.admins.length === 0 || this.agendado) return;
    const espera = Math.max(0, this.ultimoEnvio + INTERVALO_ALERTA_MS - Date.now());
    this.agendado = setTimeout(() => {
      this.agendado = null;
      this.enviando = this.enviarAlerta().catch((x) => console.error('Falha ao enviar alerta:', x));
    }, espera);
    this.agendado.unref?.();
  }

  /** Manda já o que estiver pendente (para processos que rodam uma vez e saem). */
  async enviarAgora(): Promise<void> {
    if (this.agendado) clearTimeout(this.agendado);
    this.agendado = null;
    // O temporizador pode já ter disparado um envio: sair antes dele terminar perderia o e-mail.
    await this.enviando;
    if (this.admins.length > 0) await this.enviarAlerta();
  }

  private async enviarAlerta() {
    const lote = this.pendentes.splice(0);
    if (lote.length === 0) return;
    this.ultimoEnvio = Date.now();
    const linhas = lote.slice(0, 20).map((e) => `• [${e.origem}] ${e.rota ? `${e.rota} — ` : ''}${e.mensagem}`);
    if (lote.length > 20) linhas.push(`… e mais ${lote.length - 20}.`);
    const texto = `${lote.length === 1 ? '1 erro registrado' : `${lote.length} erros registrados`} no Apto Rural:\n\n${linhas.join('\n')}\n\nDetalhes no painel: ${this.webOrigin}/admin`;
    for (const para of this.admins) {
      await this.email.enviar({
        para,
        assunto: `[Apto Rural] ${lote.length === 1 ? '1 erro' : `${lote.length} erros`}: ${lote[0]!.mensagem.slice(0, 60)}`,
        texto,
        html: `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${texto.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</pre>`,
      });
    }
  }
}
