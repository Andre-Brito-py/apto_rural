# Ensaio geral de produção (no seu computador)

Antes de contratar o servidor, dá para rodar o Apto Rural **exatamente como vai rodar em produção**, aqui mesmo:

- **As mesmas imagens:** imagens Docker de produção, banco vazio com as migrações, HTTPS pelo Caddy, os coletores no agendador, o monitor da carteira e o backup.
- **Só três peças trocadas**, as que dependem de contas que ainda não existem:

| Em produção | No ensaio | Onde ver |
| --- | --- | --- |
| Provedor de e-mail (SMTP) | **Mailpit**, uma caixa de correio falsa que guarda todos os e-mails | http://localhost:8025 |
| Asaas (Pix, cartão, boleto) | **Asaas falso** (`deploy/ensaio/asaas-falso.mjs`), com uma fatura de teste e o botão "Pagar" que manda o aviso (webhook) igual ao Asaas | http://localhost:8099 |
| Armazenamento externo do backup (S3) | **rclone serve s3** local (`s3-falso`): recebe a cópia cifrada | (interno) |
| Serviço de alerta (healthchecks.io) | **Alerta falso** no mesmo servidor do Asaas falso: guarda os sinais do vigia e do backup | http://localhost:8099/vigia |
| OpenAI (explicação para o produtor) | **OpenAI falsa**, no mesmo servidor: responde no formato da Responses API. Qualquer chave começando com `sk-` funciona; terminada em `ruim`, é recusada | (interna) |
| Seu domínio | `localhost`, com um certificado que o próprio Caddy gera | https://localhost |

Assim, quando o servidor for contratado, a implantação vira a repetição de algo já testado.

## Como rodar

1. **Gerar o `.env.ensaio`** na pasta do projeto. Ele fica fora do GitHub, como o `.env.producao`. Use o mesmo formato do `.env.producao.example`, com:
   - `DOMINIO=localhost`;
   - senhas aleatórias;
   - `ASAAS_AMBIENTE=sandbox` e qualquer texto em `ASAAS_API_KEY`;
   - `SMTP_HOST=mailpit` e `SMTP_PORTA=25`;
   - `ADMIN_EMAILS=admin@ensaio.local`;
   - `CHAVE_SEGREDOS` com 64 caracteres hexadecimais (`openssl rand -hex 32`).
2. **Subir tudo** (projeto separado, que não mexe no banco de desenvolvimento):

   ```bash
   docker compose -p apto-ensaio -f docker-compose.prod.yml -f deploy/ensaio/docker-compose.ensaio.yml --env-file .env.ensaio up -d --build
   ```

3. **Carregar as bases** (o mesmo comando do servidor):

   ```bash
   docker compose -p apto-ensaio -f docker-compose.prod.yml -f deploy/ensaio/docker-compose.ensaio.yml --env-file .env.ensaio exec coletores python -m coletores.agendador --agora
   ```

4. **Abrir https://localhost.** O navegador avisa que o certificado não é confiável: é esperado, porque o certificado foi gerado pelo Caddy e não por uma autoridade. No servidor real, o Caddy pega um certificado de verdade (Let's Encrypt).

   O ensaio roda em modo de produção: para usar o painel com `admin@ensaio.local`, ligue antes a **verificação em duas etapas** em Minha conta (qualquer aplicativo autenticador serve). Desde 27/10/2026, vale repetir também a **cópia externa do backup e a restauração**, porque o script passou a usar o "sal" do rclone ([backup-e-vigia.md](backup-e-vigia.md)).

5. **Desligar e apagar tudo do ensaio** (volumes inclusive):

   ```bash
   docker compose -p apto-ensaio -f docker-compose.prod.yml -f deploy/ensaio/docker-compose.ensaio.yml --env-file .env.ensaio down -v
   ```

   A entrada `http://localhost:8081` existe porque o navegador recusa o certificado do Caddy para `localhost`. Ela passa pelo mesmo Caddy, com os **mesmos cabeçalhos de segurança** do site real (arquivo `deploy/cabecalhos.caddy`), só sem HTTPS.

## Resultado do ensaio de 24/10/2026

### O que foi testado e passou

