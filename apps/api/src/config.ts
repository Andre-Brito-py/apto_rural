const producao = process.env.NODE_ENV === 'production';

export const config = {
  producao,
  porta: Number(process.env.PORT ?? 3333),
  databaseUrl: process.env.DATABASE_URL,
  segredoDocumento: process.env.DOCUMENTO_HASH_SECRET ?? '',
  demo: process.env.APTO_DEMO === '1' && !producao,
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5180',
  asaas: {
    chave: process.env.ASAAS_API_KEY ?? '',
    ambiente: (process.env.ASAAS_AMBIENTE === 'producao' ? 'producao' : 'sandbox') as 'producao' | 'sandbox',
    tokenWebhook: process.env.ASAAS_WEBHOOK_TOKEN ?? '',
    /** Só para o ensaio de produção (deploy/ensaio): aponta para um Asaas falso. Recusado com ASAAS_AMBIENTE=producao. */
    url: process.env.ASAAS_URL || undefined,
  },
  sessaoDias: 30,
  /** Pasta do site já compilado. Em produção a API entrega o site no mesmo endereço. */
  webDist: process.env.WEB_DIST,
  /** E-mails com acesso ao painel /admin e que recebem os alertas de erro. */
  adminEmails: (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  /**
   * Chave que cifra os segredos guardados pelo painel (ex.: chave da OpenAI): 32 bytes
   * em hexadecimal (64 caracteres). Obrigatória em produção. Ver docs/ia.md.
   */
  chaveSegredos: process.env.CHAVE_SEGREDOS ?? '',
  /** Vigia do site (docs/backup-e-vigia.md). */
  vigia: {
    /** Endereço do sinal no serviço de alerta externo (ex.: https://hc-ping.com/…). Sem ele, ninguém de fora é avisado. */
    url: process.env.VIGIA_URL_SITE || undefined,
    /** Sinal do backup diário no mesmo serviço (outro "check"). */
    urlBackup: process.env.VIGIA_URL_BACKUP || undefined,
    /** Endereço que o vigia confere; o padrão é o endereço público do site. */
    endereco: process.env.VIGIA_ENDERECO || process.env.WEB_ORIGIN || 'http://localhost:5180',
    intervaloMin: Number(process.env.VIGIA_INTERVALO_MIN ?? 5),
  },
  /** Só para o ensaio de produção e testes: aponta para uma IA falsa. */
  iaUrl: process.env.IA_URL || undefined,
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    porta: Number(process.env.SMTP_PORTA ?? 587),
    usuario: process.env.SMTP_USUARIO || undefined,
    senha: process.env.SMTP_SENHA || undefined,
    remetente: process.env.EMAIL_REMETENTE ?? '',
    /** Só para os testes de navegador (Mailpit sem TLS). Recusado em produção. */
    semTls: process.env.SMTP_SEM_TLS === '1',
  },
};

if (config.databaseUrl && config.segredoDocumento.length < 16) {
  throw new Error('DOCUMENTO_HASH_SECRET precisa ter pelo menos 16 caracteres.');
}
if (producao) {
  if (!config.databaseUrl) throw new Error('Em produção, DATABASE_URL é obrigatório.');
  if (!config.asaas.chave || config.asaas.tokenWebhook.length < 32) {
    throw new Error('Em produção, ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN (32+ caracteres) são obrigatórios.');
  }
  if (!/^[0-9a-f]{64}$/i.test(config.chaveSegredos)) {
    throw new Error('Em produção, CHAVE_SEGREDOS é obrigatória: 64 caracteres hexadecimais (gere com: openssl rand -hex 32).');
  }
  if (config.smtp.semTls) throw new Error('SMTP_SEM_TLS (só para testes) não pode ser usado em produção.');
  if (config.asaas.url && config.asaas.ambiente === 'producao') {
    throw new Error('ASAAS_URL (Asaas falso do ensaio) não pode ser usado com ASAAS_AMBIENTE=producao.');
  }
  if (!config.smtp.host || !config.smtp.remetente) {
    throw new Error('Em produção, SMTP_HOST e EMAIL_REMETENTE são obrigatórios (e-mails de confirmação e de senha).');
  }
}
