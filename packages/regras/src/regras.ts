import { CONTESTACAO_PRODES_URL, norma } from './normas.js';
import type { Caminho, Evidencias, Regra, ResultadoItem, Sobreposicao } from './tipos.js';

/**
 * Sobreposição abaixo deste valor é tratada como "de borda" (provável imprecisão
 * do desenho) e sai como atenção. É um critério do produto, NÃO da norma: o MCR
 * fala em imóvel "total ou parcialmente" inserido, sem tolerância.
 */
export const TOLERANCIA_BORDA_HA = 0.1;

function base(regra: Regra): Omit<ResultadoItem, 'status' | 'resumo'> {
  return {
    regraId: regra.id,
    titulo: regra.titulo,
    detalhes: [],
    caminhos: [],
    normas: regra.normas,
    fontes: regra.fontes,
    dossie: null,
  };
}

function naoVerificado(regra: Regra, motivo: string): ResultadoItem {
  return { ...base(regra), status: 'nao_verificado', resumo: motivo };
}

function ha(valor: number): string {
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha`;
}

function dataBr(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function soBorda(lista: Sobreposicao[]): boolean {
  return lista.every((s) => s.areaHa < TOLERANCIA_BORDA_HA);
}

function sem(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const AVISO_BORDA =
  'Sobreposição muito pequena, típica de imprecisão no desenho do CAR. A norma não prevê tolerância: o banco pode tratar como impedimento. Vale corrigir o desenho do CAR antes da proposta.';

/** Abre uma regra de sobreposição comum: não verificado, nada encontrado ou só borda. */
function sobreposicaoSimples(
  regra: Regra,
  lista: Sobreposicao[] | null | undefined,
  rotulo: string,
): ResultadoItem | Sobreposicao[] {
  if (lista == null) return naoVerificado(regra, `A base de ${rotulo} não foi consultada.`);
  if (lista.length === 0) {
    return { ...base(regra), status: 'sem_impedimento', resumo: `Nenhuma sobreposição com ${rotulo}.` };
  }
  return lista;
}

export const regraCar: Regra = {
  id: 'car',
  titulo: 'Cadastro Ambiental Rural',
  pergunta: 'O CAR está ativo (não cancelado nem suspenso)?',
  normas: [norma('MCR 2-9-3', 'res5193')],
  fontes: ['car_demonstrativo'],
  avaliar(ev) {
    const situacao = ev.imovel.situacaoCar;
    if (!situacao) {
      return naoVerificado(this, 'Informe a situação do CAR que aparece no demonstrativo do Sicar.');
    }
    if (situacao === 'cancelado' || situacao === 'suspenso') {
      return {
        ...base(this),
        status: 'impedimento',
        resumo: `CAR ${situacao}: o MCR veda crédito para imóvel com inscrição cancelada ou suspensa.`,
        caminhos: [
          {
            titulo: 'Regularizar a inscrição',
            descricao:
              'Resolver a pendência que levou à suspensão ou ao cancelamento junto ao órgão ambiental estadual responsável pela análise do CAR.',
          },
        ],
        dossie: 'plano_de_saida',
      };
    }
    const resultado: ResultadoItem = {
      ...base(this),
      status: 'sem_impedimento',
      resumo: `CAR ${situacao}.`,
    };
    if (situacao === 'pendente') {
      resultado.detalhes.push(
        'A situação "pendente" não está entre os impedimentos do item 3, mas a exceção de embargo do item 12 exige CAR ativo e "aguardando análise".',
      );
    }
    return resultado;
  },
};

export const regraTrabalhoEscravo: Regra = {
  id: 'trabalho-escravo',
  titulo: 'Cadastro de empregadores (trabalho escravo)',
  pergunta: 'O produtor consta no cadastro do Ministério do Trabalho?',
  normas: [norma('MCR 2-9-4', 'res5268')],
  fontes: ['mte_empregadores'],
  avaliar(ev) {
    const r = ev.trabalhoEscravo;
    if (r == null) {
      return naoVerificado(this, 'CPF/CNPJ do produtor não informado ou consulta não autorizada.');
    }
    if (!r.consta) {
      return { ...base(this), status: 'sem_impedimento', resumo: 'O documento não consta no cadastro.' };
    }
    return {
      ...base(this),
      status: 'impedimento',
      resumo: 'O documento consta no cadastro de empregadores do MTE.',
      detalhes: [
        'O item 4 se aplica quando há decisão administrativa final sobre o auto de infração. Confirme os dados no cadastro oficial.',
      ],
    };
  },
};

const CATEGORIAS_5A = ['reserva extrativista', 'floresta nacional', 'reserva de desenvolvimento sustentavel'];

export const regraUnidadeConservacao: Regra = {
  id: 'unidade-conservacao',
  titulo: 'Unidades de Conservação',
  pergunta: 'O imóvel está dentro de uma Unidade de Conservação?',
  normas: [norma('MCR 2-9-5', 'res5193'), norma('MCR 2-9-5-A', 'res5268'), norma('MCR 2-9-6', 'res5193')],
  fontes: ['cnuc'],
  avaliar(ev) {
    const aberto = sobreposicaoSimples(this, ev.unidadesConservacao, 'Unidades de Conservação do CNUC');
    if (!Array.isArray(aberto)) return aberto;
    const lista = ev.unidadesConservacao!;
    const detalhes = lista.map((u) => `${u.nome} (${u.categoria}): ${ha(u.areaHa)} dentro do imóvel.`);
    if (soBorda(lista)) {
      return { ...base(this), status: 'atencao', resumo: 'Sobreposição de borda com Unidade de Conservação.', detalhes: [...detalhes, AVISO_BORDA], dossie: 'contestacao' };
    }
    const caminhos: Caminho[] = [
      {
        titulo: 'Atividade conforme o Plano de Manejo',
        descricao: 'O item 5 não se aplica a atividade em conformidade com o Plano de Manejo da UC (art. 28 da Lei 9.985/2000).',
        norma: norma('MCR 2-9-5', 'res5193'),
      },
      {
        titulo: 'UC de domínio público sem regularização fundiária concluída',
        descricao: 'Em UC de domínio exclusivamente público, o impedimento só vale se o imóvel tiver processo de regularização fundiária concluído.',
        norma: norma('MCR 2-9-6', 'res5193'),
      },
    ];
    if (lista.some((u) => CATEGORIAS_5A.some((c) => sem(u.categoria).includes(c)))) {
      caminhos.push({
        titulo: 'Resex, Flona ou RDS sem Plano de Manejo (até 30/6/2028)',
        descricao: 'Pode ser aceita anuência do órgão gestor para comunidades tradicionais, no Pronaf, com atividades compatíveis com a UC.',
        norma: norma('MCR 2-9-5-A', 'res5268'),
      });
    }
    return {
      ...base(this),
      status: 'impedimento',
      resumo: 'Imóvel com área dentro de Unidade de Conservação.',
      detalhes,
      caminhos,
      dossie: 'plano_de_saida',
    };
  },
};

const FASES_IMPEDITIVAS = ['homologada', 'regularizada', 'reserva indigena'];

export const regraTerraIndigena: Regra = {
  id: 'terra-indigena',
  titulo: 'Terras indígenas',
  pergunta: 'O imóvel está dentro de terra indígena homologada, regularizada ou reserva?',
  normas: [norma('MCR 2-9-7', 'res5193')],
  fontes: ['funai_ti'],
  avaliar(ev) {
    const aberto = sobreposicaoSimples(this, ev.terrasIndigenas, 'terras indígenas da Funai');
    if (!Array.isArray(aberto)) return aberto;
    const lista = ev.terrasIndigenas!;
    const impeditivas = lista.filter((t) => FASES_IMPEDITIVAS.some((f) => sem(t.fase).includes(f)));
    const detalhes = lista.map((t) => `${t.nome} (fase: ${t.fase}): ${ha(t.areaHa)} dentro do imóvel.`);
    if (impeditivas.length === 0) {
      return {
        ...base(this),
        status: 'atencao',
        resumo: 'Sobreposição com terra indígena em fase que não gera o impedimento do item 7.',
        detalhes: [...detalhes, 'Terras em estudo, delimitadas ou declaradas não entram no item 7, mas o Sicar pode deixar o CAR como pendente.'],
      };
    }
    if (soBorda(impeditivas)) {
      return { ...base(this), status: 'atencao', resumo: 'Sobreposição de borda com terra indígena.', detalhes: [...detalhes, AVISO_BORDA], dossie: 'contestacao' };
    }
    return {
      ...base(this),
      status: 'impedimento',
      resumo: 'Imóvel com área dentro de terra indígena homologada, regularizada ou reserva.',
      detalhes,
      caminhos: [
        {
          titulo: 'Proponente do próprio povo',
          descricao: 'O impedimento não se aplica quando o proponente pertence ao povo ou comunidade que ocupa a terra indígena.',
          norma: norma('MCR 2-9-7', 'res5193'),
        },
      ],
      dossie: 'plano_de_saida',
    };
  },
};

export const regraQuilombola: Regra = {
  id: 'quilombola',
  titulo: 'Territórios quilombolas',
  pergunta: 'O imóvel está dentro de território quilombola titulado?',
  normas: [norma('MCR 2-9-8', 'res5268'), norma('MCR 2-9-9', 'res5193')],
  fontes: ['incra_quilombolas'],
  avaliar(ev) {
    const aberto = sobreposicaoSimples(this, ev.quilombolas, 'territórios quilombolas titulados');
    if (!Array.isArray(aberto)) return aberto;
    const lista = ev.quilombolas!;
    const detalhes = lista.map((q) => `${q.nome}: ${ha(q.areaHa)} dentro do imóvel.`);
    if (soBorda(lista)) {
      return { ...base(this), status: 'atencao', resumo: 'Sobreposição de borda com território quilombola.', detalhes: [...detalhes, AVISO_BORDA], dossie: 'contestacao' };
    }
    return {
      ...base(this),
      status: 'impedimento',
      resumo: 'Imóvel com área dentro de território quilombola titulado.',
      detalhes,
      caminhos: [
        {
          titulo: 'Proponente da própria comunidade',
          descricao: 'O impedimento não se aplica quando o proponente pertence à comunidade quilombola onde está o empreendimento.',
          norma: norma('MCR 2-9-9', 'res5193'),
        },
      ],
      dossie: 'plano_de_saida',
    };
  },
};

const FIM_EXCECAO_ITEM_12 = '2027-06-30';
const INICIO_LIMITE_20HA = '2025-01-02';

/** Critério de área do MCR 2-9-12 "g" e "h". */
export function criterioAreaEmbargo(ev: Evidencias): { atende: boolean | null; texto: string } {
  const area = ev.imovel.areaHa;
  const embargos = ev.embargos ?? [];
  if (!area || embargos.some((e) => e.areaHa == null)) {
    return { atende: null, texto: 'Não foi possível calcular: falta a área do imóvel ou a área embargada.' };
  }
  const embargada = embargos.reduce((soma, e) => soma + (e.areaHa ?? 0), 0);
  // Sem data, aplica o limite mais restritivo (alínea "h").
  const semData = embargos.some((e) => e.dataEmbargo == null);
  const recente = semData || embargos.some((e) => e.dataEmbargo! >= INICIO_LIMITE_20HA);
  const limite = recente ? Math.min(area * 0.05, 20) : area * 0.05;
  const regra = recente ? '5% do imóvel ou 20 ha, o que for menor' : '5% do imóvel';
  const atende = embargada <= limite;
  return {
    atende,
    texto:
      `Área embargada de ${ha(embargada)} ${atende ? 'dentro' : 'acima'} do limite de ${ha(limite)} (${regra}). ` +
      'O limite considera a data do termo de embargo; confirme a data da notificação no processo.',
  };
}

export const regraEmbargo: Regra = {
  id: 'embargo',
  titulo: 'Embargos ambientais',
  pergunta: 'O imóvel tem embargo registrado na lista do Ibama?',
  normas: [
    norma('MCR 2-9-10', 'res5193'),
    norma('MCR 2-9-11', 'res5193'),
    norma('MCR 2-9-12', 'res5193'),
    norma('MCR 2-9-13', 'res5193'),
  ],
  fontes: ['ibama_embargos'],
  avaliar(ev, dataReferencia) {
    const embargos = ev.embargos;
    if (embargos == null) return naoVerificado(this, 'A lista de embargos do Ibama não foi consultada.');
    if (embargos.length === 0) {
      return { ...base(this), status: 'sem_impedimento', resumo: 'Nenhum embargo do Ibama encontrado no imóvel.' };
    }
    const detalhes = embargos.map(
      (e) =>
        `Termo ${e.numero}${e.areaHa != null ? `: ${ha(e.areaHa)}` : ''}${e.dataEmbargo ? `, de ${dataBr(e.dataEmbargo)}` : ''}${e.descricao ? ` — ${e.descricao}` : ''}.`,
    );
    detalhes.push(
      'O item 10 alcança embargo decorrente de uso econômico de área desmatada ilegalmente. Confira o motivo no termo de embargo.',
    );
    const caminhos: Caminho[] = [
      {
        titulo: 'Crédito para recuperar a área embargada',
        descricao: 'Financiamento de investimento com finalidade exclusiva de recuperar a vegetação nativa da área embargada.',
        norma: norma('MCR 2-9-11', 'res5193'),
        requisitos: [
          'Projeto técnico de recuperação protocolado no órgão autuante',
          'Comprovante de pagamento das multas vigentes referentes aos embargos',
        ],
      },
    ];
    if (dataReferencia <= FIM_EXCECAO_ITEM_12) {
      caminhos.push({
        titulo: 'Exceção temporária do item 12 (até 30/6/2027)',
        descricao: 'Financiamento fora da área embargada, cumprindo todos os requisitos ao mesmo tempo.',
        norma: norma('MCR 2-9-12', 'res5193'),
        requisitos: [
          'Multas vigentes dos embargos pagas',
          'Projeto de recuperação protocolado, com início em até 6 meses após a contratação',
          'Área embargada isolada (cerca ou medida equivalente)',
          'Sem autuação por descumprimento de embargo na lista do Ibama',
          'Recursos sem uso na área embargada, que fica sem atividade agropecuária durante o contrato',
          'CAR ativo e na condição "aguardando análise", sem pendência documental',
          'Sem atividade agropecuária em reserva legal e APP',
          'Área embargada dentro do limite de 5% do imóvel (ou 5%/20 ha para notificações desde 2/1/2025)',
        ],
        verificacao: criterioAreaEmbargo(ev),
      });
    }
    if (ev.imovel.usoColetivo) {
      caminhos.push({
        titulo: 'CAR de perímetro coletivo',
        descricao: 'Em assentamentos, povos tradicionais e irrigação pública, o impedimento alcança só a área embargada e o proponente responsável pelo embargo.',
        norma: norma('MCR 2-9-13', 'res5193'),
      });
    }
    return {
      ...base(this),
      status: 'impedimento',
      resumo: `${embargos.length === 1 ? 'Um embargo encontrado' : `${embargos.length} embargos encontrados`} na lista do Ibama.`,
      detalhes,
      caminhos,
      dossie: 'plano_de_saida',
    };
  },
};

export const regraFlorestaPublica: Regra = {
  id: 'floresta-publica',
  titulo: 'Florestas públicas não destinadas',
  pergunta: 'O imóvel está dentro de Floresta Pública Tipo B?',
  normas: [norma('MCR 2-9-14', 'res5193'), norma('MCR 2-9-15', 'res5268')],
  fontes: ['sfb_cnfp'],
  avaliar(ev) {
    const aberto = sobreposicaoSimples(this, ev.florestasTipoB, 'Florestas Públicas Tipo B do CNFP');
    if (!Array.isArray(aberto)) return aberto;
    const lista = ev.florestasTipoB!;
    const detalhes = lista.map((f) => `${f.nome}: ${ha(f.areaHa)} dentro do imóvel.`);
    if (soBorda(lista)) {
      return { ...base(this), status: 'atencao', resumo: 'Sobreposição de borda com Floresta Pública Tipo B.', detalhes: [...detalhes, AVISO_BORDA], dossie: 'contestacao' };
    }
    const mf = ev.imovel.modulosFiscais;
    return {
      ...base(this),
      status: 'impedimento',
      resumo: 'Imóvel com área dentro de Floresta Pública Tipo B (não destinada).',
      detalhes,
      caminhos: [
        {
          titulo: 'Imóvel com título de propriedade',
          descricao: 'A vedação não se aplica a imóvel com título, desde que a vegetação nativa seja mantida na floresta pública.',
          norma: norma('MCR 2-9-15', 'res5268'),
        },
        {
          titulo: 'Imóvel de até 15 módulos fiscais',
          descricao: 'Não se aplica se a área do empreendimento estiver fora da floresta pública e a vegetação nativa for mantida.',
          norma: norma('MCR 2-9-15', 'res5268'),
          verificacao:
            mf == null
              ? { atende: null, texto: 'Informe os módulos fiscais do imóvel para checar o limite.' }
              : { atende: mf <= 15, texto: `O imóvel tem ${mf.toLocaleString('pt-BR')} módulos fiscais.` },
        },
      ],
      dossie: 'plano_de_saida',
    };
  },
};

/** Início da exigência do MCR 2-9-17, conforme a Resolução CMN 5.303/2026. */
export function inicioExigenciaProdes(ev: Evidencias): string | null {
  if (ev.imovel.usoColetivo) return '2028-01-03';
  const mf = ev.imovel.modulosFiscais;
  if (mf == null) return null;
  if (mf > 15) return '2027-01-04';
  if (mf > 4) return '2027-07-01';
  return '2028-01-03';
}

export const regraProdes: Regra = {
  id: 'prodes',
  titulo: 'Supressão de vegetação após 31/7/2019',
  pergunta: 'O CAR consta na lista do MMA de supressão de vegetação nativa (Prodes)?',
  normas: [
    norma('MCR 2-9-17', 'res5303'),
    norma('MCR 2-9-17-A', 'res5303'),
    norma('MCR 2-9-18', 'res5303'),
  ],
  fontes: ['mma_lista_mcr'],
  avaliar(ev, dataReferencia) {
    const lista = ev.listaMma;
    if (lista == null) return naoVerificado(this, 'A lista do MMA não foi consultada.');
    const inicio = inicioExigenciaProdes(ev);
    const quando = inicio
      ? `Para este imóvel, a verificação passa a ser exigida em ${dataBr(inicio)}.`
      : 'Informe os módulos fiscais para saber quando a verificação passa a ser exigida (4/1/2027, 1/7/2027 ou 3/1/2028).';

    if (!lista.consta) {
      const resultado: ResultadoItem = {
        ...base(this),
        status: 'sem_impedimento',
        resumo: 'O CAR não consta na lista do MMA.',
        detalhes: [quando],
      };
      const mf = ev.imovel.modulosFiscais;
      if (mf == null || mf <= 4) {
        resultado.detalhes.push('A lista atual do MMA cobre imóveis acima de 4 módulos fiscais e CAR suspenso ou cancelado.');
      }
      return resultado;
    }

    const supressao = `${lista.areaSupressaoHa != null ? ` com ${ha(lista.areaSupressaoHa)} de supressão após 31/7/2019` : ''}${lista.bioma ? ` (bioma ${lista.bioma})` : ''}`;

    // O MMA também lista CAR suspenso ou cancelado com qualquer supressão; abaixo do
    // limite do bioma, o item 17 não se aplica (campo "dentro_criterio" = Sim).
    if (lista.acimaDoCriterio === false) {
      return {
        ...base(this),
        status: 'sem_impedimento',
        resumo: 'Supressão abaixo do limite do bioma: o item 17 não se aplica.',
        detalhes: [
          `Consta na lista do MMA${supressao}, abaixo do critério${lista.criterio ? ` (${lista.criterio})` : ''}.`,
          'O imóvel aparece na lista por causa da situação do CAR; veja o item do Cadastro Ambiental Rural.',
        ],
      };
    }

    const detalhes = [
      `Consta na lista${supressao}, acima do limite do bioma${lista.criterio ? ` (${lista.criterio})` : ''}.`,
      quando,
      'Segundo o MMA, a sobreposição entre o Prodes e o CAR não configura, por si só, presunção de ilegalidade ou infração ambiental.',
      'O item 18 condiciona o crédito com recursos controlados (MCR 6-1-2) e direcionados (MCR 6-7-7-"a").',
    ];
    const caminhos: Caminho[] = [
      {
        titulo: 'Autorização de supressão',
        descricao: 'ASV conforme a Resolução Conama 510/2025, UAS ou ato equivalente do órgão ambiental competente.',
        norma: norma('MCR 2-9-18', 'res5303'),
        requisitos: ['UAS ou ato equivalente: só se expedido antes de 15/3/2026', 'ASV emitida antes de 15/9/2025 também pode ser aceita'],
      },
      {
        titulo: 'PRAD ou Termo de Compromisso do PRA',
        descricao: 'Comprovação de execução, ou de que está em execução, aprovada pelo órgão ambiental competente.',
        norma: norma('MCR 2-9-18', 'res5303'),
      },
      {
        titulo: 'TAC com o Ministério Público',
        descricao: 'Termo de Ajustamento de Conduta para regularização ambiental.',
        norma: norma('MCR 2-9-18', 'res5303'),
      },
      {
        titulo: 'Termo de Compromisso Ambiental com o órgão estadual',
        descricao: 'Para regularizar supressão após 31/7/2019, nos termos do art. 79-A da Lei 9.605/1998.',
        norma: norma('MCR 2-9-18', 'res5303'),
      },
      {
        titulo: 'Laudo de sensoriamento remoto do banco',
        descricao: 'Laudo sob responsabilidade da instituição financeira atestando ausência de desmatamento após 31/7/2019. O dossiê do Apto Rural reúne as imagens para subsidiar esse pedido.',
        norma: norma('MCR 2-9-18', 'res5303'),
      },
      {
        titulo: 'Contestar o dado do Prodes no Inpe',
        descricao: `Se o alerta estiver errado, a contestação é feita pelo mecanismo do Inpe no Programa BiomasBR (${CONTESTACAO_PRODES_URL}).`,
      },
    ];
    const vigente = inicio != null && dataReferencia >= inicio;
    return {
      ...base(this),
      status: vigente ? 'impedimento' : 'atencao',
      resumo: vigente
        ? 'Consta na lista do MMA: o crédito depende de um dos documentos do item 18.'
        : 'Consta na lista do MMA. A exigência ainda não vale para este imóvel: prepare a documentação.',
      detalhes,
      caminhos,
      dossie: 'contestacao',
    };
  },
};

/** Regras na ordem em que aparecem para o técnico. */
export const REGRAS: Regra[] = [
  regraCar,
  regraEmbargo,
  regraProdes,
  regraTerraIndigena,
  regraUnidadeConservacao,
  regraQuilombola,
  regraFlorestaPublica,
  regraTrabalhoEscravo,
];
