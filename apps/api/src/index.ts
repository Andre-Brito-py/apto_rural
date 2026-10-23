import { config } from './config.js';
import { criarContexto, criarServidor } from './servidor.js';

const ctx = criarContexto();
const app = criarServidor(ctx);

// Falha fora de uma requisição (ex.: promessa esquecida) também vai para o registro.
process.on('unhandledRejection', (motivo) => {
  const e = motivo instanceof Error ? motivo : new Error(String(motivo));
  void ctx.erros.registrar({ origem: 'api', mensagem: `Promessa não tratada: ${e.message}`, detalhe: e.stack });
});

// Produção (Docker): todas as interfaces, para o Caddy alcançar a API pela rede interna.
// No computador de desenvolvimento: só o próprio computador, nunca a rede do Wi-Fi.
const host = process.env.API_HOST ?? (config.producao ? '0.0.0.0' : '127.0.0.1');

app.listen({ port: config.porta, host }).catch((e) => {
  app.log.error(e);
  process.exit(1);
});
