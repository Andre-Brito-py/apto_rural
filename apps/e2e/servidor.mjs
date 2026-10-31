// Sobe o Apto Rural para os testes de navegador (docs/testes-navegador.md):
//   1. recria o banco apto_e2e do zero (nunca mexe no banco de desenvolvimento);
//   2. aplica as migrações;
//   3. sobe a API já servindo o site compilado, num endereço só, como em produção.
// E-mails vão por SMTP para o Mailpit, de onde os testes leem os links.
// Antes: npm run build (na raiz) e o Mailpit no ar (docker compose -f apps/e2e/docker-compose.yml up -d).
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import pg from 'pg';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const base = process.env.E2E_BANCO ?? 'postgres://apto:apto@127.0.0.1:5433';
const banco = `${base}/apto_e2e`;
const porta = process.env.E2E_PORTA ?? '3400';

// Google falso (docs/login-google.md): chaves de teste no formato do Google (/certs) e
// /token?sub=&email=&name= devolve um ID token assinado com elas. A API dos testes confere
// os tokens com estas chaves (GOOGLE_CERTS_URL, recusado em produção).
const portaGoogle = process.env.E2E_GOOGLE_PORTA ?? '3401';
const CLIENTE_GOOGLE = '123456789012-testesdonavegador.apps.googleusercontent.com';
const chavesGoogle = await generateKeyPair('RS256');
const jwkGoogle = { ...(await exportJWK(chavesGoogle.publicKey)), kid: 'e2e', alg: 'RS256', use: 'sig' };
createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (url.pathname === '/certs') return res.end(JSON.stringify({ keys: [jwkGoogle] }));
  if (url.pathname === '/token') {
    const p = url.searchParams;
    const token = await new SignJWT({ email: p.get('email'), email_verified: p.get('verificado') !== '0', name: p.get('name') ?? 'Pessoa do Google' })
      .setProtectedHeader({ alg: 'RS256', kid: 'e2e' })
      .setSubject(p.get('sub') ?? 'sub-e2e')
      .setAudience(CLIENTE_GOOGLE)
      .setIssuer('https://accounts.google.com')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(chavesGoogle.privateKey);
    return res.end(JSON.stringify({ credential: token }));
  }
  res.statusCode = 404;
  res.end('{}');
}).listen(Number(portaGoogle), '127.0.0.1');

const admin = new pg.Client({ connectionString: `${base}/postgres` });
await admin.connect();
await admin.query('DROP DATABASE IF EXISTS apto_e2e WITH (FORCE)');
await admin.query('CREATE DATABASE apto_e2e');
await admin.end();

const env = {
  ...process.env,
  NODE_ENV: 'development',
  DATABASE_URL: banco,
  PORT: porta,
  WEB_DIST: join(raiz, 'apps', 'web', 'dist'),
  WEB_ORIGIN: `http://127.0.0.1:${porta}`,
  APTO_DEMO: '1', // CARs de exemplo e pagamento simulado
  DOCUMENTO_HASH_SECRET: 'segredo-dos-testes-de-navegador',
  ADMIN_EMAILS: 'admin@e2e.local',
  SMTP_HOST: process.env.E2E_SMTP_HOST ?? '127.0.0.1',
  SMTP_PORTA: process.env.E2E_SMTP_PORTA ?? '1025',
  SMTP_SEM_TLS: '1',
  EMAIL_REMETENTE: 'Apto Rural <nao-responda@e2e.local>',
  LOG_LEVEL: 'warn',
  // O botão do Google só aparece quando o teste liga o login pelo painel (google.spec.ts).
  GOOGLE_CERTS_URL: `http://127.0.0.1:${portaGoogle}/certs`,
};
for (const chave of ['ASAAS_API_KEY', 'IA_URL', 'CHAVE_SEGREDOS', 'VIGIA_URL_SITE', 'GOOGLE_CLIENT_ID']) delete env[chave];

const rodar = (arquivo) => spawn(process.execPath, [join(raiz, 'apps', 'api', 'dist', arquivo)], { env, stdio: 'inherit' });

await new Promise((ok, falha) => rodar('migrar.js').on('exit', (c) => (c === 0 ? ok() : falha(new Error(`migrar saiu com ${c}`)))));
const api = rodar('index.js');
api.on('exit', (c) => process.exit(c ?? 0));
for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => api.kill(sinal));
