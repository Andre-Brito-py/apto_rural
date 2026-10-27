import type { Contexto } from './contexto.js';

/**
 * Vigia do site (docs/backup-e-vigia.md). A cada poucos minutos, confere o site pelo
 * endereço público, como um visitante (HTTPS → Caddy → API → banco), e manda um sinal
 * para um serviço de alerta de fora do servidor (ex.: healthchecks.io):
 *   - deu certo: chama VIGIA_URL_SITE;
 *   - falhou duas vezes seguidas: chama VIGIA_URL_SITE/fail, com o motivo.
 * Se o servidor inteiro cair, os sinais param de chegar e o serviço avisa sozinho.
 * É isso que nenhum alerta de dentro do servidor consegue fazer.
 */
export interface ResultadoVigia {
  ok: boolean;
  ms: number;
  mensagem?: string;
}

type Buscar = typeof fetch;

export async function conferirSite(endereco: string, buscar: Buscar = fetch): Promise<ResultadoVigia> {
  const inicio = Date.now();
  const ms = () => Date.now() - inicio;
  try {
    const r = await buscar(`${endereco.replace(/\/$/, '')}/v1/saude`, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': 'AptoRural-Vigia' },
    });
    const corpo = (await r.json().catch(() => null)) as { ok?: boolean; banco?: boolean } | null;
    if (!r.ok) return { ok: false, ms: ms(), mensagem: `O site respondeu HTTP ${r.status}.` };
    if (corpo == null || typeof corpo.ok !== 'boolean') {
      return { ok: false, ms: ms(), mensagem: 'O endereço respondeu, mas não com a API (Caddy ou domínio mal configurado?).' };
    }
    if (!corpo.ok || corpo.banco !== true) return { ok: false, ms: ms(), mensagem: 'A API respondeu, mas sem o banco de dados.' };
    return { ok: true, ms: ms() };
  } catch (e) {
    const nome = (e as Error).name;
    return { ok: false, ms: ms(), mensagem: nome === 'TimeoutError' ? 'O site não respondeu em 15 segundos.' : 'Não foi possível conectar ao site.' };
  }
}

/** Sinal para o serviço de alerta. Devolve se o serviço recebeu. */
export async function sinalizar(url: string, resultado: ResultadoVigia, buscar: Buscar = fetch): Promise<boolean> {
  try {
    const destino = resultado.ok ? url : `${url.replace(/\/$/, '')}/fail`;
    const r = await buscar(destino, {
      method: 'POST',
      body: resultado.mensagem ?? `ok em ${resultado.ms} ms`,
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export interface OpcoesVigia {
  endereco: string;
  urlAviso?: string;
  /** Sinal do backup diário no serviço de alerta (VIGIA_URL_BACKUP). */
  urlBackup?: string;
  intervaloMs: number;
  buscar?: Buscar;
}

/**
 * O backup grava o resultado no banco; aqui o sinal vai ao serviço de alerta (deu certo ou
 * falhou). Fica marcado no banco: reiniciar o monitor não perde nem repete sinal.
 */
async function sinalizarBackups(ctx: Contexto, url: string, buscar?: Buscar) {
  if (!ctx.admin) return;
  for (const b of await ctx.admin.backupsSemSinal()) {
    if (await sinalizar(url, { ok: b.ok, ms: 0, mensagem: b.mensagem }, buscar)) await ctx.admin.marcarSinalBackup(b.id);
  }
}

/** Uma rodada: confere, avisa o serviço de fora e registra. Guarda quantas falhas seguidas houve. */
export function criarVigia(ctx: Contexto, o: OpcoesVigia) {
  let falhasSeguidas = 0;
  let foraDoAr = false;

  return async function rodada(): Promise<ResultadoVigia & { avisado: boolean }> {
    const r = await conferirSite(o.endereco, o.buscar);
    falhasSeguidas = r.ok ? 0 : falhasSeguidas + 1;
    // Uma falha isolada (um soluço de rede) não dispara alerta; duas seguidas, sim.
    const confirmada = !r.ok && falhasSeguidas >= 2;
    let avisado = false;
    if (o.urlAviso && (r.ok || confirmada)) avisado = await sinalizar(o.urlAviso, r, o.buscar);

    // No registro de erros, uma vez por queda (não a cada 5 minutos), e a volta no log.
    if (confirmada && !foraDoAr) {
      foraDoAr = true;
      await ctx.erros.registrar({ origem: 'vigia', mensagem: `Site fora do ar pelo endereço público: ${r.mensagem}` }).catch(() => undefined);
    } else if (r.ok && foraDoAr) {
      foraDoAr = false;
      console.log(`[vigia] O site voltou (${r.ms} ms).`);
    }
    await ctx.admin?.registrarVigia({ ok: r.ok, ms: r.ms, mensagem: r.mensagem, avisado }).catch(() => undefined);
    if (o.urlBackup) await sinalizarBackups(ctx, o.urlBackup, o.buscar).catch((e) => console.error('[vigia] sinal do backup:', e));
    return { ...r, avisado };
  };
}

export function iniciarVigia(ctx: Contexto, o: OpcoesVigia) {
  if (!o.urlAviso) {
    console.log('[vigia] Sem VIGIA_URL_SITE: o vigia confere o site e mostra no painel, mas ninguém de fora é avisado se ele cair.');
  }
  const rodada = criarVigia(ctx, o);
  const executar = () => rodada().catch((e) => console.error('[vigia]', e));
  setTimeout(executar, 30_000); // dá tempo de a API e o Caddy subirem
  setInterval(executar, o.intervaloMs);
}
