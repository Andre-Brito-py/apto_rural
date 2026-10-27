# Backup fora do servidor e alerta de site fora do ar

Duas proteções que dependem de algo **fora** do servidor. Os alertas de dentro do servidor (e-mail de erro, monitor das 6h) não servem quando o problema é o próprio servidor.

| Risco | Proteção |
| --- | --- |
| O servidor some (disco quebra, conta suspensa, invasão) e os backups vão junto | **Cópia cifrada do backup** num armazenamento externo, todo dia |
| O site cai de madrugada e ninguém percebe | **Vigia**: a cada 5 minutos, um sinal para um serviço de alerta. Se o sinal falhar ou parar de chegar, você recebe o aviso |
| O backup para de rodar e ninguém percebe | O mesmo serviço recebe um sinal **por backup**. Sem sinal num dia, você é avisado |

As duas são **opcionais**: sem a configuração, o sistema roda como antes, e o painel mostra em vermelho o que falta.

## Como funciona

**Backup** (contêiner `backup`, todo dia às 3h de Brasília):

1. **Gera o arquivo:** o `pg_dump` cria o backup em `/backups` (guarda 14 dias).
2. **Cifra e envia:** o **rclone** cifra o arquivo **antes de sair do servidor**, com a sua `BACKUP_EXTERNO_SENHA`, e manda para o armazenamento externo. Lá, o nome e o conteúdo ficam ilegíveis: quem tiver acesso ao armazenamento (inclusive o provedor) não consegue ler sem a senha.
3. **Apaga as antigas:** lá fora, as cópias com mais de 30 dias são apagadas (`BACKUP_EXTERNO_DIAS`).
4. **Registra o resultado no banco.** O painel mostra o último backup e a última cópia enviada.

**Vigia** (dentro do contêiner `monitor`, a cada 5 minutos):

1. **Abre o site pelo endereço público,** como um visitante: HTTPS → Caddy → API → banco. A página `/v1/saude` agora confere o banco de verdade e responde erro (503) se ele não responder.
2. **Manda o sinal:** deu certo, sinal "ok". Falhou **duas vezes seguidas**, sinal de falha, com o motivo (uma falha isolada pode ser só um soluço de rede).
3. **Se o servidor inteiro cair,** os sinais param de chegar, e o serviço de alerta avisa sozinho.
4. **Avisa sobre o backup também:** depois de cada backup, manda o sinal dele (deu certo ou falhou).
5. **Registra a queda:** ela entra no registro de erros do painel uma vez só (não a cada 5 minutos).

E o **monitor das 6h** manda e-mail se:
- o backup não dá certo há mais de 26 horas;
- a cópia de fora falhou;
- a cópia de fora está desligada.

## O que você precisa criar (uma vez)

### 1. Serviço de alerta: healthchecks.io (gratuito)

