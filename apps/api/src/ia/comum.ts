/**
 * Peças da conferência que todas as funções de IA usam (docs/ia.md): o que não pode sair
 * no texto e como conferir se um número veio dos fatos ou foi inventado.
 */

/** CPF, CNPJ, código do CAR e e-mail. */
export const PADROES_PESSOAIS: RegExp[] = [
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, // CPF
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, // CNPJ
  /\b[A-Z]{2}-?\d{7}-?(?:[0-9A-F]{4}\.?){7}[0-9A-F]{4}\b/gi, // código do CAR
  /[^\s@]+@[^\s@]+\.[^\s@]+/g, // e-mail
];

/** Tira CPF, CNPJ, código do CAR e e-mail de um texto. */
export function semDadosPessoais(texto: string, limite = 400): string {
  return PADROES_PESSOAIS.reduce((t, p) => t.replace(p, '[omitido]'), texto).slice(0, limite);
}

/** Tem CPF, CNPJ, CAR ou e-mail? */
export const temDadoPessoal = (texto: string) => PADROES_PESSOAIS.some((p) => new RegExp(p.source, p.flags.replace('g', '')).test(texto));

/** Sem acento e em minúsculas, para procurar expressões. */
export const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Promessas que nenhum texto do Apto Rural pode fazer: a decisão é sempre do banco. */
export const PROIBIDAS_SEMPRE = ['garantid', 'aprovad', 'com certeza', 'pode ficar tranquilo', 'sem nenhum risco', 'nao se preocupe'];

/** A primeira expressão proibida que aparece no texto, ou undefined. */
export const expressaoProibida = (texto: string, proibidas: string[]) => {
  const t = normalizar(texto);
  return proibidas.find((p) => t.includes(p));
};

/** Números do texto (só os dígitos: "4,43" e "4.43" viram "443"). */
export const numeros = (s: string) => [...s.matchAll(/\d+(?:[.,/]\d+)*/g)].map((m) => m[0].replace(/\D/g, ''));

/**
 * Números que o texto pode usar: os dos fatos inteiros ("4,43", "18/09/2024") e também as
 * partes deles, sem zero à esquerda ("18", "9", "2024"), porque a IA escreve datas por
 * extenso ("18 de setembro de 2024").
 */
export function numerosPermitidos(fatos: string): Set<string> {
  const todos = new Set<string>();
  for (const m of fatos.matchAll(/\d+(?:[.,/]\d+)*/g)) {
    todos.add(m[0].replace(/\D/g, ''));
    for (const parte of m[0].split(/[.,/]/)) todos.add(String(Number(parte)));
  }
  return todos;
}

/** O primeiro número do texto que não veio dos fatos (contagens pequenas, até `ate`, passam). */
export function numeroInventado(texto: string, permitidos: Set<string>, ate = 0): string | undefined {
  return numeros(texto).find((n) => !permitidos.has(n) && !permitidos.has(String(Number(n))) && !(Number(n) >= 1 && Number(n) <= ate));
}

/** Lista, título ou negrito em Markdown (o texto vai para e-mail, tela e impressão: sem formatação). */
export const temFormatacao = (texto: string) => /[*#_`]|^\s*[-•]/m.test(texto);
