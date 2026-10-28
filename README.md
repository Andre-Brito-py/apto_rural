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
6. [As telas, uma por uma](#6-as-telas-uma-por-uma)
7. [O diferencial: do vermelho ao verde](#7-o-diferencial-do-vermelho-ao-verde)
8. [Como o produto ganha dinheiro](#8-como-o-produto-ganha-dinheiro)
9. [Rodar no seu computador](#9-rodar-no-seu-computador)
10. [Mapa das pastas](#10-mapa-das-pastas)
11. [Situação do projeto](#11-situação-do-projeto)
12. [Regras de ouro do projeto](#12-regras-de-ouro-do-projeto)
13. [Documentos de apoio](#13-documentos-de-apoio)

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

**De onde vem o número de módulos fiscais do imóvel**, nesta ordem:

1. **O que o técnico digitar**, tirado do recibo ou do demonstrativo do CAR.
2. **A lista oficial do MMA**, que traz o número de cada CAR que está nela.
3. **Uma estimativa**, quando não há nenhum dos dois: a área do contorno dividida pelo **módulo fiscal do município**, que é fixado pelo Incra (Decreto 84.685/1980, art. 4º; Instrução Especial Incra 5/2022). Exemplo: 1.581 ha em Jangada/MT, onde o módulo fiscal é de 80 ha, dão 19,8 módulos.

O resultado avisa quando o número é estimativa e pede para conferir no CAR se ele estiver perto de 4 ou de 15, porque ali a data muda. Na reconferência diária da carteira, a lista do MMA vem antes do que foi digitado. Como a fonte foi confirmada está em [docs/fontes-oficiais.md](docs/fontes-oficiais.md).

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

1. O técnico digita o **código do CAR**, informa a situação do CAR e os módulos fiscais e envia o **arquivo do contorno** da fazenda (shapefile em .zip, KML ou GeoJSON). O site mostra uma prévia do desenho e da área para o técnico conferir.
2. O site manda isso para a **API**.
3. A API pergunta ao **banco de mapas** o que se sobrepõe à fazenda e consulta as listas pelo código do CAR.
4. O **motor de regras** transforma o que foi encontrado em semáforo, aplicando cada item do MCR e suas exceções.
5. O resultado volta para a tela e fica guardado, para poder ser conferido depois pelo **código QR** do relatório. Junto vai um **mapa do imóvel e do entorno**, que mostra onde a fazenda encosta em embargo, terra indígena, Unidade de Conservação etc.

**A carteira funciona assim:** às 4h os coletores atualizam as bases; às 6h o **monitor** reconfere cada fazenda acompanhada, compara com o resultado anterior e, se algo mudou, grava um resultado novo (com dossiê e QR), cria um aviso e manda **um e-mail por técnico** com todas as mudanças do dia. Mudança causada por uma base que falhou ao atualizar (item virando "Não verificado") não gera alarme.

**A consulta em lote funciona assim** (página `/lote`, para escritórios e cooperativas): o técnico envia uma **planilha CSV** com os códigos do CAR (até 200) e, se tiver, **todos os arquivos de contorno de uma vez**. O site acha o contorno de cada imóvel pelo código do CAR no nome do arquivo ou na tabela de atributos (o .zip do Sicar traz o código na camada AREA_IMOVEL; um arquivo do escritório com várias fazendas também serve). Antes de gastar, a tela mostra a lista, quais imóveis têm contorno e quantos créditos o lote usa. Cada imóvel vira uma consulta normal, com resultado, mapa e QR. No fim, dá para **baixar o resultado em planilha** e **pôr todos na carteira** de uma vez.

**Explicação para o produtor (IA):**
- **O que faz:** no resultado, o botão "Explicar para o produtor" escreve em palavras simples o que deu e o que dá para fazer, pronto para o WhatsApp.
- **A IA não decide nada:** ela só reescreve o que as regras já decidiram, sem receber dado pessoal. O texto é conferido antes de aparecer, e é barrado se mudar a situação, prometer aprovação ou inventar número.
- **Sem IA:** vale uma explicação montada direto das regras.
- **A chave da OpenAI** entra pelo painel (aba Inteligência artificial), guardada cifrada e sem reinstalar nada.

Detalhes em [docs/ia.md](docs/ia.md).

**Ajuda sem esperar ninguém:**
- **Central de ajuda:** o botão verde "Dúvidas?", em todas as telas, abre um chat com **respostas prontas**. Ele sugere as dúvidas da tela aberta e entende a pergunta escrita com as próprias palavras. Não usa IA nem custa nada.
- **Tour:** na primeira entrada, 8 passos mostram as funções principais. Ele não volta depois, mas pode ser revisto pela ajuda.
- **Menu:** no celular, o botão "Menu" leva a todas as telas.

Como acrescentar uma resposta: [docs/central-de-ajuda.md](docs/central-de-ajuda.md).

Com as bases reais, cada consulta leva em torno de **0,1 segundo** (veja [docs/teste-fazendas-reais.md](docs/teste-fazendas-reais.md)).

---

## 6. As telas, uma por uma

As imagens abaixo são do próprio sistema, no modo de demonstração, com **dados fictícios** (os CARs `MT-0000000-…` são exemplos). Elas foram tiradas em 28/10/2026; para refazer depois de mudar uma tela, veja [docs/telas.md](docs/telas.md).

### 6.1 Página inicial (quem chega sem conta)

![Página inicial](docs/img/telas/01-inicio.png)

A página de vendas para quem ainda não tem conta.
- **O que mostra:** o que o Apto Rural faz, um exemplo de resultado e as vantagens (1ª consulta grátis, só bases oficiais, resultado em segundos).
- **O que dá para fazer:** "Consultar uma fazenda grátis" (cria a conta), "Como funciona" e os menus de planos, ajuda e entrada.
- Quem já tem conta não vê esta página: entra direto na consulta.

### 6.2 Nova consulta

![Nova consulta](docs/img/telas/02-nova-consulta.png)

Onde o técnico informa o imóvel. São três blocos:
1. **Dados do imóvel:**
   - **"Preencher com o recibo do CAR (PDF)":** lê o recibo ou o demonstrativo do Sicar e preenche o código, a situação e os módulos fiscais. O arquivo fica no aparelho; só o texto é lido.
   - **Código do CAR:** aceita com ou sem pontos e confere o formato antes de gastar.
   - **Situação do CAR:** ativo, pendente, suspenso, cancelado ou "não sei".
   - **Módulos fiscais:** com o contorno, o sistema mostra uma estimativa pela tabela do Incra.
2. **Mapa do imóvel:** o arquivo do contorno (shapefile em .zip, KML ou GeoJSON). Antes de consultar, aparece uma prévia do desenho e da área para conferir.
3. **Opcional:** CAR coletivo e a checagem do CPF/CNPJ do produtor no cadastro do Ministério do Trabalho (só com a autorização dele).

Os botões "Testar com um exemplo fictício" mostram resultados de demonstração sem gastar crédito. "Muitos imóveis?" leva à consulta em lote.

### 6.3 Resultado

![Resultado da consulta](docs/img/telas/03-resultado.png)

A resposta da consulta, de cima para baixo:
- **O semáforo:** "Impedimento provável", "Atenção" ou "Sem impedimento encontrado", com a contagem de itens (impedimento, atenção, não verificado, ok).
- **Dados da consulta:** CAR, data e o código de verificação, o mesmo do QR.
- **Botões:** enviar o resumo no WhatsApp, salvar o relatório em PDF e abrir o dossiê.
- **Explicação para o produtor:** um texto em palavras simples, pronto para mandar (veja 6.5).
- **Mapa do imóvel e do entorno** (veja 6.4).
- **Acompanhar este imóvel:** põe o imóvel na carteira (nas consultas reais).

**Item por item do MCR 2-9.** Mais abaixo, cada item do Manual de Crédito Rural aparece com o resultado, o que foi encontrado, as **saídas que a própria norma admite** (com os documentos de cada uma), a base oficial com a data de atualização e o item da norma.

<img src="docs/img/telas/04b-itens.png" alt="Item por item do MCR" width="520">

O que o técnico tira daqui:
- **O que pesa e por quê:** no exemplo, um embargo do Ibama dá impedimento, e o desmatamento depois de 2019 dá atenção, porque a exigência só começa em 01/07/2027 para esse imóvel.
- **O que o sistema já conferiu sozinho:** por exemplo, se a área embargada está dentro do limite de 5% da exceção temporária.
- **O que ficou sem conferir:** fica marcado "Não verificado" e nunca aparece como verde.

### 6.4 Mapa do imóvel e do entorno

![Mapa do entorno](docs/img/telas/04-mapa.png)

O desenho da fazenda e do que está em volta:
- **O que encosta no imóvel:** cada área ganha um número no ponto de contato, com quantos hectares ficam dentro (no exemplo, 18 ha de um embargo do Ibama).
- **O que está perto:** a distância até o imóvel, como a Unidade de Conservação a 913 m do exemplo.
- **Escala, norte e a fonte** de cada base, com a data. O desenho é simplificado; os limites oficiais são os de cada órgão.

O mapa é guardado como foto do dia da consulta e também sai no dossiê.

### 6.5 Explicação para o produtor

![Explicação para o produtor](docs/img/telas/05-explicacao.png)

Um texto curto que o técnico manda ao produtor: o que deu, o que pesa e o que dá para fazer.
- **Com a IA ligada,** a inteligência artificial escreve o texto a partir do resultado oficial, e uma conferência automática barra qualquer texto que mude a situação, prometa aprovação ou invente número.
- **Sem IA,** sai a explicação montada direto das regras (a da imagem).
- **Botões:** "Copiar texto" e "Mandar para o produtor" (WhatsApp).

### 6.6 Dossiê do imóvel

![Dossiê](docs/img/telas/06-dossie.png)

O documento para levar ao banco quando a consulta dá impedimento ou atenção. Gerar usa 1 crédito de dossiê.
- **Cabeçalho:** CAR, data, código de verificação e o **QR** que abre a consulta original, para o gerente conferir.
- **Resumo** dos itens com problema e o tipo de cada um ("Plano de saída" ou "Dossiê de contestação").
- **Mapa** e, para cada item, o que foi encontrado, a base, a norma e as saídas, com o **checklist dos documentos** a juntar.
- **Observações e assinatura** do responsável técnico.
- **"Imprimir ou salvar em PDF"** tira só a folha, sem os menus do site.

**Apoio para montar cada item.** Só aparece na tela, não sai na impressão:

<img src="docs/img/telas/07-dossie-apoio.png" alt="Apoio do dossiê" width="560">

- **Conferir um documento:** o técnico envia a ASV, o PRAD, o TAC, a licença… A IA compara com a consulta e marca cada ponto como "Confere", "Diverge" ou "Conferir". O arquivo não fica guardado.
- **Rascunhos:**
  - **Quais aparecem:** a "Carta ao banco" em todos os itens; o "Pedido de correção do desenho do CAR" nos itens de mapa; o "Requerimento ao órgão responsável" para embargo, Prodes e CAR.
  - **Como usar:** o texto vem numa caixa editável, com [colchetes] no que falta completar, e o botão "Copiar texto".
  - **Sem IA:** sai um modelo fixo, como na imagem.

### 6.7 Consulta em lote

![Consulta em lote](docs/img/telas/08-lote.png)

Para escritórios e cooperativas: vários imóveis de uma vez.
1. **Planilha (CSV)** com os códigos do CAR, até 200 linhas. Há uma planilha-modelo para baixar.
2. **Contornos** (opcional), todos de uma vez. O sistema acha o imóvel pelo código do CAR no nome do arquivo ou dentro dele.

Antes de gastar, a tela mostra a lista, quais imóveis têm contorno e quantos créditos o lote usa. No fim, dá para baixar o resultado em planilha e pôr todos na carteira.

### 6.8 Carteira

![Carteira](docs/img/telas/09-carteira.png)

Os imóveis que o técnico acompanha. Todo dia de manhã o sistema reconfere cada um com as bases atualizadas. Se surgir um embargo, mudar a situação do CAR ou chegar a data do Prodes, aparece um aviso aqui e vai um e-mail, com uma frase explicando o que mudou e o que fazer. Dá para incluir um imóvel ou vários (em lote). O número de imóveis depende do plano. Na imagem, a carteira está vazia, como fica para quem acabou de criar a conta.

### 6.9 Planos

![Planos](docs/img/telas/10-planos.png)

Onde o cliente compra.
- **Assinatura mensal:** planos Projetista e Escritório, com créditos todo mês e a carteira inclusa.
- **Compra avulsa:** uma consulta ou um dossiê.
- **Saldo:** quantas consultas e dossiês a pessoa ainda tem.
- **Cupom:** campo para o cupom de desconto; o link de divulgação `/planos?cupom=CÓDIGO` já chega com o cupom aplicado.
- **Pagamento:** Pix, cartão ou boleto, pelo Asaas. Os preços vêm do painel e mudam sem mexer no código.

### 6.10 Central de ajuda

![Central de ajuda](docs/img/telas/11-central-de-ajuda.png)

O botão verde "Dúvidas?", em todas as telas, abre um chat com **61 respostas prontas**, conferidas no código.
- **Sugestões:** as dúvidas comuns da tela aberta.
- **Perguntas escritas:** entende o jeito de cada um perguntar ("aceita pix?", "carta ao banco") e mostra links para a tela certa.
- **Sem resposta pronta:** diz que não achou e oferece os assuntos, sem inventar.
- **Custo:** não usa IA e roda no próprio navegador.

A página `/ajuda` tem as mesmas respostas, com busca. Pela ajuda também dá para rever o **tour de boas-vindas**, que mostra o sistema em 8 passos na primeira entrada.

### 6.11 Minha conta

![Minha conta](docs/img/telas/12-minha-conta.png)

- **Saldo** de consultas e dossiês, e atalhos para consultar, carteira, equipe e planos.
- **Dados da conta** e a confirmação do e-mail.
- **Verificação em duas etapas:** código do aplicativo autenticador, além da senha, com códigos de recuperação.
- **Seus dados (LGPD):** baixar tudo num arquivo e excluir a conta.

### 6.12 No celular

<img src="docs/img/telas/13-celular-resultado.png" alt="Resultado no celular" width="300">

Tudo funciona no celular, sem rolagem para os lados: as telas se reorganizam em uma coluna, os botões ficam grandes para o dedo e o menu reúne todas as telas. Foi pensado para quem está no campo, com sol forte e internet fraca.

### 6.13 Painel administrativo

Só para quem está em `ADMIN_EMAILS`. Em produção, abre só com a verificação em duas etapas ligada e vale 12 horas por login.

**Visão geral:**

![Painel: visão geral](docs/img/telas/14-painel.png)

- **Negócio:** receita recorrente, receita em 30 dias, pedidos pendentes e contas.
- **Uso:** consultas, imóveis na carteira, créditos em circulação e erros das últimas 24 horas.
- **Servidor:** backup, cópia fora do servidor e vigia do site. Na imagem estão em vermelho porque é o ambiente de demonstração, sem backup configurado.
- **Bases oficiais:** a data de cada uma e se está em dia.
- **Outras abas:** usuários (ficha, créditos, bloqueio, "entrar como"), pedidos (estorno e cancelamento), preços e limites, e auditoria (o registro de tudo o que foi feito no painel).

**Cupons:**

![Painel: lista de cupons](docs/img/telas/16-painel-cupons.png)

A lista mostra cada cupom com desconto, onde vale, usos, validade, situação, desconto dado e receita. Ao criar um cupom, o administrador escolhe:
- porcentagem ou valor fixo;
- em quais planos e produtos vale;
- por quantas mensalidades;
- quantas vezes pode ser usado, no total e por conta;
- de que data a que data vale.

Antes de salvar, a tela mostra **como fica o preço** de cada plano:

![Painel: novo cupom](docs/img/telas/15-painel-novo-cupom.png)

**Inteligência artificial:**

![Painel: inteligência artificial](docs/img/telas/17-painel-ia.png)

- **Chave da OpenAI:** guardada cifrada; depois de salva, só aparece o final.
- **Ligar a IA** e escolher as funções. Cada uma diz o que acontece quando está desligada.
- **Modelo e limite de chamadas por dia.**
- **Uso do mês,** por função, com o custo estimado.
- **O que vai para a OpenAI**, explicado na própria tela.
- **Normas novas:** cole o texto de uma resolução e a IA aponta o que mudou e quais regras do site conferir.

---

## 7. O diferencial: do vermelho ao verde

Mostrar o problema qualquer mapa público mostra. O Apto Rural vai além:

- **Separa o vermelho real do contestável** (por exemplo, encosta de divisa ou desmatamento que tinha autorização).
- **Gera o dossiê**: o que foi encontrado, a regra, as saídas que a norma admite e a **lista de documentos** a juntar. Para o Prodes, por exemplo, o item 18 do MCR aceita ASV, PRAD, TAC, Termo de Compromisso Ambiental ou laudo de satélite do banco.
- **Relatório verificável**: o código QR abre a consulta original, para o gerente do banco conferir.
- **Carteira com avisos**: o técnico coloca as fazendas que atende na carteira e o sistema **reconfere todas, todo dia**. Se aparecer um embargo novo, se o CAR for suspenso ou se chegar a data do Prodes daquele imóvel, o técnico recebe um aviso no site e por e-mail. Isso importa porque o banco pode desclassificar um contrato já assinado se a fazenda deixar de cumprir as regras (item 19 do MCR).
- **Feito para o campo**: funciona bem no celular, com sol forte e internet fraca, e envia o resumo pelo WhatsApp.

---

## 8. Como o produto ganha dinheiro

O principal é a **assinatura mensal**: todo mês o técnico recebe créditos e pode acompanhar mais fazendas na carteira.

| Plano | Preço | Todo mês | Carteira | Pessoas |
| --- | --- | --- | --- | --- |
| Projetista | R$ 199/mês | 20 consultas + 2 dossiês | até 50 fazendas | 1 |
| Escritório | R$ 499/mês | 100 consultas + 10 dossiês | até 300 fazendas | até 5 (equipe) |
| Sem assinatura | — | — | até 5 fazendas | 1 |

Para quem não quer assinar, há **compra avulsa**: consulta por R$ 39 e dossiê por R$ 190.

Como funciona a assinatura:

- O Asaas cobra todo mês (Pix, cartão ou boleto). **Cada mensalidade paga lança os créditos do mês.**
- **Créditos que sobram passam para o mês seguinte** (não vencem).
- **Mensalidade atrasada:** a assinatura fica "em atraso" e a carteira volta ao limite de quem não assina até o pagamento. Ninguém perde fazendas que já acompanha: o limite só vale para incluir novas.
- **Cancelar:** o próprio técnico cancela na página de planos, a qualquer momento. As próximas mensalidades deixam de ser cobradas e os créditos que ele já tem continuam dele.
- **Trocar de plano:** cancela o atual e assina o outro.
- Valor, créditos, carteira e número de pessoas ficam **fixados na contratação**: se o plano mudar no painel, quem já assina continua com as condições de quando assinou.

### Cupons de desconto

Para conquistar os primeiros clientes, o administrador cria **cupons** no painel (aba **Cupons**) e divulga o código ou o link `/planos?cupom=CODIGO`, que já abre com o cupom aplicado.

- **Desconto** em porcentagem ou em reais, em todos os planos e produtos ou só nos escolhidos.
- **Na assinatura**, vale nas primeiras mensalidades (quantas você quiser) ou em todas. Quando acabam os meses de desconto, **a mensalidade volta sozinha ao valor cheio no Asaas**.
- **Controle total:** quantas vezes pode ser usado no total e por conta, só para a primeira compra, de que dia a que dia, pausar a qualquer momento e encerrar o desconto de uma assinatura.
- O painel mostra, para cada cupom, os usos, quem usou, quanto de desconto já foi dado e quanto entrou de receita.
- O desconto vai direto no valor da cobrança do Asaas (Pix, cartão ou boleto). O Asaas não cobra menos de R$ 5,00: compra avulsa pode sair de graça (100%, sem cobrança, créditos na hora), e mensalidade fica em R$ 5,00 ou mais.

Todas as regras, com exemplos, estão em [docs/cupons.md](docs/cupons.md).

### Equipe (plano Escritório)

Um escritório tem várias pessoas atendendo produtores. No plano Escritório, **quem assina (o responsável) convida a equipe por e-mail**, e todos passam a usar **os mesmos créditos e a mesma carteira**, cada um com o próprio login.

| Papel | O que faz |
| --- | --- |
| **Responsável** | Quem assina e paga. Faz tudo o que os outros fazem. É o único que compra, assina e cancela. |
| **Administrador** | Convida e remove pessoas, muda papéis e tira imóveis da carteira. Recebe os avisos da carteira por e-mail, junto com o responsável. |
| **Técnico** | Consulta imóveis, gera dossiês e põe imóveis na carteira, usando os créditos da equipe. |

Como funciona, em detalhes:

- **Convite:** em **Equipe**, o responsável (ou um administrador) digita o e-mail e escolhe o papel. A pessoa recebe um link que vale **7 dias** e **uma vez só**. Só aceita quem entra com **o mesmo e-mail** convidado; se a pessoa ainda não tem conta, cria pelo próprio link.
- **Limite:** o Escritório comporta **5 pessoas, contando o responsável e os convites em aberto**. Cancelar um convite ou remover alguém libera a vaga. O número é editável no painel (coluna "Pessoas" dos planos).
- **Créditos:** cada consulta de alguém da equipe gasta 1 crédito da conta do responsável, e o sistema guarda **quem usou**. A tela Equipe mostra quantas consultas cada pessoa fez no mês.
- **Créditos pessoais:** quem entra na equipe com créditos próprios não os perde: eles ficam guardados e voltam se a pessoa sair.
- **Quem já assina outro plano** precisa cancelar a assinatura antes de entrar numa equipe, para não pagar em dobro.
- **Sair:** técnicos e administradores podem sair quando quiserem; o responsável e os administradores podem remover pessoas. Quem sai volta a usar só a própria conta.
- **Se o plano for cancelado ou atrasar:** quem já está na equipe continua nela e usando os créditos que já foram pagos, mas não dá para convidar mais ninguém até o plano voltar a ficar em dia.
- **Se o responsável excluir a conta:** a equipe é desfeita e cada pessoa volta à própria conta.

Outras regras:

- Quem cria a conta ganha **1 consulta grátis** assim que **confirma o e-mail** (isso evita contas falsas em série).
- O pagamento é pelo **Asaas** (Pix, cartão ou boleto). O Apto Rural nunca vê dados de cartão.
- Os preços são valores de partida, a ajustar depois de conversar com técnicos. Eles podem ser mudados pelo painel, sem mexer no código.

---

## 9. Rodar no seu computador

### O que precisa estar instalado

- **Node.js 22.12 ou mais novo**: roda a API e o site (o Vite 8 não funciona em versões anteriores).
- **Python 3.11 ou mais novo**: roda os coletores das bases.
- **Docker Desktop**: roda o banco de mapas (PostGIS).

### Opção A — só para ver as telas (sem banco)

```bash
npm install
npm run dev:api
npm run dev:web
```

Abra http://localhost:5180 (porta própria do Apto Rural, para não misturar com outros projetos que usam a 5173, a porta padrão do Vite). No modo demonstração (`APTO_DEMO=1` no arquivo `.env`) aparecem três fazendas **fictícias** para testar as telas.

### Opção B — com as bases reais

1. **Suba o banco de mapas.** Ele fica na porta **5433**, para não brigar com outro PostgreSQL que já exista no computador.

   ```bash
   docker compose up -d
   ```

2. **Crie o arquivo `.env`** copiando o `.env.example` e preencha (no mínimo):
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
   python -m coletores.incra_modulo_fiscal
   ```

   Dicas: `--simular` só lê e conta, sem gravar; `--arquivo caminho` usa um arquivo já baixado. Se uma carga falhar no meio, a anterior continua valendo.

4. **Crie as tabelas do banco** (rode de novo sempre que baixar uma versão nova do código):

   ```bash
   npm run migrar -w @apto/api
   ```

5. **Rode a API e o site** como na opção A e crie uma conta em "Entrar". Sem servidor de e-mail configurado, o e-mail de confirmação aparece no terminal da API: abra o link de lá para confirmar a conta.

6. **Contas prontas para ver as telas internas (opcional).** Para olhar o painel administrativo, a equipe, a carteira e o dossiê sem montar tudo à mão:

   ```bash
   npm run contas-locais -w @apto/api
   ```

   O script cria duas contas, gera senhas novas a cada vez e as grava no arquivo **`acesso-local.txt`**, na raiz do projeto (esse arquivo não vai para o GitHub):
   - **admin@apto.local**: administradora do painel (`/admin`) e responsável por uma equipe no plano Escritório (pagamento simulado), com fazendas reais na carteira e um dossiê pronto. Precisa da amostra de fazendas do MMA (veja "Teste com fazendas reais").
   - **tecnica@apto.local**: técnica da mesma equipe, para ver o site como um membro.

   Só funciona no computador de desenvolvimento (`APTO_DEMO=1`); em produção o script se recusa a rodar.

> **Windows: "a execução de scripts foi desabilitada neste sistema"?** O PowerShell bloqueia o atalho `npm`. Sem mudar nenhuma configuração de segurança, use `npm.cmd` no lugar (ex.: `npm.cmd run dev:api`).

No computador de desenvolvimento, a API só aceita conexões do próprio computador (`127.0.0.1`), não da rede do Wi-Fi. Em produção, dentro do Docker, ela escuta em todas as interfaces para o Caddy alcançá-la; quem chega da internet passa sempre pelo Caddy.

### Testes

```bash
npm test            # regras do MCR + API (contas, compras, pagamentos) + leitura da planilha do lote
npm run typecheck   # confere os tipos do código
npm run build       # gera a versão de produção do site e da API
npm run e2e         # abre o site num Chrome de verdade (computador e celular) e faz o caminho do cliente
```

Os testes no navegador precisam do banco e de uma caixa de correio falsa no ar; o passo a passo está em [docs/testes-navegador.md](docs/testes-navegador.md). No GitHub, eles rodam sozinhos a cada envio.

Teste com fazendas reais (precisa da opção B):

```bash
cd coletores
python -m coletores.amostra_mma --bioma cerrado --uf MT --limite 2000
cd ../apps/api
npx tsx --env-file=../../.env scripts/testar-fazendas-reais.ts   # consultas de ponta a ponta
npx tsx --env-file=../../.env scripts/testar-carteira.ts         # carteira + monitor + aviso por e-mail
npx tsx --env-file=../../.env scripts/testar-god-mode.ts         # painel: entrar como, bloqueio, papéis, auditoria
npx tsx --env-file=../../.env scripts/testar-exclusao.ts         # LGPD: baixar meus dados e excluir a conta
npx tsx --env-file=../../.env scripts/testar-equipe.ts           # equipe: convites, papéis, créditos e carteira compartilhados
```

Rodar a reconferência da carteira na hora (sem esperar as 6h):

```bash
npm run monitorar -w @apto/api
```

### Contas e e-mail

- A conta usa e-mail e senha. A senha é guardada só como código irreversível, e há limite de tentativas de login.
- Ao criar a conta, o sistema manda um **link de confirmação** (vale 48 horas). Confirmado o e-mail, entra a consulta grátis.
- **Esqueci minha senha**: manda um link que vale 1 hora e só funciona uma vez. Ao criar a senha nova, a conta sai de todos os outros aparelhos.
- O e-mail sai por **SMTP** (qualquer provedor). Configure `SMTP_HOST`, `SMTP_PORTA`, `SMTP_USUARIO`, `SMTP_SENHA` e `EMAIL_REMETENTE`. Sem isso, no desenvolvimento, o e-mail aparece no terminal da API.

### Painel administrativo e monitoramento

O painel fica em `/admin` e tem dois níveis de acesso:

| Nível | O que pode |
| --- | --- |
| **Suporte** | Ver tudo (indicadores, bases, erros, usuários, pedidos), abrir a ficha de qualquer usuário, **entrar como** ele (só leitura) e reenviar a confirmação de e-mail. |
| **Administrador** | Tudo do suporte, mais: ajustar créditos, bloquear e desbloquear contas, mudar o papel de alguém, estornar e cancelar pedidos, criar e controlar cupons de desconto, mudar preços e limites e ver a auditoria. |

- **Primeiro acesso:** coloque seu e-mail em `ADMIN_EMAILS` no `.env`. Quem está ali é sempre administrador, desde que tenha confirmado o e-mail. **Em produção, ligue antes a verificação em duas etapas em Minha conta:** sem ela, o painel fica bloqueado para administração e suporte.
- **Login recente e aviso:** os poderes do painel valem por 12 horas depois do login (depois, é só entrar de novo), e cada login de administração ou suporte manda um e-mail de aviso. Os demais papéis são dados pela ficha do usuário no próprio painel.
- **Entrar como:** você vê o site exatamente como o cliente vê, por até 1 hora, com uma faixa marrom no topo. Nada pode ser alterado nesse modo: nenhuma compra, consulta ou mudança. O botão "Voltar ao painel" encerra o modo.
- **Bloquear conta:** o cliente sai na hora de todos os aparelhos e não consegue mais entrar.
- **Auditoria:** toda ação administrativa fica registrada (quem fez, o quê, em quem, quando).
- **Estornar pedido pago:** o dinheiro volta pelo Asaas (Pix ou cartão; no cartão pode levar até 10 dias úteis para aparecer na fatura) e os créditos do pacote saem da conta do cliente na hora. O saldo pode ficar negativo se ele já tiver usado os créditos. Boleto pago, e Pix quando falta saldo na conta Asaas, precisam ser estornados pelo painel do próprio Asaas: o Apto Rural avisa quando for o caso.
- **Cancelar pedido pendente:** remove a cobrança no Asaas, antes de o cliente pagar.
- **Assinaturas:** o painel mostra a receita recorrente, os assinantes e quem está em atraso; a ficha de cada usuário mostra as assinaturas dele, quantos meses pagou e permite cancelar.
- **Cupons de desconto:** na aba **Cupons**, o administrador cria, edita, pausa e acompanha os cupons, e copia o link de divulgação. Veja [docs/cupons.md](docs/cupons.md).
- **Configurações sem mexer no código:** na seção "Configurações" do painel, o administrador muda os planos mensais (preço, créditos por mês, tamanho da carteira), as compras avulsas, cria e tira de venda planos e pacotes (desmarcando "Ativo"), muda a carteira de quem não assina, a amostra grátis e o aviso no topo do site. Tudo é validado antes de salvar e vale em até 30 segundos. **Pedidos já feitos mantêm o preço e os créditos da hora da compra.**
- **Monitoramento de erros:** falhas da API, das telas do site, do monitor e dos coletores vão para o painel. Os administradores recebem um e-mail de alerta, no máximo um a cada 15 minutos. Toda manhã o monitor também confere se alguma base oficial atrasou.

### Pagamentos

- Sem chave do Asaas e com `APTO_DEMO=1`, a compra abre uma **fatura simulada**, que não cobra nada.
- Para cobrar de verdade, preencha `ASAAS_API_KEY`, `ASAAS_AMBIENTE` (`sandbox` para testes, `producao` para valer) e `ASAAS_WEBHOOK_TOKEN`.
- No painel do Asaas, aponte o webhook de cobranças para `https://<seu-domínio>/v1/webhooks/asaas`.

### Colocar no ar (produção)

Tudo que roda no servidor sobe com um comando:

| Peça | O que faz |
| --- | --- |
| Banco de mapas | PostgreSQL + PostGIS. |
| API + site | No mesmo endereço; atualiza a estrutura do banco sozinha ao subir. |
| Coletores | Todo dia às 4h conferem as bases oficiais e só recarregam o que mudou. |
| Monitor | Todo dia às 6h reconfere as carteiras e manda os avisos por e-mail. |
| Caddy | HTTPS (o cadeado) automático e renovado sozinho. |
| Backup | Cópia diária do banco, guardando 14 dias. |

```bash
cp .env.producao.example .env.producao   # preencha domínio, senhas e Asaas
docker compose -f docker-compose.prod.yml --env-file .env.producao up -d --build
```

O passo a passo completo (servidor, domínio, webhook do Asaas, backups) está em [docs/implantacao.md](docs/implantacao.md).

---

## 10. Mapa das pastas

```
packages/regras   O coração: cada regra do MCR em código, com a norma citada e testes.
apps/api          A API (o "balcão"): contas, consultas, créditos e pagamentos.
apps/web          O site, pensado para o celular no campo.
coletores         Scripts que baixam as bases oficiais e guardam a origem de cada arquivo.
db/migrations     A estrutura do banco de dados (aplicada em ordem, uma vez cada).
db/teste          Consultas SQL usadas só para testar com dados reais.
deploy            Configuração do HTTPS (Caddy) e do backup diário.
Dockerfile        Imagem de produção da API + site.
docs              Fontes oficiais, cuidados legais, arquitetura, interface e relatórios de teste.
```

Tecnologias: TypeScript (Node + Fastify na API, React + Vite no site), Python nos coletores, PostgreSQL + PostGIS no banco.

---

## 11. Situação do projeto

**Pronto e testado**

- [x] Motor com as regras do MCR 2-9, incluindo as Resoluções 5.193/2024, 5.268/2025 e 5.303/2026.
- [x] Seis bases oficiais carregadas e testadas com fazendas reais de MT e PA, sem divergência.
- [x] Site para celular: consulta, semáforo, relatório em PDF, resumo por WhatsApp e página de fontes.
- [x] Dossiê v1, com checklist de documentos e código QR.
- [x] Contas, créditos e pagamento (Asaas real + simulado para desenvolvimento).
- [x] Confirmação de e-mail e recuperação de senha por e-mail (SMTP).
- [x] Landing page de vendas para quem chega sem conta (quem tem conta vai direto para a consulta).
- [x] Estorno e cancelamento de pedidos pelo painel (Asaas) e preços, limites e aviso do site editáveis sem mexer no código.
- [x] Assinatura mensal (Asaas) com créditos todo mês e carteira por plano; compra avulsa continua disponível.
- [x] Painel administrativo com papéis (suporte e administrador), ficha do usuário, "entrar como", bloqueio, auditoria e monitoramento de erros com alerta por e-mail.
- [x] Carteira de fazendas com reconferência diária e avisos no site e por e-mail (testada com fazendas reais e embargo simulado).
- [x] Pacote de produção: imagem Docker, HTTPS automático, backup diário, migrações e atualização automática das bases.
- [x] Revisão de segurança antes do lançamento: bibliotecas sem falhas conhecidas, freio de tentativas de senha, proteções do navegador e faxina diária de dados vencidos (veja [docs/seguranca.md](docs/seguranca.md)).
- [x] Direitos do titular (LGPD): em **Minha conta**, a pessoa baixa todos os seus dados em um arquivo e exclui a conta sozinha. O que é apagado e o que a lei manda guardar está em [docs/conformidade-legal.md](docs/conformidade-legal.md).
- [x] Visual profissional em todo o site: landing page e telas do app no mesmo padrão.
- [x] Equipes no plano Escritório: convite por e-mail, papéis (responsável, administrador, técnico) e créditos e carteira compartilhados (testado de ponta a ponta com o banco real).
- [x] Ensaio geral de produção neste computador: as imagens de produção, HTTPS, as 7 bases, conta, e-mail, compra, consulta, dossiê em PDF, carteira, alertas e **backup com restauração**. Achou e corrigiu 6 problemas, entre eles o das terras indígenas, que não carregariam no servidor Linux. Roteiro, resultado e a lista do lançamento em [docs/ensaio-producao.md](docs/ensaio-producao.md).
- [x] Página "Voltamos em instantes" no lugar da tela em branco do 502, servida pelo Caddy quando a API não responde (atualização, reinício, queda): 503 com `Retry-After`, recarrega sozinha e volta ao mesmo endereço (veja [docs/pagina-manutencao.md](docs/pagina-manutencao.md)).
- [x] Testes no navegador a cada envio para o GitHub (Playwright, computador e celular): conta, e-mail, compra, consulta, dossiê, lote, carteira, painel e LGPD. Acharam e corrigiram um limite de acessos que fazia o logo e os botões sumirem em escritórios com vários técnicos (veja [docs/testes-navegador.md](docs/testes-navegador.md)).
- [x] Backup fora do servidor (cópia cifrada todo dia, em qualquer armazenamento S3) e alertas de site fora do ar e de backup que não rodou (vigia a cada 5 min, pelo endereço público, avisando um serviço externo como o healthchecks.io). Bloco "Servidor" no painel. Testado no ensaio, inclusive a queda do site e a volta da cópia (veja [docs/backup-e-vigia.md](docs/backup-e-vigia.md)).
- [x] Explicação para o produtor por IA (OpenAI), com conferência automática do texto, explicação de modelo sem IA, chave cifrada pelo painel, limite diário e uso do mês (veja [docs/ia.md](docs/ia.md)).
- [x] Mais apoio por IA, cada função com liga/desliga e plano B: leitura do recibo do CAR na consulta, conferência de documentos e rascunhos (carta ao banco, retificação do CAR, requerimento ao órgão) no dossiê, frase explicada no e-mail da carteira e análise de norma nova no painel (veja [docs/ia.md](docs/ia.md)).
- [x] Central de ajuda com cara de chat, com 61 respostas prontas conferidas no código (inclusive as do apoio por IA), busca que entende a pergunta escrita e página `/ajuda`. Também: tour de boas-vindas na primeira entrada, gravado na conta, e menu com todas as telas no celular. Testado no navegador (veja [docs/central-de-ajuda.md](docs/central-de-ajuda.md)).

- [x] Segunda revisão de segurança (27/10/2026): **verificação em duas etapas** (aplicativo autenticador, com códigos de recuperação; obrigatória para administração e suporte em produção), painel só com login de até 12 horas, aviso por e-mail a cada acesso ao painel, alertas de erro que não viram golpe, respostas da API sem cópia no navegador, faxina dos avisos antigos do Asaas e cifra do backup reforçada. Na IA, o pedido vai com raciocínio baixo (a resposta não é mais cortada) e a conferência deixou de barrar texto correto. Veja [docs/seguranca.md](docs/seguranca.md) e [docs/ia.md](docs/ia.md).
- [x] Cupons de desconto pelo painel, sincronizados com o Asaas: porcentagem ou valor fixo, planos e produtos escolhidos, meses de desconto na assinatura (a mensalidade volta sozinha ao valor cheio), limite de usos no total e por conta, só na primeira compra, datas de início e fim, pausar, encerrar o desconto, link de divulgação e números de cada cupom. Testado na API (memória e PostgreSQL) e no navegador (veja [docs/cupons.md](docs/cupons.md)).

**Falta para lançar**

- [ ] Contratar o servidor e o domínio e subir seguindo [docs/implantacao.md](docs/implantacao.md).
- [ ] Contratar um provedor de e-mail (SMTP) e verificar o domínio nele (o código já está pronto).
- [ ] Revisão de um advogado: termos de uso, privacidade (LGPD), prazos de guarda depois da exclusão de conta e linguagem do dossiê.
- [ ] Conta no Asaas aprovada (chaves de sandbox e de produção). No sandbox, conferir também o fim do desconto de um cupom na assinatura (a mensalidade voltando ao valor cheio), como diz [docs/cupons.md](docs/cupons.md).
- [ ] Conta gratuita no healthchecks.io (2 checks: site e backup) e um armazenamento S3 para a cópia do backup, de preferência no Brasil. Guardar a `BACKUP_EXTERNO_SENHA` fora do servidor (veja [docs/backup-e-vigia.md](docs/backup-e-vigia.md)).
- [ ] (Opcional) Conta na OpenAI com limite de gasto, e a chave cadastrada no painel (aba Inteligência artificial). Incluir o fornecedor de IA na política de privacidade.
- [ ] Confirmar as licenças de uso das bases da Funai e do MMA.
- [ ] Fazer a lista "O que depende de você" de [docs/seguranca.md](docs/seguranca.md): senhas fortes, verificação em duas etapas, acesso ao servidor só por chave e backup fora do servidor.
- [ ] Registrar os domínios `aptorural.com.br` e `aptorural.com` (pareciam livres em 23/10/2026), reservar `@aptorural` nas redes e pesquisar a marca no INPI com um advogado (veja [docs/marca.md](docs/marca.md)).

**Próximos passos no código (revisão de 26/10/2026)**

O produto está completo para lançar. Estes são os pontos que ainda valem a pena, em ordem:

*Antes de abrir para clientes*

- [ ] **Canal de contato com uma pessoa.** Hoje o site não tem nenhum e-mail ou WhatsApp de suporte. Quando a central de ajuda não acha a resposta, a pessoa fica sem saída, e casos como "paguei e não caiu" ou "o embargo não é do meu imóvel" precisam de gente. O contato deve aparecer na central de ajuda (na resposta "não achei"), na página `/ajuda` e no rodapé. **Falta definir** qual e-mail e qual WhatsApp usar.
- [ ] **Entrar com a conta Google**, para facilitar o cadastro:
  - **Na tela:** um botão "Continuar com o Google" em Entrar e em Criar conta.
  - **Por dentro:** login padrão OpenID Connect do Google, pedindo só nome e e-mail.
  - **Cadastro:** o e-mail que o Google já confirmou libera a consulta grátis na hora, mas a pessoa ainda precisa aceitar os termos de uso.
  - **Conta que já existe:** se o e-mail já tem conta com senha, as duas viram uma só.
  - **Precisa:** criar o projeto no Google Cloud (ID do cliente, endereço de retorno) e citar o Google na política de privacidade.
  - **Antes de começar:** conferir as regras na documentação oficial do Google.
- [ ] **Confirmar que os testes passaram no GitHub** (aba Actions do repositório). O repositório é privado, e a primeira execução ainda não foi conferida.
- [ ] **Beta com 3 a 5 técnicos ou escritórios reais**, para achar as dúvidas e os atritos que nenhum teste pega. As dúvidas que surgirem viram respostas novas na central de ajuda.

*Logo depois do lançamento*

- [ ] Trocar de plano sem cancelar, e plano anual com desconto.
- [ ] Aceitar a planilha do Excel (.xlsx) direto na consulta em lote. Hoje é só CSV.
- [ ] Conferir o Anexo IV da IE 5/2022 do Incra no DOU contra a tabela de módulos fiscais carregada, quando o site do DOU abrir.

*Dependem de terceiros, não de código*

- [ ] Situação do CAR e contorno buscados sozinhos pelo código do CAR: só com autorização ou convênio do Serviço Florestal Brasileiro, porque o Sicar tem captcha.
- [ ] Territórios quilombolas: só quando houver uma base aberta e oficial.

**Antes de lançar: melhorias rápidas, que evitam problema**

- [x] **Testes automáticos no GitHub a cada envio de código** (GitHub Actions rodando testes, conferência de tipos, build e os testes no navegador). Assim, um erro em pagamento ou numa regra do MCR não passa sem ninguém perceber (veja [docs/testes-navegador.md](docs/testes-navegador.md)).
- [x] **Aceitar shapefile (.zip com .shp)** no contorno do imóvel. Feito: o site lê o .zip do Sicar (camada AREA_IMOVEL), converte arquivos em UTM pelo `.prj` e mostra uma prévia do contorno e da área antes da consulta. Testado com uma fazenda real de MT (veja [docs/frontend.md](docs/frontend.md)).

**Logo depois do lançamento: deixam o produto mais confiável**

- [ ] **Preencher a situação do CAR sozinho** (ativo, pendente, suspenso ou cancelado), em vez de o técnico digitar. É a regra que mais derruba crédito, e depender do que o usuário digita enfraquece o "nunca verde sem checar". **Condição:** a consulta pública do Sicar tem captcha e não declara licença, e o Apto Rural não contorna captcha. Só com autorização ou convênio do Serviço Florestal Brasileiro (veja [docs/conformidade-legal.md](docs/conformidade-legal.md)).
- [x] **Calcular os módulos fiscais sozinho**, com a área do contorno e o valor do módulo fiscal de cada município (Incra). É um campo a menos e um erro a menos na data do Prodes. Feito: fonte oficial confirmada (PDF de índices básicos do Incra, conferido contra a planilha da IE 5/2022 e contra 3.998 imóveis da lista do MMA, veja [docs/fontes-oficiais.md](docs/fontes-oficiais.md)). Coletor `incra_modulo_fiscal`, estimativa na tela e no resultado, aviso perto de 4 e 15 módulos. Falta conferir o Anexo IV no DOU quando o site abrir.
- [ ] **Buscar o contorno da fazenda só pelo código do CAR**, sem o técnico mandar arquivo: "digitei o código, saiu o semáforo". **Mesma condição** do item da situação do CAR: só com autorização ou convênio do Serviço Florestal.

**Para vender mais**

- [x] **Consulta em lote** (CSV ou planilha com vários CARs), para escritórios e cooperativas que atendem dezenas de fazendas. Combina com o plano Escritório. Feito: planilha do Excel em português, contornos casados pelo código do CAR, conferência antes de gastar, progresso por imóvel, resultado em planilha e "acompanhar todos" na carteira. Testado com 11 fazendas reais de MT e PA. Arquivo .xlsx ainda não: por enquanto, salvar como CSV.
- [x] **Mapa no resultado e no dossiê**, mostrando onde a fazenda encosta no embargo, na terra indígena, na Unidade de Conservação etc., para o técnico explicar ao produtor e ao gerente do banco. Feito: mapa ilustrado com números no ponto de contato, hectares dentro do imóvel, o que está por perto com a distância, escala e norte; guardado como fotografia do dia da consulta. Testado com fazendas reais de MT e PA (veja [docs/frontend.md](docs/frontend.md)).

**Depois do lançamento**

- [ ] Imagens de satélite antes e depois de 2019 no dossiê.
- [ ] Consulta pelo WhatsApp, inclusive a consulta grátis para o produtor.

---

## 12. Regras de ouro do projeto

1. **Só fonte oficial.** Nenhuma regra entra no código sem a norma oficial citada (Banco Central, ministérios, Ibama, Inpe…). O que não foi confirmado fica marcado "A CONFIRMAR".
2. **Nunca verde sem checar.** Se uma base não foi consultada, o item aparece como "Não verificado".
3. **Linguagem cuidadosa.** O sistema não chama ninguém de "irregular" nem "ilegal": mostra o que consta nas bases.
4. **Dados pessoais protegidos (LGPD).** CPF/CNPJ só com autorização e guardado apenas como código irreversível. O CPF de cobrança vai direto ao Asaas.
5. **Regras mudam.** Quando sair uma nova resolução, atualizam-se a regra, os testes e a documentação juntos.

---

## 13. Documentos de apoio

| Documento | Para que serve |
| --- | --- |
| [docs/fontes-oficiais.md](docs/fontes-oficiais.md) | Cada norma e cada base, com link oficial e situação. |
| [docs/conformidade-legal.md](docs/conformidade-legal.md) | Cuidados legais e critérios do produto que precisam de revisão jurídica. |
| [docs/arquitetura.md](docs/arquitetura.md) | Como as peças se encaixam e por quê. |
| [docs/frontend.md](docs/frontend.md) | Decisões de interface para o técnico do campo. |
| [docs/telas.md](docs/telas.md) | Como refazer as fotos das telas do README. |
| [docs/central-de-ajuda.md](docs/central-de-ajuda.md) | Central de ajuda (respostas prontas), tour de boas-vindas e menu: como funcionam e como acrescentar uma resposta. |
| [docs/teste-fazendas-reais.md](docs/teste-fazendas-reais.md) | Relatório do teste com fazendas reais. |
| [docs/implantacao.md](docs/implantacao.md) | Como colocar o sistema no ar, passo a passo. |
| [docs/seguranca.md](docs/seguranca.md) | Revisão de segurança: o que foi conferido, o que foi corrigido e o que fazer se houver um incidente. |
| [docs/cupons.md](docs/cupons.md) | Cupons de desconto: o que o administrador controla, o que o cliente vê, como o desconto chega ao Asaas e todas as regras de uso. |
| [docs/marca.md](docs/marca.md) | A marca: logotipo e arquivos, cores, fonte, tom de voz, slogan e as checagens do nome (domínio, INPI). |
| [Plano de negócio](https://claude.ai/artifact/1vcJWqtW6fs2MTWsVmahhW) | Mercado, preços, riscos e plano de lançamento. |
| [docs/proposta-futura-eudr.md](docs/proposta-futura-eudr.md) | Proposta de uma futura startup, depois que o Apto Rural der lucro: comprovar a origem sem desmatamento para a exportação (EUDR), com fases e metas. |