1. Crie a conta em [healthchecks.io](https://healthchecks.io). O plano gratuito basta.
2. Crie dois **checks**:
   - **Site:** período de **5 minutos** e tolerância (grace) de **10 minutos**.
   - **Backup:** período de **1 dia** e tolerância de **3 horas**.
3. Em cada check, copie o endereço de ping (`https://hc-ping.com/…`).
4. Em **Integrations**, escolha como quer ser avisado: e-mail já vem ligado, e dá para pôr WhatsApp, Telegram ou SMS.

### 2. Armazenamento externo (qualquer serviço compatível com S3)

Exemplos: AWS S3, Backblaze B2, Cloudflare R2, Wasabi e Magalu Cloud. O backup tem os dados dos clientes (contas, e-mails), então **prefira um armazenamento no Brasil**, como a AWS em São Paulo (`sa-east-1`) ou a Magalu Cloud. Fora do Brasil é transferência internacional (LGPD), mesmo com o arquivo cifrado: confirme com o advogado.

1. Crie um **bucket** privado (ex.: `apto-rural-backups`).
2. Crie uma **chave de acesso só para esse bucket**, com permissão de ler, gravar e apagar arquivos. Não use a chave principal da conta.
3. Anote o endereço (endpoint), a região, a chave e o segredo.
4. Gere a senha da cifra:

   ```bash
   openssl rand -hex 32
   ```

   **Guarde essa senha num gerenciador de senhas, fora do servidor.** Sem ela, as cópias de fora não abrem. É ela que você vai precisar se o servidor sumir.

### 3. Preencher o `.env.producao` e subir de novo

```bash
# Cópia do backup fora do servidor
BACKUP_S3_ENDPOINT=https://s3.sa-east-1.amazonaws.com
BACKUP_S3_REGIAO=sa-east-1
BACKUP_S3_BUCKET=apto-rural-backups
BACKUP_S3_CHAVE=...
BACKUP_S3_SEGREDO=...
BACKUP_EXTERNO_SENHA=...        # a senha da cifra (guardada também fora do servidor)
# Alertas (healthchecks.io)
VIGIA_URL_SITE=https://hc-ping.com/...
VIGIA_URL_BACKUP=https://hc-ping.com/...
```

Depois, rode o comando do passo 4 de `implantacao.md`. Para conferir na hora, faça um backup já, sem esperar as 3h:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.producao exec backup sh /backup.sh agora
```

No painel, **Visão geral → Servidor**, as três linhas devem ficar verdes em até 5 minutos.

## Restaurar a partir da cópia de fora (o servidor sumiu)

Num servidor novo, com o projeto e o mesmo `.env.producao` (inclusive a `BACKUP_EXTERNO_SENHA`):

```bash
# 1. sobe tudo (banco vazio)
docker compose -f docker-compose.prod.yml --env-file .env.producao up -d --build
# 2. vê as cópias guardadas lá fora (os nomes já aparecem decifrados)
docker compose -f docker-compose.prod.yml --env-file .env.producao exec backup sh /backup.sh externo-listar
# 3. traz a mais recente, já decifrada, para /backups
docker compose -f docker-compose.prod.yml --env-file .env.producao exec backup sh /backup.sh externo-baixar NOME_DO_ARQUIVO.dump
# 4. restaura (o mesmo comando de "Restaurar um backup" do implantacao.md)
docker compose -f docker-compose.prod.yml --env-file .env.producao exec backup sh -c \
  "pg_restore -h db -U apto -d apto_rural --clean --if-exists /backups/NOME_DO_ARQUIVO.dump"
```

## Conferido no ensaio de produção (26/10/2026)

No ensaio (`ensaio-producao.md`), o armazenamento externo foi um `rclone serve s3` local e o serviço de alerta foi um falso.

| Teste | Resultado |
| --- | --- |
| Backup com cópia externa | ✅ 188 MB enviados |
| Lá fora, o arquivo fica ilegível | ✅ Nome cifrado (`bamc7l5tn9…`) e conteúdo começando com `RCLONE` em vez de `PGDMP` |
| Trazer de volta com `externo-baixar` | ✅ Arquivo **idêntico** ao original (mesmo SHA-256) |
| Sinal do site e do backup | ✅ "ok" a cada conferência; um sinal por backup, sem repetir |
| Site fora do ar (API parada) | ✅ 1ª falha sem alarme; 2ª e 3ª com sinal de falha; erro registrado uma vez só; ao voltar, sinal "ok" de novo |
| Painel | ✅ Bloco "Servidor" com backup, cópia externa e vigia |

## Para quem mexe no código

| Peça | Onde |
| --- | --- |
| Backup, cifra e envio, restauração | `deploy/backup.sh`, `Dockerfile.backup` (rclone da imagem oficial, sem apt) |
| Vigia (conferência, sinais, sinal do backup) | `apps/api/src/vigia.ts`, iniciado pelo `monitorar.ts --agendar` |
| Alerta de backup parado ou cópia desligada | `verificarBackup` em `apps/api/src/monitorar.ts` |
| Banco | migração `014_backup_e_vigia.sql`: tabelas `backup_execucao` e `vigia_verificacao` |
| Painel | `SaudeServidor` em `apps/web/src/paginas/Admin.tsx` |
| Testes | `apps/api/test/vigia.test.ts` |