| Etapa | Resultado |
| --- | --- |
| Subir tudo do zero (8 serviços) | ✅ banco vazio, as 12 migrações aplicadas sozinhas, API saudável |
| HTTPS e segurança | ✅ HTTPS responde; HTTP redireciona para HTTPS; os 8 cabeçalhos de segurança presentes; versão do servidor escondida |
| Site sob a política de segurança (CSP) real | ✅ estilos, fonte Inter, imagens, leitor de shapefile e mapa carregam; metatags com o endereço do site |
| Carregar as 7 bases | ✅ Ibama (116.925 termos), MMA (106.024), MTE, CNUC (3.121), Serviço Florestal (1.742), Incra (5.569), Funai (665, **depois da correção abaixo**) |
| Criar conta | ✅ e-mail de confirmação sai pelo SMTP, com acentos certos |
| Confirmar e-mail | ✅ o link libera a consulta grátis |
| Comprar consulta e dossiê | ✅ cobrança criada, fatura, pagamento; o aviso do "Asaas" libera o crédito **uma vez só** (aviso repetido é reconhecido) |
| Webhook com token errado ou sem token | ✅ recusado (401), passando pelo HTTPS |
| Consulta real com shapefile | ✅ prévia, resultado e mapa do entorno com as bases reais; 1 crédito gasto |
| Dossiê | ✅ gerado com 1 crédito de dossiê, mapa e QR |
| **Imprimir o dossiê em PDF** | ✅ 4 páginas, depois dos ajustes abaixo |
| Carteira e reconferência das 6h (rodada na hora) | ✅ imóvel reconferido; sem mudança, sem e-mail ao técnico |
| Alerta de erro ao administrador | ✅ depois da correção abaixo |
| **Backup, apagar o banco e restaurar** | ✅ backup de 188 MB; banco apagado (0 tabelas); restaurado em 21 s com o comando do `implantacao.md`; contagens idênticas; o técnico continuou logado, com saldo, carteira e dossiê |

### O que o ensaio achou (e já foi corrigido)

1. **Terras indígenas não carregariam no servidor (grave).** O servidor da Funai não envia o certificado intermediário. O Windows completa sozinho, o Linux não. Corrigido: o intermediário público da Sectigo entra na imagem dos coletores, com a verificação TLS ligada (`deploy/certificados/LEIA-ME.md`).
2. **O alerta de erro se perdia na reconferência rodada na hora.** O processo saía antes de terminar de mandar o e-mail. Corrigido, com teste automático.
3. **Falha de coletor só virava e-mail 3 dias depois**, quando a base ficava "atrasada". Agora a reconferência das 6h manda as falhas das últimas 24 h. O módulo fiscal do Incra entrou na lista de prazos das bases (10 dias).
4. **Cliente que já pagou antes era obrigado a ver o campo de CPF de novo.** Agora o pagamento vai direto.
5. **PDF do dossiê:**
   - **1ª página meio vazia:** o mapa agora cabe logo depois do resumo, e a legenda pode seguir na página seguinte.
   - **Títulos sozinhos no pé da página:** "Saídas que a norma admite", "Observações". Agora ficam junto do que vem embaixo.
   - **Ponto duplicado** depois da descrição do Ibama, nas consultas novas.
   - O PDF passou de 5 para 4 páginas.
6. **O log da API era inundado** pelo healthcheck a cada 30 s. Agora o healthcheck só aparece no log quando dá problema.

### O que o ensaio não cobre

- **Os serviços de verdade:** o Asaas real (sandbox e produção), o provedor de e-mail real (SPF/DKIM, caixa de spam) e o certificado Let's Encrypt de um domínio real. Eles dependem das contas da lista abaixo.
- **O horário do backup automático:** o backup das 3h usa o mesmo `pg_dump` testado aqui, mas o horário em si não foi esperado.
- **O CPF no pagamento:** não foi digitado nenhum CPF, nem inventado, porque um número inventado pode ser de uma pessoa real. Usamos um cliente "que já comprou antes".

## Lista do lançamento

Na ordem. Os itens marcados como **você** dependem de conta, contrato ou decisão sua.

1. **Você:** registrar o domínio (`aptorural.com.br`) e contratar o servidor (Ubuntu 24.04, 2 a 4 GB, 40 GB; veja `implantacao.md`).
2. **Você:** criar a conta no provedor de e-mail e verificar o domínio (SPF e DKIM).
3. **Você:** ter a conta Asaas aprovada e gerar as chaves (sandbox e produção).
4. **Você:** fazer a revisão do advogado (termos, privacidade, prazos de guarda, texto do dossiê) e confirmar as licenças das bases da Funai e do MMA.
5. **Juntos:** subir no servidor com o `implantacao.md`, primeiro com **Asaas sandbox**.
6. **Juntos:** repetir o roteiro deste ensaio no servidor real:
   - criar conta, confirmar o e-mail e conferir que **não caiu no spam**;
   - comprar no sandbox com os dados de teste do Asaas;
   - fazer uma consulta e gerar e imprimir um dossiê;
   - rodar e restaurar um backup.
7. **Você:** fazer a lista "O que depende de você" de `seguranca.md`: duas etapas nas contas, SSH só por chave, firewall com 22, 80 e 443, e cópia dos backups fora do servidor.
8. **Juntos:** trocar o Asaas para **produção**, fazer uma compra real de valor baixo e estornar pelo painel.
9. Abrir para os primeiros clientes.
