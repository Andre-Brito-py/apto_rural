# Apto Rural

Pré-checagem dos impedimentos socioambientais do crédito rural (Manual de Crédito Rural, Capítulo 2, Seção 9). O técnico informa o CAR e o contorno do imóvel e recebe, item por item, o que o banco tende a encontrar nas bases públicas, com a norma e a fonte citadas e os caminhos de saída que as regras permitem.

> Regra do projeto: nenhuma regra entra no código sem norma oficial citada em [docs/fontes-oficiais.md](docs/fontes-oficiais.md). Ver também [docs/conformidade-legal.md](docs/conformidade-legal.md).

## Estrutura

```
packages/regras   Regras do MCR 2-9 como código (TypeScript puro, testado). Cada regra cita item + resolução.
apps/api          API (Fastify). Coleta evidências no PostGIS e passa ao motor de regras.
apps/web          Site (React + Vite), feito para celular no campo.
coletores         Scripts Python que baixam as bases oficiais, com proveniência (URL, data, SHA-256).
db/migrations     Esquema PostgreSQL + PostGIS (SIRGAS 2000, EPSG:4674).
docs              Fontes oficiais, conformidade legal, arquitetura e decisões de interface.
```

## Rodar em modo demonstração (sem banco)

Requer Node 20+.

```bash
npm install
npm run dev:api
npm run dev:web
```

Abra http://localhost:5173. Com `APTO_DEMO=1` no `.env`, três CARs fictícios (município `0000000`) mostram os cenários sem nenhuma base carregada.

## Rodar com as bases reais

1. PostgreSQL 16 com PostGIS. Com Docker: `docker compose up -d` (aplica `db/migrations` na criação e publica o banco na porta **5433**, para não colidir com um PostgreSQL já instalado). Sem Docker: instale o PostgreSQL + PostGIS (Stack Builder no Windows) e rode `db/migrations/001_inicial.sql`.
2. Copie `.env.example` para `.env`, preencha `DATABASE_URL` e um `DOCUMENTO_HASH_SECRET` longo.
3. Carregue as bases:

```bash
cd coletores
pip install -r requirements.txt
python -m coletores.mma_lista_mcr
python -m coletores.ibama_embargos
python -m coletores.cnuc
python -m coletores.funai_ti
python -m coletores.sfb_cnfp
python -m coletores.mte_empregadores
```

`--simular` lê e conta sem gravar; `--arquivo` usa um arquivo já baixado. Cada carga é atômica: se falhar, a anterior continua valendo.

## Contas e pagamentos

- Conta com e-mail e senha (scrypt), sessão em cookie `HttpOnly` e limite de tentativas de login.
- Créditos num livro-razão (`credito_lancamento`): cada lançamento tem referência única, então webhook repetido nunca credita duas vezes. A conta nova ganha 1 consulta grátis.
- Uma consulta real gasta 1 crédito de consulta; um dossiê gasta 1 crédito de dossiê. Exemplos fictícios são grátis.
- Pagamento pelo **Asaas** (Pix, cartão ou boleto na fatura hospedada por eles). Configure `ASAAS_API_KEY`, `ASAAS_AMBIENTE` e `ASAAS_WEBHOOK_TOKEN`, e aponte o webhook de cobranças do Asaas para `https://<seu-domínio>/v1/webhooks/asaas`.
- Sem chave do Asaas e com `APTO_DEMO=1`, a compra usa uma fatura simulada para desenvolvimento.
- Em produção (`NODE_ENV=production`), a API recusa iniciar sem banco e sem Asaas, e desliga o modo demonstração.

## Testes

```bash
npm test          # motor de regras + API (contas, compra, webhook do Asaas, cobrança de créditos)
npm run typecheck
npm run build
```

## Situação das bases

| Base | Regra | Coletor |
| --- | --- | --- |
| Lista MCR do MMA (Prodes/BiomasBR) | 2-9-17 | pronto |
| Termos de embargo do Ibama | 2-9-10 | pronto |
| CNUC (MMA) | 2-9-5 | pronto |
| Terras indígenas (Funai) | 2-9-7 | pronto |
| Florestas públicas Tipo B (SFB) | 2-9-14 | pronto |
| Cadastro de empregadores (MTE) | 2-9-4 | pronto |
| Quilombolas titulados (Incra) | 2-9-8 | sem fonte aberta (Acervo exige login) |

Todas as bases foram carregadas no PostGIS e testadas com 24 consultas de fazendas reais, sem divergência (ver [docs/teste-fazendas-reais.md](docs/teste-fazendas-reais.md)).

Enquanto uma base não estiver carregada, o item correspondente aparece como **Não verificado**, nunca como verde.
