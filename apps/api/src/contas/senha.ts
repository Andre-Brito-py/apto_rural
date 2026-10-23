import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (senha: string, sal: Buffer, tamanho: number, opcoes: object) => Promise<Buffer>;

// Parâmetros do scrypt (N=2^15, r=8, p=1): ~32 MB e algumas dezenas de ms por senha.
const OPCOES = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const TAMANHO = 64;

export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await scryptAsync(senha.normalize('NFKC'), sal, TAMANHO, OPCOES);
  return `scrypt$${sal.toString('base64')}$${hash.toString('base64')}`;
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const [alg, sal, hash] = guardado.split('$');
  if (alg !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const obtido = await scryptAsync(senha.normalize('NFKC'), Buffer.from(sal, 'base64'), esperado.length, OPCOES);
  return timingSafeEqual(esperado, obtido);
}

/** Token de sessão: vai no cookie; no banco fica só o SHA-256 dele. */
export function novoTokenSessao(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
