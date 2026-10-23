const producao = process.env.NODE_ENV === 'production';

export const config = {
  producao,
  porta: Number(process.env.PORT ?? 3333),
  databaseUrl: process.env.DATABASE_URL,
  segredoDocumento: process.env.DOCUMENTO_HASH_SECRET ?? '',
  demo: process.env.APTO_DEMO === '1' && !producao,
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  asaas: {
    chave: process.env.ASAAS_API_KEY ?? '',
    ambiente: (process.env.ASAAS_AMBIENTE === 'producao' ? 'producao' : 'sandbox') as 'producao' | 'sandbox',
    tokenWebhook: process.env.ASAAS_WEBHOOK_TOKEN ?? '',
  },
  sessaoDias: 30,
  /** Pasta do site já compilado. Em produção a API entrega o site no mesmo endereço. */
  webDist: process.env.WEB_DIST,
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    porta: Number(process.env.SMTP_PORTA ?? 587),
    usuario: process.env.SMTP_USUARIO || undefined,
    senha: process.env.SMTP_SENHA || undefined,
    remetente: process.env.EMAIL_REMETENTE ?? '',
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
  if (!config.smtp.host || !config.smtp.remetente) {
    throw new Error('Em produção, SMTP_HOST e EMAIL_REMETENTE são obrigatórios (e-mails de confirmação e de senha).');
  }
}
