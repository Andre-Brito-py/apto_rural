# Como colocar o Apto Rural no ar

Guia passo a passo, sem pressupor experiência com servidores.

## O que vai rodar no servidor

| Peça | O que faz |
| --- | --- |
| **db** | O banco de dados com os mapas (PostgreSQL + PostGIS). |
| **api** | O site e a API, no mesmo endereço. Ao subir, atualiza a estrutura do banco sozinha. |
| **coletores** | Todo dia às 4h (Brasília) confere as bases oficiais e só recarrega o que mudou. CNUC e CNFP, que são pesados, aos domingos. |
| **caddy** | Recebe as visitas e cuida do **HTTPS** (o cadeado), renovando o certificado sozinho. |
| **backup** | Todo dia às 3h salva uma cópia do banco e guarda os últimos 14 dias. |

Tudo isso é descrito em `docker-compose.prod.yml` e sobe com um comando.

## 1. Contratar um servidor

Um servidor virtual (VPS) com **Ubuntu 24.04**, **2 a 4 GB de memória** e **40 GB de disco** é suficiente para começar. Com as seis bases carregadas, o banco ocupa cerca de **310 MB** (medido em 23/10/2026); os arquivos baixados pelos coletores ocupam por volta de 1,5 GB. Provedores com data center no Brasil deixam o site mais rápido para quem está no campo.

## 2. Apontar o domínio

No painel onde o domínio foi registrado (ex.: Registro.br), crie um registro **A** apontando o domínio para o IP do servidor. A mudança pode levar algumas horas para valer.

## 3. Preparar o servidor (uma vez)

```bash
# Instala o Docker (script oficial)
curl -fsSL https://get.docker.com | sh

# Baixa o projeto
git clone https://github.com/Andre-Brito-py/apto_rural.git
cd apto_rural

# Cria o arquivo de configuração e preenche (domínio, senhas, Asaas)
cp .env.producao.example .env.producao
nano .env.producao
```

Para gerar senhas e chaves aleatórias:

```bash
openssl rand -hex 32
```

## 4. Subir tudo

```bash
docker compose -f docker-compose.prod.yml --env-file .env.producao up -d --build
```

Em poucos minutos o site responde em `https://seu-dominio`. Para carregar as bases na primeira vez, sem esperar as 4h:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.producao exec coletores python -m coletores.agendador --agora
```

## 5. Configurar o webhook do Asaas

No painel do Asaas, em Integrações → Webhooks, cadastre:

- **URL:** `https://seu-dominio/v1/webhooks/asaas`
- **Token de autenticação:** o mesmo valor de `ASAAS_WEBHOOK_TOKEN`
- **Eventos:** cobranças (confirmada, recebida, estornada, chargeback, removida)

## Tarefas do dia a dia

| Quero… | Comando |
| --- | --- |
| Ver se está tudo rodando | `docker compose -f docker-compose.prod.yml ps` |
| Ver o que a API está fazendo | `docker compose -f docker-compose.prod.yml logs -f api` |
| Ver as atualizações das bases | `docker compose -f docker-compose.prod.yml logs coletores` |
| Atualizar para a versão nova do código | `git pull` e depois o comando do passo 4 |
| Listar os backups | `docker compose -f docker-compose.prod.yml exec backup ls -lh /backups` |

## Restaurar um backup

```bash
docker compose -f docker-compose.prod.yml exec backup sh -c \
  "pg_restore -h db -U apto -d apto_rural --clean --if-exists /backups/NOME_DO_ARQUIVO.dump"
```

## Cuidados

- O `.env.producao` tem senhas: **nunca** envie ao GitHub (ele já está no `.gitignore`).
- **Não troque** o `DOCUMENTO_HASH_SECRET` depois de carregar o cadastro do MTE. Se trocar, rode o coletor do MTE de novo com `--forcar`.
- Em produção a API se recusa a subir sem banco e sem as chaves do Asaas, e o modo demonstração fica desligado.
- Os backups ficam no próprio servidor. Para segurança extra, copie-os periodicamente para fora dele.
