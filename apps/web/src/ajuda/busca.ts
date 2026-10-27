import { PERGUNTAS, type Pergunta } from './conteudo';

/**
 * Busca da Central de ajuda, toda no navegador (sem IA e sem chamar a API): compara as
 * palavras da dúvida com a pergunta, as palavras-chave e a resposta de cada item.
 */

/** Minúsculas, sem acento e sem pontuação. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const VAZIAS = new Set(
  'a o as os e de da do das dos que como eu meu minha meus minhas um uma uns umas para pra por no na nos nas se com em ao aos voce voces ele ela isso esse essa este esta qual quais quando onde porque pq tem ter ja nao sim mais muito ou ate sobre tenho posso preciso quero fazer faco consigo seu sua lo la'.split(
    ' ',
  ),
);

/** Palavras que contam, com o plural simples tirado ("creditos" vira "credito"). */
export function palavrasDe(texto: string): string[] {
  return normalizar(texto)
    .split(' ')
    .filter((p) => p.length > 1 && !VAZIAS.has(p))
    .map((p) => (p.length > 4 && p.endsWith('s') ? p.slice(0, -1) : p));
}

function parecidas(a: string, b: string): boolean {
  if (a === b) return true;
  // "consultar" acha "consulta"; "senha" não acha "se".
  return Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a));
}

interface Indice {
  pergunta: Pergunta;
  titulo: string[];
  chaves: string[];
  frases: string[];
  corpo: string[];
}

let indice: Indice[] | null = null;

function montarIndice(): Indice[] {
  return PERGUNTAS.map((p) => ({
    pergunta: p,
    titulo: palavrasDe(p.pergunta),
    chaves: (p.palavras ?? []).flatMap(palavrasDe),
    frases: (p.palavras ?? []).map(normalizar).filter((f) => f.includes(' ')),
    corpo: palavrasDe(p.resposta.join(' ')),
  }));
}

export interface Achado {
  pergunta: Pergunta;
  pontos: number;
}

/** As perguntas que mais combinam com a dúvida, da melhor para a pior. */
export function buscar(duvida: string, limite = 4): Achado[] {
  indice ??= montarIndice();
  const termos = [...new Set(palavrasDe(duvida))];
  if (!termos.length) return [];
  const frase = normalizar(duvida);
  const achados: Achado[] = [];
  for (const item of indice) {
    let pontos = 0;
    let casaram = 0;
    for (const t of termos) {
      const peso = item.chaves.some((c) => parecidas(c, t)) ? 3 : item.titulo.some((c) => parecidas(c, t)) ? 3 : item.corpo.some((c) => parecidas(c, t)) ? 1 : 0;
      if (peso) casaram++;
      pontos += peso;
    }
    for (const f of item.frases) if (frase.includes(f)) pontos += 4;
    // Quem casa com mais palavras da dúvida passa na frente.
    pontos += (casaram / termos.length) * 2;
    if (pontos >= 3) achados.push({ pergunta: item.pergunta, pontos });
  }
  return achados.sort((a, b) => b.pontos - a.pontos).slice(0, limite);
}

/** Sugestões para a tela aberta (ex.: no lote, as dúvidas do lote primeiro). */
export function sugestoesDaTela(caminho: string, limite = 4): Pergunta[] {
  const casa = (t: string) => (t === '/' ? caminho === '/' : caminho.startsWith(t));
  // A tela que vem primeiro em "telas" é a principal da pergunta: essas aparecem antes.
  const daTela = PERGUNTAS.map((p, i) => ({ p, i, ordem: p.telas?.findIndex(casa) ?? -1 }))
    .filter((x) => x.ordem >= 0)
    .sort((a, b) => a.ordem - b.ordem || a.i - b.i)
    .map((x) => x.p);
  const base = daTela.length ? daTela : PERGUNTAS.filter((p) => p.categoria === 'comecar');
  return base.slice(0, limite);
}

export function perguntasDaCategoria(categoria: Pergunta['categoria']): Pergunta[] {
  return PERGUNTAS.filter((p) => p.categoria === categoria);
}

export function relacionadas(p: Pergunta, limite = 3): Pergunta[] {
  return PERGUNTAS.filter((x) => x.categoria === p.categoria && x.id !== p.id).slice(0, limite);
}
