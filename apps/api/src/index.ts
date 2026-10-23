import { config } from './config.js';
import { criarContexto, criarServidor } from './servidor.js';

const ctx = criarContexto();
const app = criarServidor(ctx);

// Falha fora de uma requisição (ex.: promessa esquecida) também vai para o registro.
process.on('unhandledRejection', (motivo) => {
  const e = motivo instanceof Error ? motivo : new Error(String(motivo));
  void ctx.erros.registrar({ origem: 'api', mensagem: `Promessa não tratada: ${e.message}`, detalhe: e.stack });
});

app.listen({ port: config.porta, host: '0.0.0.0' }).catch((e) => {
  app.log.error(e);
  process.exit(1);
});
