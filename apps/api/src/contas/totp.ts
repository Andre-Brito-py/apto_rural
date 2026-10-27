import { createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * Verificação em duas etapas por TOTP (RFC 6238): o mesmo código de 6 dígitos que o Google
 * Authenticator, o Microsoft Authenticator e similares mostram. HMAC-SHA1, intervalos de
 * 30 s, como todos esses aplicativos esperam. Sem biblioteca: são poucas linhas.
 */
const PASSO_S = 30;
const DIGITOS = 6;
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(bytes: Buffer): string {
  let bits = 0;
  let valor = 0;
  let saida = '';
  for (const b of bytes) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}

export function deBase32(texto: string): Buffer {
  const limpo = texto.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let valor = 0;
  const saida: number[] = [];
  for (const c of limpo) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) throw new Error('Segredo em base32 inválido.');
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      saida.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(saida);
}

/** Segredo novo: 20 bytes (160 bits), o tamanho recomendado para HMAC-SHA1. */
export const novoSegredo = () => base32(randomBytes(20));

export const passoAtual = (agoraMs = Date.now()) => Math.floor(agoraMs / 1000 / PASSO_S);

export function codigoDoPasso(segredo: string, passo: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const hmac = createHmac('sha1', deBase32(segredo)).update(contador).digest();
  const deslocamento = hmac[hmac.length - 1]! & 15;
  const numero = (hmac.readUInt32BE(deslocamento) & 0x7fffffff) % 10 ** DIGITOS;
  return String(numero).padStart(DIGITOS, '0');
}

/**
 * Confere o código aceitando um intervalo antes e um depois (relógio do celular um pouco
 * adiantado ou atrasado). Devolve o passo que bateu, para não aceitar o mesmo código de
 * novo, ou null.
 */
export function conferirCodigo(segredo: string, codigo: string, agoraMs = Date.now()): number | null {
  const digitado = codigo.replace(/\s/g, '');
  if (!/^\d{6}$/.test(digitado)) return null;
  const agora = passoAtual(agoraMs);
  for (const passo of [agora, agora - 1, agora + 1]) if (codigoDoPasso(segredo, passo) === digitado) return passo;
  return null;
}

/** Endereço que o aplicativo autenticador lê pelo QR. */
export function enderecoAutenticador(segredo: string, conta: string, emissor = 'Apto Rural'): string {
  const rotulo = encodeURIComponent(`${emissor}:${conta}`);
  return `otpauth://totp/${rotulo}?secret=${segredo}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=${DIGITOS}&period=${PASSO_S}`;
}

/** 10 códigos de recuperação no formato XXXX-XXXX (sem 0/O nem 1/I, para não confundir). */
export function novosCodigosRecuperacao(): string[] {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 10 }, () => {
    const b = randomBytes(8);
    const c = Array.from(b, (n) => letras[n % letras.length]).join('');
    return `${c.slice(0, 4)}-${c.slice(4)}`;
  });
}

/** Como o código de recuperação fica no banco: só o SHA-256 do texto normalizado. */
export const hashRecuperacao = (codigo: string) =>
  createHash('sha256').update(codigo.toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');

/** Parece um código de recuperação (e não os 6 dígitos do aplicativo)? */
export const pareceRecuperacao = (codigo: string) => /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(codigo.trim());
