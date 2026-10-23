import { createHmac } from 'node:crypto';
import { config } from './config.js';

/** Só dígitos; aceita CPF (11) ou CNPJ (14). Valida os dígitos verificadores. */
export function normalizarDocumento(entrada: string): string | null {
  const d = entrada.replace(/\D/g, '');
  if (d.length === 11 && cpfValido(d)) return d;
  if (d.length === 14 && cnpjValido(d)) return d;
  return null;
}

/** Hash com chave (HMAC-SHA256): o número em claro nunca é guardado. */
export function hashDocumento(documento: string): string {
  return createHmac('sha256', config.segredoDocumento).update(documento).digest('hex');
}

/**
 * Códigos a procurar no cadastro do MTE. Para CNPJ, inclui a raiz (8 dígitos):
 * a pessoa jurídica é a mesma em todas as filiais. Mesmo critério do coletor.
 */
export function hashesParaCadastro(documento: string): string[] {
  const docs = documento.length === 14 ? [documento, documento.slice(0, 8)] : [documento];
  return docs.map(hashDocumento);
}

function cpfValido(c: string): boolean {
  if (/^(\d)\1{10}$/.test(c)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(c[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

function cnpjValido(c: string): boolean {
  if (/^(\d)\1{13}$/.test(c)) return false;
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + Number(c[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}
