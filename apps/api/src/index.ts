import { config } from './config.js';
import { criarServidor } from './servidor.js';

const app = criarServidor();

app.listen({ port: config.porta, host: '0.0.0.0' }).catch((e) => {
  app.log.error(e);
  process.exit(1);
});
