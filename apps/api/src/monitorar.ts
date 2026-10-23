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
      console.error(`Falha ao reconferir ${im.codCar}:`, e);
    }
  }

  for (const grupo of await ctx.carteira.avisosParaEmail()) {
    try {
      await ctx.email.enviar(mensagemAvisosCarteira(grupo.nome, grupo.email, grupo.avisos, `${config.webOrigin}/carteira`));
      await ctx.carteira.marcarEmailados(grupo.avisos.map((a) => a.id));
      resumo.emails++;
    } catch (e) {
      console.error(`Falha ao enviar avisos para ${grupo.email}:`, e);
    }
  }
  return resumo;
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
  console.log(
    `[${new Date().toISOString()}] Carteira: ${r.imoveis} imóveis reconferidos, ${r.comMudanca} com mudança, ` +
      `${r.falhas} falhas, ${r.emails} e-mails, em ${Math.round((Date.now() - inicio) / 1000)}s.`,
  );
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
