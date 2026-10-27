// Sobe o Apto Rural para os testes de navegador (docs/testes-navegador.md):
//   1. recria o banco apto_e2e do zero (nunca mexe no banco de desenvolvimento);
//   2. aplica as migrações;
//   3. sobe a API já servindo o site compilado, num endereço só, como em produção.
// E-mails vão por SMTP para o Mailpit, de onde os testes leem os links.
// Antes: npm run build (na raiz) e o Mailpit no ar (docker compose -f apps/e2e/docker-compose.yml up -d).
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const base = process.env.E2E_BANCO ?? 'postgres://apto:apto@127.0.0.1:5433';
const banco = `${base}/apto_e2e`;
const porta = process.env.E2E_PORTA ?? '3400';

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
};
for (const chave of ['ASAAS_API_KEY', 'IA_URL', 'CHAVE_SEGREDOS', 'VIGIA_URL_SITE']) delete env[chave];

const rodar = (arquivo) => spawn(process.execPath, [join(raiz, 'apps', 'api', 'dist', arquivo)], { env, stdio: 'inherit' });

await new Promise((ok, falha) => rodar('migrar.js').on('exit', (c) => (c === 0 ? ok() : falha(new Error(`migrar saiu com ${c}`)))));
const api = rodar('index.js');
api.on('exit', (c) => process.exit(c ?? 0));
for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => api.kill(sinal));
