import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { config } from '../config.js';

/**
 * Entrar com a conta Google (docs/login-google.md). O site recebe do Google um "ID token"
 * (JWT) e a API confere, como manda a documentação oficial
 * (developers.google.com/identity/gsi/web/guides/verify-google-id-token):
 * - a assinatura, com as chaves públicas do Google;
 * - aud = o ID do cliente do Apto Rural;
 * - iss = accounts.google.com ou https://accounts.google.com;
 * - exp: o token não venceu.
 * A conta é identificada pelo "sub", não pelo e-mail (o e-mail de uma conta Google muda).
 */
export interface IdentidadeGoogle {
  sub: string;
  email: string;
  emailVerificado: boolean;
  nome: string;
  /**
   * O Google responde pelo e-mail: @gmail.com, ou e-mail verificado de uma conta Google
   * Workspace (com "hd"). Fora disso, quem tem conta com senha confirma a senha antes de ligar.
   */
  autoritativo: boolean;
}

const EMISSORES = ['accounts.google.com', 'https://accounts.google.com'];

export class VerificadorGoogle {
  private chaves: JWTVerifyGetKey;

  constructor(enderecoChaves = config.google.certsUrl) {
    // Guarda as chaves e busca de novo quando o Google troca (o jose respeita o cache).
    this.chaves = createRemoteJWKSet(new URL(enderecoChaves));
  }

  /** A identidade do token, ou null se ele não vale (assinatura, cliente, emissor ou validade). */
  async verificar(token: string, clienteId: string): Promise<IdentidadeGoogle | null> {
    try {
      const { payload: p } = await jwtVerify(token, this.chaves, { issuer: EMISSORES, audience: clienteId });
      const email = typeof p.email === 'string' ? p.email.toLowerCase() : '';
      if (!p.sub || !email) return null;
      const emailVerificado = p.email_verified === true;
      const nome = typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 120) : email.split('@')[0]!;
      return {
        sub: p.sub,
        email,
        emailVerificado,
        nome,
        autoritativo: emailVerificado && (email.endsWith('@gmail.com') || typeof p.hd === 'string'),
      };
    } catch {
      return null;
    }
  }
}
