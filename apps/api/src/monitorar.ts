/**
 * Monitor da carteira: reconfere cada imóvel acompanhado com as bases do dia,
 * registra o que mudou e avisa o técnico por e-mail (um e-mail por pessoa).
 *
 * Roda todo dia às 6h (Brasília), depois dos coletores (4h). Em produção é o
 * processo do container "monitor" (mesma imagem da API).
 *
 * Uso:  node dist/monitorar.js            (roda uma vez e sai)
 *       node dist/monitorar.js --agendar  (fica rodando, uma vez por dia)
 */
import { randomUUID } from 'node:crypto';
import { avaliar, compararResultados } from '@apto/regras';
import { config } from './config.js';
import { hojeBrasilia, type Contexto } from './contexto.js';
import { mensagemAvisosCarteira } from './email/mensagens.js';
import { criarContexto } from './servidor.js';

const HORA = 6;

export interface ResumoMonitor {
  imoveis: number;
  comMudanca: number;
  falhas: number;
  emails: number;
}

export async function monitorarCarteira(ctx: Contexto, hoje = hojeBrasilia()): Promise<ResumoMonitor> {
  if (!ctx.banco || !ctx.carteira) throw new Error('O monitor precisa do banco (DATABASE_URL).');
  const resumo: ResumoMonitor = { imoveis: 0, comMudanca: 0, falhas: 0, emails: 0 };

  for (const im of await ctx.carteira.paraMonitorar()) {
    resumo.imoveis++;
    try {
      const entrada = {
        car: im.codCar,
        situacaoCar: im.situacaoCar,
        modulosFiscais: im.modulosFiscais,
        usoColetivo: im.usoColetivo,
        geometria: im.geometria,
        preferirBaseOficial: true,
      };
      const evidencias = await ctx.banco.coletarEvidencias(entrada);
      const resultado = avaliar(evidencias, hoje);
      const alteracoes = compararResultados(im.resultado, resultado);
      if (alteracoes.length === 0) {
        await ctx.carteira.registrarVerificacao(im.id, resultado);
        continue;
      }
      // Mudou: guarda como consulta (abre resultado, dossiê e QR), sem gastar crédito.
      const salva = await ctx.banco.salvar(entrada, evidencias, resultado, { id: randomUUID(), usuarioId: im.usuarioId });
      await ctx.carteira.registrarVerificacao(im.id, resultado, salva.id);
      await ctx.carteira.criarAviso(im.usuarioId, im.id, salva.id, alteracoes);
      resumo.comMudanca++;
    } catch (e) {
      resumo.falhas++;
      await ctx.erros.registrar({
        origem: 'monitor',
        mensagem: `Falha ao reconferir o CAR ${im.codCar}: ${(e as Error).message}`,
        detalhe: (e as Error).stack,
      });
    }
  }

  for (const grupo of await ctx.carteira.avisosParaEmail()) {
    try {
      // Carteira de equipe: o responsável e os administradores recebem o mesmo resumo.
      const destinatarios = [{ nome: grupo.nome, email: grupo.email }, ...((await ctx.equipe?.administradores(grupo.usuarioId)) ?? [])];
      for (const d of destinatarios) {
        await ctx.email.enviar(mensagemAvisosCarteira(d.nome, d.email, grupo.avisos, `${config.webOrigin}/carteira`));
      }
      await ctx.carteira.marcarEmailados(grupo.avisos.map((a) => a.id));
      resumo.emails++;
    } catch (e) {
      await ctx.erros.registrar({ origem: 'monitor', mensagem: `Falha ao enviar avisos da carteira: ${(e as Error).message}`, detalhe: (e as Error).stack });
    }
  }
  return resumo;
}

/** Base oficial atrasada ou nunca carregada vira erro (e alerta para os administradores). */
export async function verificarBases(ctx: Contexto): Promise<number> {
  if (!ctx.admin) return 0;
  const problemas = (await ctx.admin.saudeBases()).filter((b) => b.situacao !== 'em_dia');
  for (const b of problemas) {
    await ctx.erros.registrar({
      origem: 'monitor',
      mensagem:
        b.situacao === 'nao_carregada'
          ? `Base "${b.nome}" nunca foi carregada.`
          : `Base "${b.nome}" está há ${b.diasSemConferir} dias sem conferência (veja o log dos coletores).`,
    });
  }
  // Coletor que falhou mas ainda tem a carga anterior valendo só ficaria "atrasado" dias
  // depois: as falhas das últimas 24 h já vão no e-mail de hoje (elas estão no painel).
  for (const mensagem of await ctx.admin.falhasColetores(24)) {
    ctx.erros.avisar({ origem: 'coletor', mensagem });
  }
  return problemas.length;
}

function proximaExecucao(): number {
  const agora = new Date();
  // Hora de Brasília (UTC-3, sem horário de verão desde 2019).
  const alvo = new Date(agora);
  alvo.setUTCHours(HORA + 3, 0, 0, 0);
  if (alvo <= agora) alvo.setUTCDate(alvo.getUTCDate() + 1);
  return alvo.getTime() - agora.getTime();
}

async function rodar(ctx: Contexto) {
  const inicio = Date.now();
  const r = await monitorarCarteira(ctx);
  const basesComProblema = await verificarBases(ctx);
  const limpos = await ctx.admin?.limparVencidos();
  console.log(
    `[${new Date().toISOString()}] Carteira: ${r.imoveis} imóveis reconferidos, ${r.comMudanca} com mudança, ` +
      `${r.falhas} falhas, ${r.emails} e-mails, em ${Math.round((Date.now() - inicio) / 1000)}s. ` +
      `Bases com problema: ${basesComProblema}.` +
      (limpos ? ` Limpeza: ${limpos.sessoes} sessões, ${limpos.tokens} links e ${limpos.erros} erros antigos.` : ''),
  );
  await ctx.erros.enviarAgora();
}

if (process.argv[1]?.endsWith('monitorar.js') || process.argv[1]?.endsWith('monitorar.ts')) {
  const ctx = criarContexto();
  if (process.argv.includes('--agendar')) {
    const ciclo = () => {
      const espera = proximaExecucao();
      console.log(`Próxima reconferência da carteira em ${Math.round(espera / 60000)} minutos.`);
      setTimeout(async () => {
        await rodar(ctx).catch((e) => console.error(e));
        ciclo();
      }, espera);
    };
    ciclo();
  } else {
    rodar(ctx)
      .then(() => process.exit(0))
      .catch((e) => {
        console.error(e);
        process.exit(1);
      });
  }
}
