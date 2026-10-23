export const config = {
  porta: Number(process.env.PORT ?? 3333),
  databaseUrl: process.env.DATABASE_URL,
  segredoDocumento: process.env.DOCUMENTO_HASH_SECRET ?? '',
  demo: process.env.APTO_DEMO === '1' && process.env.NODE_ENV !== 'production',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
};

if (config.databaseUrl && config.segredoDocumento.length < 16) {
  throw new Error('DOCUMENTO_HASH_SECRET precisa ter pelo menos 16 caracteres.');
}
