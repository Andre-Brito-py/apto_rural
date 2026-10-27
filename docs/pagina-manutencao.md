# Página de manutenção ("Voltamos em instantes")

Quando a API não responde, o visitante via uma tela em branco: o "502" do Caddy. Isso acontece:
- numa atualização, quando o `docker compose ... up --build` reinicia a API;
- num reinício do servidor;
- numa queda.

Agora ele vê uma página com a marca: **"Voltamos em instantes"**, com o aviso de que as consultas, os dossiês, os créditos e a carteira estão guardados.

## Como funciona

- **Quem serve é o próprio Caddy,** a partir de `deploy/manutencao/manutencao.html`. Ela não depende da API, que é justamente o que está fora do ar. É um arquivo só: estilo e logo dentro dele, sem fonte, imagem ou script de fora.
- **Ela tenta de novo sozinha a cada 30 segundos.** Quando a API volta, a pessoa cai **no mesmo endereço em que estava** (por exemplo, o resultado de uma consulta), sem precisar clicar. Também há o botão "Tentar de novo".
- **Responde com o código 503** e o cabeçalho `Retry-After: 30`. É o jeito certo de dizer "fora do ar por pouco tempo": o Google não tira o site da busca por causa disso.
- **As chamadas da API** (`/v1/...`) recebem uma resposta em JSON com a mensagem "O Apto Rural está em manutenção por alguns minutos", que as telas abertas mostram como aviso.
- **Os mesmos cabeçalhos de segurança** do site valem para ela.
- **A regra fica no trecho `fora_do_ar`** de `deploy/cabecalhos.caddy`, usado pelo `Caddyfile`.

## Conferido no ensaio de produção (26/10/2026)

| Teste | Resultado |
| --- | --- |
| Com a API no ar | ✅ Site normal (200) |
| API parada, uma página qualquer | ✅ A página de manutenção, com 503, `Retry-After: 30`, `Cache-Control: no-store`, a política de segurança e o HSTS |
| API parada, uma chamada `/v1/...` | ✅ JSON com a mensagem, 503 |
| Computador e celular | ✅ Sem erro no console; no celular, sem rolagem lateral |
| API de volta | ✅ A página recarregou sozinha e voltou ao site, no mesmo endereço |

Um detalhe de quem mexe no Caddy: com `handle_errors 502 503 504`, o Caddy 2.8 troca os matchers de dentro pelos dele, e o filtro de `/v1/` sumia. Por isso as condições ficam nos próprios matchers (`@fora` e `@fora_api`).

## Mudar o texto

Edite `deploy/manutencao/manutencao.html` e rode de novo o comando do passo 4 do `implantacao.md`. Ou, só para o Caddy:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.producao exec caddy caddy reload --config /etc/caddy/Caddyfile
```
