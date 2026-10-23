# Apto Rural

**Em uma frase:** o Apto Rural diz, em poucos segundos, se uma fazenda tem algum problema socioambiental que vai fazer o banco negar o crédito rural, e mostra o caminho para resolver.

Este README explica o problema do zero (não precisa saber nada de crédito rural), depois como o sistema funciona e, por fim, como rodar o código.

---

## Sumário

1. [O problema, em linguagem simples](#1-o-problema-em-linguagem-simples)
2. [Glossário: os termos que aparecem no projeto](#2-glossário-os-termos-que-aparecem-no-projeto)
3. [O que o Apto Rural verifica](#3-o-que-o-apto-rural-verifica)
4. [As datas que importam](#4-as-datas-que-importam)
5. [Como o sistema funciona](#5-como-o-sistema-funciona)
6. [O diferencial: do vermelho ao verde](#6-o-diferencial-do-vermelho-ao-verde)
7. [Como o produto ganha dinheiro](#7-como-o-produto-ganha-dinheiro)
8. [Rodar no seu computador](#8-rodar-no-seu-computador)
9. [Mapa das pastas](#9-mapa-das-pastas)
10. [Situação do projeto](#10-situação-do-projeto)
11. [Regras de ouro do projeto](#11-regras-de-ouro-do-projeto)
12. [Documentos de apoio](#12-documentos-de-apoio)

---

## 1. O problema, em linguagem simples

**Crédito rural** é o empréstimo que o produtor rural pega no banco para plantar, comprar gado, máquinas etc. Grande parte dele tem juros subsidiados pelo governo, e por isso segue regras do **Banco Central**, reunidas no **Manual de Crédito Rural (MCR)**.

Desde 2025 essas regras ficaram bem mais rígidas na parte ambiental e social. O banco é **obrigado a negar** o crédito se a fazenda, por exemplo:

- tem o cadastro ambiental (CAR) **cancelado ou suspenso**;
- tem uma área **embargada pelo Ibama** por desmatamento ilegal;
- fica **dentro de uma terra indígena**, de uma **unidade de conservação** ou de uma **floresta pública** ainda sem destino;
- pertence a alguém que está na **"lista suja" do trabalho escravo**;
- teve **vegetação nativa derrubada depois de 31/07/2019** (detectado por satélite), sem a autorização ou o documento de regularização.

**Quem sofre com isso:** o técnico agrícola ou o projetista que monta a proposta de crédito para o produtor. Hoje ele junta documentos, visita a fazenda, espera semanas… e só descobre o problema quando o banco nega. Perde tempo, perde a comissão e perde a confiança do cliente.

**O que o Apto Rural faz:** antes de começar a proposta, o técnico digita o código do CAR da fazenda e envia o desenho do imóvel. O sistema cruza esse desenho com os mapas e listas oficiais do governo, as mesmas bases que o banco usa, e devolve um **semáforo**, item por item:

| Cor | Significado |
| --- | --- |
| Vermelho (**Impedimento**) | Pela regra, o banco vai negar. |
| Amarelo (**Atenção**) | Ainda não impede, mas pode travar a análise. Vale resolver antes. |
| Verde (**OK**) | Nada encontrado nessa regra. |
| Cinza (**Não verificado**) | Faltou dado para checar. O sistema nunca mostra verde quando não verificou. |

Quando dá vermelho, o sistema explica **o que a própria norma permite fazer** (as exceções e os documentos aceitos) e gera um **dossiê** para o técnico levar ao banco.

> O Apto Rural **não aprova crédito** e **não substitui** o banco, um laudo técnico ou um advogado. Ele antecipa o que a checagem do banco vai encontrar.

---

## 2. Glossário: os termos que aparecem no projeto

| Termo | O que é |
| --- | --- |
| **Crédito rural** | Empréstimo para atividade agropecuária, com regras do Banco Central. |
| **MCR** | Manual de Crédito Rural, o livro de regras do Banco Central para o crédito rural. As regras ambientais e sociais ficam no **Capítulo 2, Seção 9** (por isso o código fala em "MCR 2-9-10" = capítulo 2, seção 9, item 10). |
| **CMN / Resolução CMN** | O Conselho Monetário Nacional cria e muda as regras do MCR por meio de resoluções (ex.: Resolução CMN 5.303/2026). |
| **CAR** | Cadastro Ambiental Rural, o "RG ambiental" da fazenda. Todo imóvel rural tem um código, no formato `UF-código do município-32 letras e números` (ex.: `MT-5107925-1A2B…`). O cadastro pode estar **ativo, pendente, suspenso ou cancelado**. |
| **Sicar** | O sistema do governo onde ficam os CARs. |
| **Módulo fiscal (MF)** | Unidade de tamanho de terra fixada pelo Incra para cada município, de 5 a 110 hectares ([Embrapa](https://www.embrapa.br/en/codigo-florestal/area-de-reserva-legal-arl/modulo-fiscal); valor por município na [consulta do Incra](https://www.gov.br/pt-br/servicos/consultar-indices-basicos)). Serve para classificar o imóvel em pequeno (até 4 MF), médio ou grande. |
| **Prodes** | Programa do Inpe que mede o desmatamento por satélite, todo ano. |
| **Lista do MMA** | Lista oficial do Ministério do Meio Ambiente com os CARs onde o Prodes encontrou desmatamento depois de 31/07/2019. É o que o banco consulta para a regra do Prodes. |
| **Embargo** | Punição do Ibama (ou do órgão estadual) que proíbe usar uma área, geralmente por desmatamento ilegal. |
| **UC** | Unidade de Conservação (parque, reserva, APA…). Existem as de **Proteção Integral** (quase nada é permitido) e as de **Uso Sustentável** (permitem atividades, conforme o Plano de Manejo). |
| **TI** | Terra Indígena, demarcada pela Funai. |
| **Floresta pública Tipo B** | Floresta em terra do governo que ainda não recebeu destino. |
| **ASV / UAS** | Autorizações oficiais para derrubar vegetação legalmente. |
| **PRAD / PRA / TAC** | Planos e acordos oficiais de recuperação ou regularização ambiental. |
| **Dossiê** | O documento que o Apto Rural gera para o técnico levar ao banco, com o que foi encontrado, a regra e o caminho de saída. |
| **PostGIS** | Extensão do banco de dados PostgreSQL que entende mapas. É ela que responde "este desenho encosta naquela área?". |
| **SIRGAS 2000** | O sistema de coordenadas oficial do Brasil, usado em todos os mapas do projeto. |

---

## 3. O que o Apto Rural verifica

Cada linha do semáforo corresponde a um item do MCR e usa uma base oficial:

| O que checa | Regra (MCR) | Base oficial usada | Como cruza |
| --- | --- | --- | --- |
| CAR ativo (não cancelado nem suspenso) | 2-9-3 | Demonstrativo do CAR + lista do MMA | código do CAR |
| Embargo ambiental | 2-9-10 a 13 | Ibama: termos de embargo (atualização diária) | mapa |
| Desmatamento após 31/07/2019 | 2-9-17 e 18 | MMA: lista baseada no Prodes/Inpe | código do CAR |
| Terra indígena | 2-9-7 | Funai | mapa |
| Unidade de Conservação | 2-9-5 e 6 | MMA: CNUC | mapa |
| Território quilombola | 2-9-8 | Incra | **sem fonte aberta ainda** (sai "Não verificado") |
| Floresta pública Tipo B | 2-9-14 e 15 | Serviço Florestal: CNFP | mapa |
| Trabalho escravo | 2-9-4 | Ministério do Trabalho: Cadastro de Empregadores | CPF/CNPJ (só com autorização do produtor) |

"Cruza pelo mapa" quer dizer: o sistema sobrepõe o desenho da fazenda aos mapas oficiais, como duas folhas transparentes, e mede quantos hectares se encostam.

Detalhes que o sistema já trata:

- **Encosta de divisa:** sobreposição menor que 0,1 ha costuma ser erro de desenho e sai como **Atenção**, não Impedimento. Isso é critério do produto, não da norma, e está documentado.
- **Exceções da norma:** por exemplo, até 30/06/2027 o embargo tem uma exceção se a área embargada for pequena (até 5% do imóvel, ou 5%/20 ha nos embargos mais novos). O sistema faz essa conta sozinho.
- **Cada item mostra** a norma, a base usada e a data de atualização dessa base.

---

## 4. As datas que importam

A checagem de desmatamento (Prodes) entra em vigor aos poucos, pela **Resolução CMN 5.303/2026**:

| A partir de | Vale para imóveis com |
| --- | --- |
| **04/01/2027** | mais de 15 módulos fiscais (grandes) |
| **01/07/2027** | de 4 a 15 módulos fiscais (médios) |
| **03/01/2028** | até 4 módulos fiscais (pequenos, a maioria das propriedades) |

As outras regras (CAR, embargo, terra indígena, UC etc.) **já valem hoje**.

---

## 5. Como o sistema funciona

```
  Bases oficiais do governo (MMA, Ibama, Funai, Serviço Florestal, Ministério do Trabalho)
           │   os "coletores" baixam tudo e guardam com data e origem
           ▼
  Banco de dados com mapas (PostgreSQL + PostGIS)
           ▲
           │   a API pergunta: "este desenho encosta em quê?"
  API (o "balcão")  ──►  Motor de regras (aplica o MCR item por item)
           ▲
           │
  Site (o técnico usa no celular ou no computador)
```

O caminho de uma consulta:

1. O técnico digita o **código do CAR**, informa a situação do CAR e os módulos fiscais e envia o **arquivo do contorno** da fazenda (KML ou GeoJSON).
2. O site manda isso para a **API**.
3. A API pergunta ao **banco de mapas** o que se sobrepõe à fazenda e consulta as listas pelo código do CAR.
4. O **motor de regras** transforma o que foi encontrado em semáforo, aplicando cada item do MCR e suas exceções.
5. O resultado volta para a tela e fica guardado, para poder ser conferido depois pelo **código QR** do relatório.

Com as bases reais, cada consulta leva em torno de **0,1 segundo** (veja [docs/teste-fazendas-reais.md](docs/teste-fazendas-reais.md)).

---

## 6. O diferencial: do vermelho ao verde

Mostrar o problema qualquer mapa público mostra. O Apto Rural vai além:

- **Separa o vermelho real do contestável** (por exemplo, encosta de divisa ou desmatamento que tinha autorização).
- **Gera o dossiê**: o que foi encontrado, a regra, as saídas que a norma admite e a **lista de documentos** a juntar. Para o Prodes, por exemplo, o item 18 do MCR aceita ASV, PRAD, TAC, Termo de Compromisso Ambiental ou laudo de satélite do banco.
- **Relatório verificável**: o código QR abre a consulta original, para o gerente do banco conferir.
- **Feito para o campo**: funciona bem no celular, com sol forte e internet fraca, e envia o resumo pelo WhatsApp.

---

## 7. Como o produto ganha dinheiro

O técnico compra **créditos**:

| Pacote | Preço | Inclui |
| --- | --- | --- |
| Consulta avulsa | R$ 39 | 1 consulta |
| Dossiê avulso | R$ 190 | 1 dossiê |
| Pacote Projetista | R$ 199 | 20 consultas + 2 dossiês |
| Pacote Escritório | R$ 499 | 100 consultas + 10 dossiês |

- Quem cria a conta ganha **1 consulta grátis**.
- O pagamento é pelo **Asaas** (Pix, cartão ou boleto). O Apto Rural nunca vê dados de cartão.
- Os preços são valores de partida, a ajustar depois de conversar com técnicos.

---

## 8. Rodar no seu computador

### O que precisa estar instalado

- **Node.js 20 ou mais novo**: roda a API e o site.
- **Python 3.11 ou mais novo**: roda os coletores das bases.
- **Docker Desktop**: roda o banco de mapas (PostGIS).

### Opção A — só para ver as telas (sem banco)

```bash
npm install
npm run dev:api
npm run dev:web
```

Abra http://localhost:5173. No modo demonstração (`APTO_DEMO=1` no arquivo `.env`) aparecem três fazendas **fictícias** para testar as telas.

### Opção B — com as bases reais

1. **Suba o banco de mapas.** Ele fica na porta **5433**, para não brigar com outro PostgreSQL que já exista no computador.

   ```bash
   docker compose up -d
   ```

2. **Crie o arquivo `.env`** copiando o `.env.example` e preencha:
   - `DATABASE_URL=postgres://apto:apto@localhost:5433/apto_rural`
   - `DOCUMENTO_HASH_SECRET=` um texto longo e aleatório (protege os CPFs)

3. **Carregue as bases oficiais.** Leva alguns minutos; o Ibama e o Serviço Florestal são os maiores.

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

   Dicas: `--simular` só lê e conta, sem gravar; `--arquivo caminho` usa um arquivo já baixado. Se uma carga falhar no meio, a anterior continua valendo.

4. **Rode a API e o site** como na opção A e crie uma conta em "Entrar".

### Testes

```bash
npm test            # regras do MCR + API (contas, compras, pagamentos)
npm run typecheck   # confere os tipos do código
npm run build       # gera a versão de produção do site e da API
```

Teste com fazendas reais (precisa da opção B):

```bash
cd coletores
python -m coletores.amostra_mma --bioma cerrado --uf MT --limite 2000
cd ../apps/api
npx tsx --env-file=../../.env scripts/testar-fazendas-reais.ts
```

### Pagamentos

- Sem chave do Asaas e com `APTO_DEMO=1`, a compra abre uma **fatura simulada**, que não cobra nada.
- Para cobrar de verdade, preencha `ASAAS_API_KEY`, `ASAAS_AMBIENTE` (`sandbox` para testes, `producao` para valer) e `ASAAS_WEBHOOK_TOKEN`.
- No painel do Asaas, aponte o webhook de cobranças para `https://<seu-domínio>/v1/webhooks/asaas`.

---

## 9. Mapa das pastas

```
packages/regras   O coração: cada regra do MCR em código, com a norma citada e testes.
apps/api          A API (o "balcão"): contas, consultas, créditos e pagamentos.
apps/web          O site, pensado para o celular no campo.
coletores         Scripts que baixam as bases oficiais e guardam a origem de cada arquivo.
db/migrations     A estrutura do banco de dados.
db/teste          Consultas SQL usadas só para testar com dados reais.
docs              Fontes oficiais, cuidados legais, arquitetura, interface e relatórios de teste.
```

Tecnologias: TypeScript (Node + Fastify na API, React + Vite no site), Python nos coletores, PostgreSQL + PostGIS no banco.

---

## 10. Situação do projeto

**Pronto e testado**

- [x] Motor com as regras do MCR 2-9, incluindo as Resoluções 5.193/2024, 5.268/2025 e 5.303/2026.
- [x] Seis bases oficiais carregadas e testadas com fazendas reais de MT e PA, sem divergência.
- [x] Site para celular: consulta, semáforo, relatório em PDF, resumo por WhatsApp e página de fontes.
- [x] Dossiê v1, com checklist de documentos e código QR.
- [x] Contas, créditos e pagamento (Asaas real + simulado para desenvolvimento).

**Falta para lançar**

- [ ] Hospedagem: servidor, domínio, HTTPS, backup e atualização automática das bases.
- [ ] Recuperação de senha e confirmação de e-mail.
- [ ] Revisão de um advogado: termos de uso, privacidade (LGPD) e linguagem do dossiê.
- [ ] Conta no Asaas aprovada (chaves de sandbox e de produção).
- [ ] Confirmar as licenças de uso das bases da Funai e do MMA.

**Depois do lançamento**

- [ ] Imagens de satélite antes e depois de 2019 no dossiê.
- [ ] Carteira de fazendas com avisos automáticos quando algo mudar.
- [ ] Consulta pelo WhatsApp, inclusive a consulta grátis para o produtor.
- [ ] Fonte aberta para territórios quilombolas.

---

## 11. Regras de ouro do projeto

1. **Só fonte oficial.** Nenhuma regra entra no código sem a norma oficial citada (Banco Central, ministérios, Ibama, Inpe…). O que não foi confirmado fica marcado "A CONFIRMAR".
2. **Nunca verde sem checar.** Se uma base não foi consultada, o item aparece como "Não verificado".
3. **Linguagem cuidadosa.** O sistema não chama ninguém de "irregular" nem "ilegal": mostra o que consta nas bases.
4. **Dados pessoais protegidos (LGPD).** CPF/CNPJ só com autorização e guardado apenas como código irreversível. O CPF de cobrança vai direto ao Asaas.
5. **Regras mudam.** Quando sair uma nova resolução, atualizam-se a regra, os testes e a documentação juntos.

---

## 12. Documentos de apoio

| Documento | Para que serve |
| --- | --- |
| [docs/fontes-oficiais.md](docs/fontes-oficiais.md) | Cada norma e cada base, com link oficial e situação. |
| [docs/conformidade-legal.md](docs/conformidade-legal.md) | Cuidados legais e critérios do produto que precisam de revisão jurídica. |
| [docs/arquitetura.md](docs/arquitetura.md) | Como as peças se encaixam e por quê. |
| [docs/frontend.md](docs/frontend.md) | Decisões de interface para o técnico do campo. |
| [docs/teste-fazendas-reais.md](docs/teste-fazendas-reais.md) | Relatório do teste com fazendas reais. |
| [Plano de negócio](https://claude.ai/artifact/1vcJWqtW6fs2MTWsVmahhW) | Mercado, preços, riscos e plano de lançamento. |
