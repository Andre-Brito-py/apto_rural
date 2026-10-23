# Apto Rural

**Em uma frase:** o Apto Rural diz, em poucos segundos, se uma fazenda tem algum problema socioambiental que vai fazer o banco negar o crÃ©dito rural, e mostra o caminho para resolver.

Este README explica o problema do zero (nÃ£o precisa saber nada de crÃ©dito rural), depois como o sistema funciona e, por fim, como rodar o cÃ³digo.

---

## SumÃ¡rio

1. [O problema, em linguagem simples](#1-o-problema-em-linguagem-simples)
2. [GlossÃ¡rio: os termos que aparecem no projeto](#2-glossÃ¡rio-os-termos-que-aparecem-no-projeto)
3. [O que o Apto Rural verifica](#3-o-que-o-apto-rural-verifica)
4. [As datas que importam](#4-as-datas-que-importam)
5. [Como o sistema funciona](#5-como-o-sistema-funciona)
6. [O diferencial: do vermelho ao verde](#6-o-diferencial-do-vermelho-ao-verde)
7. [Como o produto ganha dinheiro](#7-como-o-produto-ganha-dinheiro)
8. [Rodar no seu computador](#8-rodar-no-seu-computador)
9. [Mapa das pastas](#9-mapa-das-pastas)
10. [SituaÃ§Ã£o do projeto](#10-situaÃ§Ã£o-do-projeto)
11. [Regras de ouro do projeto](#11-regras-de-ouro-do-projeto)
12. [Documentos de apoio](#12-documentos-de-apoio)

---

## 1. O problema, em linguagem simples

**CrÃ©dito rural** Ã© o emprÃ©stimo que o produtor rural pega no banco para plantar, comprar gado, mÃ¡quinas etc. Grande parte dele tem juros subsidiados pelo governo, e por isso segue regras do **Banco Central**, reunidas no **Manual de CrÃ©dito Rural (MCR)**.

Desde 2025 essas regras ficaram bem mais rÃ­gidas na parte ambiental e social. O banco Ã© **obrigado a negar** o crÃ©dito se a fazenda, por exemplo:

- tem o cadastro ambiental (CAR) **cancelado ou suspenso**;
- tem uma Ã¡rea **embargada pelo Ibama** por desmatamento ilegal;
- fica **dentro de uma terra indÃ­gena**, de uma **unidade de conservaÃ§Ã£o** ou de uma **floresta pÃºblica** ainda sem destino;
- pertence a alguÃ©m que estÃ¡ na **"lista suja" do trabalho escravo**;
- teve **vegetaÃ§Ã£o nativa derrubada depois de 31/07/2019** (detectado por satÃ©lite), sem a autorizaÃ§Ã£o ou o documento de regularizaÃ§Ã£o.

**Quem sofre com isso:** o tÃ©cnico agrÃ­cola ou o projetista que monta a proposta de crÃ©dito para o produtor. Hoje ele junta documentos, visita a fazenda, espera semanasâ€¦ e sÃ³ descobre o problema quando o banco nega. Perde tempo, perde a comissÃ£o e perde a confianÃ§a do cliente.

**O que o Apto Rural faz:** antes de comeÃ§ar a proposta, o tÃ©cnico digita o cÃ³digo do CAR da fazenda e envia o desenho do imÃ³vel. O sistema cruza esse desenho com os mapas e listas oficiais do governo, as mesmas bases que o banco usa, e devolve um **semÃ¡foro**, item por item:

| Cor | Significado |
| --- | --- |
| Vermelho (**Impedimento**) | Pela regra, o banco vai negar. |
| Amarelo (**AtenÃ§Ã£o**) | Ainda nÃ£o impede, mas pode travar a anÃ¡lise. Vale resolver antes. |
| Verde (**OK**) | Nada encontrado nessa regra. |
| Cinza (**NÃ£o verificado**) | Faltou dado para checar. O sistema nunca mostra verde quando nÃ£o verificou. |

Quando dÃ¡ vermelho, o sistema explica **o que a prÃ³pria norma permite fazer** (as exceÃ§Ãµes e os documentos aceitos) e gera um **dossiÃª** para o tÃ©cnico levar ao banco.

> O Apto Rural **nÃ£o aprova crÃ©dito** e **nÃ£o substitui** o banco, um laudo tÃ©cnico ou um advogado. Ele antecipa o que a checagem do banco vai encontrar.

---

## 2. GlossÃ¡rio: os termos que aparecem no projeto

| Termo | O que Ã© |
| --- | --- |
| **CrÃ©dito rural** | EmprÃ©stimo para atividade agropecuÃ¡ria, com regras do Banco Central. |
| **MCR** | Manual de CrÃ©dito Rural, o livro de regras do Banco Central para o crÃ©dito rural. As regras ambientais e sociais ficam no **CapÃ­tulo 2, SeÃ§Ã£o 9** (por isso o cÃ³digo fala em "MCR 2-9-10" = capÃ­tulo 2, seÃ§Ã£o 9, item 10). |
| **CMN / ResoluÃ§Ã£o CMN** | O Conselho MonetÃ¡rio Nacional cria e muda as regras do MCR por meio de resoluÃ§Ãµes (ex.: ResoluÃ§Ã£o CMN 5.303/2026). |
| **CAR** | Cadastro Ambiental Rural, o "RG ambiental" da fazenda. Todo imÃ³vel rural tem um cÃ³digo, no formato `UF-cÃ³digo do municÃ­pio-32 letras e nÃºmeros` (ex.: `MT-5107925-1A2Bâ€¦`). O cadastro pode estar **ativo, pendente, suspenso ou cancelado**. |
| **Sicar** | O sistema do governo onde ficam os CARs. |
| **MÃ³dulo fiscal (MF)** | Unidade de tamanho de terra fixada pelo Incra para cada municÃ­pio, de 5 a 110 hectares ([Embrapa](https://www.embrapa.br/en/codigo-florestal/area-de-reserva-legal-arl/modulo-fiscal); valor por municÃ­pio na [consulta do Incra](https://www.gov.br/pt-br/servicos/consultar-indices-basicos)). Serve para classificar o imÃ³vel em pequeno (atÃ© 4 MF), mÃ©dio ou grande. |
| **Prodes** | Programa do Inpe que mede o desmatamento por satÃ©lite, todo ano. |
| **Lista do MMA** | Lista oficial do MinistÃ©rio do Meio Ambiente com os CARs onde o Prodes encontrou desmatamento depois de 31/07/2019. Ã‰ o que o banco consulta para a regra do Prodes. |
| **Embargo** | PuniÃ§Ã£o do Ibama (ou do Ã³rgÃ£o estadual) que proÃ­be usar uma Ã¡rea, geralmente por desmatamento ilegal. |
| **UC** | Unidade de ConservaÃ§Ã£o (parque, reserva, APAâ€¦). Existem as de **ProteÃ§Ã£o Integral** (quase nada Ã© permitido) e as de **Uso SustentÃ¡vel** (permitem atividades, conforme o Plano de Manejo). |
| **TI** | Terra IndÃ­gena, demarcada pela Funai. |
| **Floresta pÃºblica Tipo B** | Floresta em terra do governo que ainda nÃ£o recebeu destino. |
| **ASV / UAS** | AutorizaÃ§Ãµes oficiais para derrubar vegetaÃ§Ã£o legalmente. |
| **PRAD / PRA / TAC** | Planos e acordos oficiais de recuperaÃ§Ã£o ou regularizaÃ§Ã£o ambiental. |
| **DossiÃª** | O documento que o Apto Rural gera para o tÃ©cnico levar ao banco, com o que foi encontrado, a regra e o caminho de saÃ­da. |
| **PostGIS** | ExtensÃ£o do banco de dados PostgreSQL que entende mapas. Ã‰ ela que responde "este desenho encosta naquela Ã¡rea?". |
| **SIRGAS 2000** | O sistema de coordenadas oficial do Brasil, usado em todos os mapas do projeto. |

---

## 3. O que o Apto Rural verifica

Cada linha do semÃ¡foro corresponde a um item do MCR e usa uma base oficial:

| O que checa | Regra (MCR) | Base oficial usada | Como cruza |
| --- | --- | --- | --- |
| CAR ativo (nÃ£o cancelado nem suspenso) | 2-9-3 | Demonstrativo do CAR + lista do MMA | cÃ³digo do CAR |
| Embargo ambiental | 2-9-10 a 13 | Ibama: termos de embargo (atualizaÃ§Ã£o diÃ¡ria) | mapa |
| Desmatamento apÃ³s 31/07/2019 | 2-9-17 e 18 | MMA: lista baseada no Prodes/Inpe | cÃ³digo do CAR |
| Terra indÃ­gena | 2-9-7 | Funai | mapa |
| Unidade de ConservaÃ§Ã£o | 2-9-5 e 6 | MMA: CNUC | mapa |
| TerritÃ³rio quilombola | 2-9-8 | Incra | **sem fonte aberta ainda** (sai "NÃ£o verificado") |
| Floresta pÃºblica Tipo B | 2-9-14 e 15 | ServiÃ§o Florestal: CNFP | mapa |
| Trabalho escravo | 2-9-4 | MinistÃ©rio do Trabalho: Cadastro de Empregadores | CPF/CNPJ (sÃ³ com autorizaÃ§Ã£o do produtor) |

"Cruza pelo mapa" quer dizer: o sistema sobrepÃµe o desenho da fazenda aos mapas oficiais, como duas folhas transparentes, e mede quantos hectares se encostam.

Detalhes que o sistema jÃ¡ trata:

- **Encosta de divisa:** sobreposiÃ§Ã£o menor que 0,1 ha costuma ser erro de desenho e sai como **AtenÃ§Ã£o**, nÃ£o Impedimento. Isso Ã© critÃ©rio do produto, nÃ£o da norma, e estÃ¡ documentado.
- **ExceÃ§Ãµes da norma:** por exemplo, atÃ© 30/06/2027 o embargo tem uma exceÃ§Ã£o se a Ã¡rea embargada for pequena (atÃ© 5% do imÃ³vel, ou 5%/20 ha nos embargos mais novos). O sistema faz essa conta sozinho.
- **Cada item mostra** a norma, a base usada e a data de atualizaÃ§Ã£o dessa base.

---

## 4. As datas que importam

A checagem de desmatamento (Prodes) entra em vigor aos poucos, pela **ResoluÃ§Ã£o CMN 5.303/2026**:

| A partir de | Vale para imÃ³veis com |
| --- | --- |
| **04/01/2027** | mais de 15 mÃ³dulos fiscais (grandes) |
| **01/07/2027** | de 4 a 15 mÃ³dulos fiscais (mÃ©dios) |
| **03/01/2028** | atÃ© 4 mÃ³dulos fiscais (pequenos, a maioria das propriedades) |

As outras regras (CAR, embargo, terra indÃ­gena, UC etc.) **jÃ¡ valem hoje**.

---

## 5. Como o sistema funciona

```
  Bases oficiais do governo (MMA, Ibama, Funai, ServiÃ§o Florestal, MinistÃ©rio do Trabalho)
           â”‚   os "coletores" baixam tudo e guardam com data e origem
           â–¼
  Banco de dados com mapas (PostgreSQL + PostGIS)
           â–²
           â”‚   a API pergunta: "este desenho encosta em quÃª?"
  API (o "balcÃ£o")  â”€â”€â–º  Motor de regras (aplica o MCR item por item)
           â–²
           â”‚
  Site (o tÃ©cnico usa no celular ou no computador)
```

O caminho de uma consulta:

1. O tÃ©cnico digita o **cÃ³digo do CAR**, informa a situaÃ§Ã£o do CAR e os mÃ³dulos fiscais e envia o **arquivo do contorno** da fazenda (KML ou GeoJSON).
2. O site manda isso para a **API**.
3. A API pergunta ao **banco de mapas** o que se sobrepÃµe Ã  fazenda e consulta as listas pelo cÃ³digo do CAR.
4. O **motor de regras** transforma o que foi encontrado em semÃ¡foro, aplicando cada item do MCR e suas exceÃ§Ãµes.
5. O resultado volta para a tela e fica guardado, para poder ser conferido depois pelo **cÃ³digo QR** do relatÃ³rio.

**A carteira funciona assim:** Ã s 4h os coletores atualizam as bases; Ã s 6h o **monitor** reconfere cada fazenda acompanhada, compara com o resultado anterior e, se algo mudou, grava um resultado novo (com dossiÃª e QR), cria um aviso e manda **um e-mail por tÃ©cnico** com todas as mudanÃ§as do dia. MudanÃ§a causada por uma base que falhou ao atualizar (item virando "NÃ£o verificado") nÃ£o gera alarme.

Com as bases reais, cada consulta leva em torno de **0,1 segundo** (veja [docs/teste-fazendas-reais.md](docs/teste-fazendas-reais.md)).

---

## 6. O diferencial: do vermelho ao verde

Mostrar o problema qualquer mapa pÃºblico mostra. O Apto Rural vai alÃ©m:

- **Separa o vermelho real do contestÃ¡vel** (por exemplo, encosta de divisa ou desmatamento que tinha autorizaÃ§Ã£o).
- **Gera o dossiÃª**: o que foi encontrado, a regra, as saÃ­das que a norma admite e a **lista de documentos** a juntar. Para o Prodes, por exemplo, o item 18 do MCR aceita ASV, PRAD, TAC, Termo de Compromisso Ambiental ou laudo de satÃ©lite do banco.
- **RelatÃ³rio verificÃ¡vel**: o cÃ³digo QR abre a consulta original, para o gerente do banco conferir.
- **Carteira com avisos**: o tÃ©cnico coloca as fazendas que atende na carteira e o sistema **reconfere todas, todo dia**. Se aparecer um embargo novo, se o CAR for suspenso ou se chegar a data do Prodes daquele imÃ³vel, o tÃ©cnico recebe um aviso no site e por e-mail. Isso importa porque o banco pode desclassificar um contrato jÃ¡ assinado se a fazenda deixar de cumprir as regras (item 19 do MCR).
- **Feito para o campo**: funciona bem no celular, com sol forte e internet fraca, e envia o resumo pelo WhatsApp.

---

## 7. Como o produto ganha dinheiro

O tÃ©cnico compra **crÃ©ditos**:

| Pacote | PreÃ§o | Inclui |
| --- | --- | --- |
| Consulta avulsa | R$ 39 | 1 consulta |
| DossiÃª avulso | R$ 190 | 1 dossiÃª |
| Pacote Projetista | R$ 199 | 20 consultas + 2 dossiÃªs |
| Pacote EscritÃ³rio | R$ 499 | 100 consultas + 10 dossiÃªs |

- Quem cria a conta ganha **1 consulta grÃ¡tis** assim que **confirma o e-mail** (isso evita contas falsas em sÃ©rie).
- O pagamento Ã© pelo **Asaas** (Pix, cartÃ£o ou boleto). O Apto Rural nunca vÃª dados de cartÃ£o.
- Os preÃ§os sÃ£o valores de partida, a ajustar depois de conversar com tÃ©cnicos.

---

## 8. Rodar no seu computador

### O que precisa estar instalado

- **Node.js 20 ou mais novo**: roda a API e o site.
- **Python 3.11 ou mais novo**: roda os coletores das bases.
- **Docker Desktop**: roda o banco de mapas (PostGIS).

### OpÃ§Ã£o A â€” sÃ³ para ver as telas (sem banco)

```bash
npm install
npm run dev:api
npm run dev:web
```

Abra http://localhost:5173. No modo demonstraÃ§Ã£o (`APTO_DEMO=1` no arquivo `.env`) aparecem trÃªs fazendas **fictÃ­cias** para testar as telas.

### OpÃ§Ã£o B â€” com as bases reais

1. **Suba o banco de mapas.** Ele fica na porta **5433**, para nÃ£o brigar com outro PostgreSQL que jÃ¡ exista no computador.

   ```bash
   docker compose up -d
   ```

2. **Crie o arquivo `.env`** copiando o `.env.example` e preencha (no mÃ­nimo):
   - `DATABASE_URL=postgres://apto:apto@localhost:5433/apto_rural`
   - `DOCUMENTO_HASH_SECRET=` um texto longo e aleatÃ³rio (protege os CPFs)

3. **Carregue as bases oficiais.** Leva alguns minutos; o Ibama e o ServiÃ§o Florestal sÃ£o os maiores.

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

   Dicas: `--simular` sÃ³ lÃª e conta, sem gravar; `--arquivo caminho` usa um arquivo jÃ¡ baixado. Se uma carga falhar no meio, a anterior continua valendo.

4. **Crie as tabelas do banco** (rode de novo sempre que baixar uma versÃ£o nova do cÃ³digo):

   ```bash
   npm run migrar -w @apto/api
   ```

5. **Rode a API e o site** como na opÃ§Ã£o A e crie uma conta em "Entrar". Sem servidor de e-mail configurado, o e-mail de confirmaÃ§Ã£o aparece no terminal da API: abra o link de lÃ¡ para confirmar a conta.

### Testes

```bash
npm test            # regras do MCR + API (contas, compras, pagamentos)
npm run typecheck   # confere os tipos do cÃ³digo
npm run build       # gera a versÃ£o de produÃ§Ã£o do site e da API
```

Teste com fazendas reais (precisa da opÃ§Ã£o B):

```bash
cd coletores
python -m coletores.amostra_mma --bioma cerrado --uf MT --limite 2000
cd ../apps/api
npx tsx --env-file=../../.env scripts/testar-fazendas-reais.ts   # consultas de ponta a ponta
npx tsx --env-file=../../.env scripts/testar-carteira.ts         # carteira + monitor + aviso por e-mail
npx tsx --env-file=../../.env scripts/testar-god-mode.ts         # painel: entrar como, bloqueio, papéis, auditoria
```

Rodar a reconferÃªncia da carteira na hora (sem esperar as 6h):

```bash
npm run monitorar -w @apto/api
```

### Contas e e-mail

- A conta usa e-mail e senha. A senha Ã© guardada sÃ³ como cÃ³digo irreversÃ­vel, e hÃ¡ limite de tentativas de login.
- Ao criar a conta, o sistema manda um **link de confirmaÃ§Ã£o** (vale 48 horas). Confirmado o e-mail, entra a consulta grÃ¡tis.
- **Esqueci minha senha**: manda um link que vale 1 hora e sÃ³ funciona uma vez. Ao criar a senha nova, a conta sai de todos os outros aparelhos.
- O e-mail sai por **SMTP** (qualquer provedor). Configure `SMTP_HOST`, `SMTP_PORTA`, `SMTP_USUARIO`, `SMTP_SENHA` e `EMAIL_REMETENTE`. Sem isso, no desenvolvimento, o e-mail aparece no terminal da API.

### Pagamentos

- Sem chave do Asaas e com `APTO_DEMO=1`, a compra abre uma **fatura simulada**, que nÃ£o cobra nada.
- Para cobrar de verdade, preencha `ASAAS_API_KEY`, `ASAAS_AMBIENTE` (`sandbox` para testes, `producao` para valer) e `ASAAS_WEBHOOK_TOKEN`.
- No painel do Asaas, aponte o webhook de cobranÃ§as para `https://<seu-domÃ­nio>/v1/webhooks/asaas`.

### Colocar no ar (produÃ§Ã£o)

Tudo que roda no servidor sobe com um comando:

| PeÃ§a | O que faz |
| --- | --- |
| Banco de mapas | PostgreSQL + PostGIS. |
| API + site | No mesmo endereÃ§o; atualiza a estrutura do banco sozinha ao subir. |
| Coletores | Todo dia Ã s 4h conferem as bases oficiais e sÃ³ recarregam o que mudou. |
| Monitor | Todo dia Ã s 6h reconfere as carteiras e manda os avisos por e-mail. |
| Caddy | HTTPS (o cadeado) automÃ¡tico e renovado sozinho. |
| Backup | CÃ³pia diÃ¡ria do banco, guardando 14 dias. |

```bash
cp .env.producao.example .env.producao   # preencha domÃ­nio, senhas e Asaas
docker compose -f docker-compose.prod.yml --env-file .env.producao up -d --build
```

O passo a passo completo (servidor, domÃ­nio, webhook do Asaas, backups) estÃ¡ em [docs/implantacao.md](docs/implantacao.md).

---

## 9. Mapa das pastas

```
packages/regras   O coraÃ§Ã£o: cada regra do MCR em cÃ³digo, com a norma citada e testes.
apps/api          A API (o "balcÃ£o"): contas, consultas, crÃ©ditos e pagamentos.
apps/web          O site, pensado para o celular no campo.
coletores         Scripts que baixam as bases oficiais e guardam a origem de cada arquivo.
db/migrations     A estrutura do banco de dados (aplicada em ordem, uma vez cada).
db/teste          Consultas SQL usadas sÃ³ para testar com dados reais.
deploy            ConfiguraÃ§Ã£o do HTTPS (Caddy) e do backup diÃ¡rio.
Dockerfile        Imagem de produÃ§Ã£o da API + site.
docs              Fontes oficiais, cuidados legais, arquitetura, interface e relatÃ³rios de teste.
```

Tecnologias: TypeScript (Node + Fastify na API, React + Vite no site), Python nos coletores, PostgreSQL + PostGIS no banco.

---

## 10. SituaÃ§Ã£o do projeto

**Pronto e testado**

- [x] Motor com as regras do MCR 2-9, incluindo as ResoluÃ§Ãµes 5.193/2024, 5.268/2025 e 5.303/2026.
- [x] Seis bases oficiais carregadas e testadas com fazendas reais de MT e PA, sem divergÃªncia.
- [x] Site para celular: consulta, semÃ¡foro, relatÃ³rio em PDF, resumo por WhatsApp e pÃ¡gina de fontes.
- [x] DossiÃª v1, com checklist de documentos e cÃ³digo QR.
- [x] Contas, crÃ©ditos e pagamento (Asaas real + simulado para desenvolvimento).
- [x] ConfirmaÃ§Ã£o de e-mail e recuperaÃ§Ã£o de senha por e-mail (SMTP).
- [x] Carteira de fazendas com reconferÃªncia diÃ¡ria e avisos no site e por e-mail (testada com fazendas reais e embargo simulado).
- [x] Pacote de produÃ§Ã£o: imagem Docker, HTTPS automÃ¡tico, backup diÃ¡rio, migraÃ§Ãµes e atualizaÃ§Ã£o automÃ¡tica das bases.

**Falta para lanÃ§ar**

- [ ] Contratar o servidor e o domÃ­nio e subir seguindo [docs/implantacao.md](docs/implantacao.md).
- [ ] Contratar um provedor de e-mail (SMTP) e verificar o domÃ­nio nele (o cÃ³digo jÃ¡ estÃ¡ pronto).
- [ ] RevisÃ£o de um advogado: termos de uso, privacidade (LGPD) e linguagem do dossiÃª.
- [ ] Conta no Asaas aprovada (chaves de sandbox e de produÃ§Ã£o).
- [ ] Confirmar as licenÃ§as de uso das bases da Funai e do MMA.

**Depois do lanÃ§amento**

- [ ] Imagens de satÃ©lite antes e depois de 2019 no dossiÃª.
- [ ] Definir se a carteira entra nos pacotes pagos (hoje: grÃ¡tis, atÃ© 50 imÃ³veis por conta).
- [ ] Consulta pelo WhatsApp, inclusive a consulta grÃ¡tis para o produtor.
- [ ] Fonte aberta para territÃ³rios quilombolas.

---

## 11. Regras de ouro do projeto

1. **SÃ³ fonte oficial.** Nenhuma regra entra no cÃ³digo sem a norma oficial citada (Banco Central, ministÃ©rios, Ibama, Inpeâ€¦). O que nÃ£o foi confirmado fica marcado "A CONFIRMAR".
2. **Nunca verde sem checar.** Se uma base nÃ£o foi consultada, o item aparece como "NÃ£o verificado".
3. **Linguagem cuidadosa.** O sistema nÃ£o chama ninguÃ©m de "irregular" nem "ilegal": mostra o que consta nas bases.
4. **Dados pessoais protegidos (LGPD).** CPF/CNPJ sÃ³ com autorizaÃ§Ã£o e guardado apenas como cÃ³digo irreversÃ­vel. O CPF de cobranÃ§a vai direto ao Asaas.
5. **Regras mudam.** Quando sair uma nova resoluÃ§Ã£o, atualizam-se a regra, os testes e a documentaÃ§Ã£o juntos.

---

## 12. Documentos de apoio

| Documento | Para que serve |
| --- | --- |
| [docs/fontes-oficiais.md](docs/fontes-oficiais.md) | Cada norma e cada base, com link oficial e situaÃ§Ã£o. |
| [docs/conformidade-legal.md](docs/conformidade-legal.md) | Cuidados legais e critÃ©rios do produto que precisam de revisÃ£o jurÃ­dica. |
| [docs/arquitetura.md](docs/arquitetura.md) | Como as peÃ§as se encaixam e por quÃª. |
| [docs/frontend.md](docs/frontend.md) | DecisÃµes de interface para o tÃ©cnico do campo. |
| [docs/teste-fazendas-reais.md](docs/teste-fazendas-reais.md) | RelatÃ³rio do teste com fazendas reais. |
| [docs/implantacao.md](docs/implantacao.md) | Como colocar o sistema no ar, passo a passo. |
| [Plano de negÃ³cio](https://claude.ai/artifact/1vcJWqtW6fs2MTWsVmahhW) | Mercado, preÃ§os, riscos e plano de lanÃ§amento. |
