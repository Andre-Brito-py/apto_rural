import { formatarCar, normalizarCar, type SituacaoCar } from '@apto/regras';

/** Máximo de imóveis por lote: o bastante para um escritório, sem deixar a página aberta por horas. */
export const LIMITE_LOTE = 200;

export interface LinhaLote {
  /** Linha da planilha (como o Excel mostra, contando o cabeçalho). */
  linha: number;
  car: string;
  apelido?: string;
  situacaoCar?: SituacaoCar;
  modulosFiscais?: number;
}

export interface LeituraPlanilha {
  linhas: LinhaLote[];
  /** Linhas ignoradas ou com algum dado descartado, para o técnico corrigir. */
  problemas: { linha: number; texto: string }[];
}

const SITUACOES: Record<string, SituacaoCar> = {
  ativo: 'ativo',
  at: 'ativo',
  pendente: 'pendente',
  pe: 'pendente',
  suspenso: 'suspenso',
  su: 'suspenso',
  cancelado: 'cancelado',
  ca: 'cancelado',
};

/**
 * O Excel no Brasil costuma salvar CSV em Windows-1252 (o "ANSI"), não em UTF-8.
 * Tenta UTF-8 primeiro; se os bytes não forem UTF-8 válido, lê como Windows-1252,
 * para "Fazenda São João" não virar "Fazenda S�o Jo�o".
 */
export async function textoDaPlanilha(arquivo: File): Promise<string> {
  const bytes = await arquivo.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Separa as células de um CSV (aspas, aspas duplicadas e quebra de linha dentro de aspas). */
function celulas(texto: string, separador: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        celula += '"';
        i++;
      } else if (c === '"') aspas = false;
      else celula += c;
    } else if (c === '"') aspas = true;
    else if (c === separador) {
      linha.push(celula);
      celula = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(celula);
      linhas.push(linha);
      linha = [];
      celula = '';
    } else celula += c;
  }
  if (celula !== '' || linha.length > 0) {
    linha.push(celula);
    linhas.push(linha);
  }
  return linhas;
}

/** Ponto e vírgula (Excel em português), vírgula ou tabulação: o que mais aparece na primeira linha. */
function separadorDe(texto: string): string {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? '';
  const contar = (s: string) => primeira.split(s).length - 1;
  return [';', '\t', ','].reduce((melhor, s) => (contar(s) > contar(melhor) ? s : melhor), ';');
}

const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * Lê a planilha do lote. Aceita cabeçalho com nomes livres ("CAR", "Código do CAR",
 * "Apelido", "Nome da fazenda", "Situação", "Módulos fiscais"…) ou só uma coluna com os códigos.
 */
export function lerPlanilha(texto: string): LeituraPlanilha {
  const tabela = celulas(texto.replace(/^﻿/, ''), separadorDe(texto)).filter((l) => l.some((c) => c.trim() !== ''));
  const problemas: LeituraPlanilha['problemas'] = [];
  if (tabela.length === 0) return { linhas: [], problemas: [{ linha: 1, texto: 'A planilha está vazia.' }] };

  const temCabecalho = !tabela[0]!.some((c) => normalizarCar(c));
  const cabecalho = temCabecalho ? tabela[0]!.map(semAcento) : [];
  const coluna = (padrao: RegExp) => cabecalho.findIndex((c) => padrao.test(c));
  // Sem cabeçalho (ou sem coluna com nome de CAR): a coluna com mais códigos válidos.
  let colCar = coluna(/\bcar\b|codigo|cod_imovel|recibo/);
  if (colCar < 0) {
    const largura = Math.max(...tabela.map((l) => l.length));
    const contagem = Array.from({ length: largura }, (_, i) => tabela.filter((l) => normalizarCar(l[i] ?? '')).length);
    colCar = contagem.indexOf(Math.max(...contagem));
  }
  const colApelido = coluna(/apelido|fazenda|nome|imovel|propriedade/);
  const colSituacao = coluna(/situa|status/);
  const colModulos = coluna(/modulo|\bmf\b/);

  const vistos = new Set<string>();
  const linhas: LinhaLote[] = [];
  tabela.slice(temCabecalho ? 1 : 0).forEach((l, i) => {
    const linha = i + (temCabecalho ? 2 : 1);
    const bruto = (l[colCar] ?? '').trim();
    const car = normalizarCar(bruto);
    if (!car) {
      problemas.push({ linha, texto: bruto ? `Código do CAR inválido: "${bruto.slice(0, 60)}".` : 'Linha sem código do CAR.' });
      return;
    }
    if (vistos.has(car)) {
      problemas.push({ linha, texto: `${formatarCar(car)} repetido: consultado uma vez só.` });
      return;
    }
    if (linhas.length >= LIMITE_LOTE) {
      if (!problemas.some((p) => p.texto.startsWith('Limite')))
        problemas.push({ linha, texto: `Limite de ${LIMITE_LOTE} imóveis por lote: a partir daqui, envie em outra planilha.` });
      return;
    }
    vistos.add(car);
    const item: LinhaLote = { linha, car };

    const apelido = colApelido >= 0 ? (l[colApelido] ?? '').trim() : '';
    if (apelido) item.apelido = apelido.slice(0, 80);

    const situacao = colSituacao >= 0 ? semAcento(l[colSituacao] ?? '') : '';
    if (situacao) {
      if (SITUACOES[situacao]) item.situacaoCar = SITUACOES[situacao];
      else if (!/^(nao sei|-|)$/.test(situacao)) problemas.push({ linha, texto: `Situação "${l[colSituacao]}" não reconhecida: ignorada.` });
    }

    const modulos = colModulos >= 0 ? (l[colModulos] ?? '').trim() : '';
    if (modulos) {
      // "8,5" (Excel em português) ou "8.5".
      const n = Number(modulos.includes(',') ? modulos.replace(/\./g, '').replace(',', '.') : modulos);
      if (n > 0 && Number.isFinite(n)) item.modulosFiscais = n;
      else problemas.push({ linha, texto: `Módulos fiscais "${modulos}" inválido: ignorado.` });
    }
    linhas.push(item);
  });
  return { linhas, problemas };
}

/** Planilha-modelo para baixar (exemplo com código fictício). */
export const MODELO_PLANILHA =
  'car;apelido;situacao_car;modulos_fiscais\r\n' +
  'MT-0000000-0000.0000.0000.0000.0000.0000.0000.0001;Fazenda Exemplo (apague esta linha);ativo;8,5\r\n';

/** Monta um CSV que o Excel em português abre direto (ponto e vírgula e marca de UTF-8). */
export function montarCsv(linhas: (string | number | undefined)[][]): Blob {
  const celula = (v: string | number | undefined) => {
    const s = v == null ? '' : String(v);
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return new Blob(['﻿' + linhas.map((l) => l.map(celula).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

export function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
