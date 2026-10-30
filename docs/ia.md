# Apoio por inteligência artificial

A IA ajuda em seis lugares. Cada um liga e desliga sozinho no painel e tem um plano B sem IA:

| Função | Onde aparece | Sem IA |
| --- | --- | --- |
| [Explicação para o produtor](#explicação-para-o-produtor) | Resultado da consulta | Explicação montada pelas regras |
| [Leitura do recibo do CAR](#leitura-do-recibo-do-car) | Nova consulta | Leitura por padrões (código, situação…) |
| [Conferência de documentos](#conferência-de-documentos-do-dossiê) | Dossiê, em cada item | Indisponível: o técnico confere pela lista |
| [Rascunhos](#rascunhos) | Dossiê, em cada item | Modelo fixo para completar |
| [Frase da carteira](#frase-explicada-no-e-mail-da-carteira) | E-mail de mudanças da carteira | Frase de modelo |
| [Análise de norma nova](#análise-de-norma-nova) | Painel, aba Inteligência artificial | Indisponível |

Todas seguem as mesmas regras: **a IA nunca muda o resultado**, recebe só fatos, não recebe dado pessoal (CPF, CNPJ, código do CAR e e-mail saem do texto antes do envio) e **toda resposta passa por uma conferência automática** antes de aparecer. Resposta barrada vira o plano B. O código comum está em `apps/api/src/ia/comum.ts` (conferências) e `apps/api/src/ia/executor.ts` (liga/desliga, chave, limite do dia, registro de uso).

## Explicação para o produtor

No resultado de uma consulta, o botão **"Explicar para o produtor"** escreve em palavras simples o que deu, o que pesa e o que dá para fazer. O texto sai pronto para copiar ou mandar no WhatsApp.

### A regra de ouro: a IA não decide nada

Quem decide o resultado continua sendo o **motor de regras** (MCR 2-9), com as bases oficiais. A IA recebe **só o que as regras já decidiram** e reescreve em linguagem simples. O resultado oficial aparece sempre acima da explicação. A explicação sempre leva o aviso: "Explicação gerada por inteligência artificial a partir do resultado oficial e conferida automaticamente. O que vale é o resultado acima."

### Como funciona, passo a passo

1. **Clique no botão.** O técnico (quem fez a consulta, ou alguém da equipe dele) clica em "Explicar para o produtor".
2. **O site separa os fatos** do resultado: a situação geral e, para cada item, o resultado, o que foi encontrado, os detalhes e as saídas que a norma admite.
3. **Tira os dados pessoais.** O site tira CPF, CNPJ, código do CAR e e-mail. Nome, contato e o desenho do imóvel nunca vão.
4. **Manda para a OpenAI** com instruções fixas:
   - não inventar nada;
   - repetir a situação recebida;
   - não prometer aprovação;
   - escrever de 4 a 8 frases simples.

   O pedido vai marcado para a OpenAI **não guardar** a conversa (`store: false`). Nos modelos que "pensam" antes de responder (linhas `gpt-5` e `gpt-6`, como o `gpt-6-luna`), o pedido vai com **raciocínio baixo** (`reasoning.effort: low`) e espaço para até 3.000 tokens de resposta. No padrão (raciocínio médio), o raciocínio gastava o espaço da resposta, que podia vir cortada, e o site caía sempre na explicação de modelo (achado na revisão de 27/10/2026).
5. **Confere o texto que voltou.** Ele é **jogado fora** se:
   - a situação vier trocada (por exemplo, "sem impedimento" quando o resultado é impedimento);
   - tiver "aprovado", "garantido", "com certeza", "não se preocupe"; com problema no imóvel, "tudo certo"; com impedimento ou checagem incompleta, "nenhum impedimento" (na situação "atenção" essa frase é verdadeira: nada impede, mas há pontos a resolver);
   - tiver um número que não está no resultado (área, data, prazo inventados). Vale o número inteiro ("4,43", "18/09/2024") e também as partes dele, porque a IA escreve datas por extenso ("18 de setembro de 2024");
   - tiver lista, negrito ou dado pessoal;
   - for curto ou longo demais.
6. **Guarda o texto aprovado** junto com a consulta. Quem abrir a consulta depois, inclusive o gerente do banco pelo QR, vê o mesmo texto, sem nova chamada e sem custo.
7. **Sem IA, usa a explicação de modelo.** Quando não dá para usar a IA, o site mostra uma explicação **montada direto das regras**, por modelo fixo: ela é sempre correta. Isso acontece:
   - com a IA desligada;
   - sem chave;
   - depois do limite do dia;
   - com a OpenAI fora do ar;
   - com o texto barrado na conferência.

   Essa explicação não é guardada: quando a IA voltar, dá para gerar a versão melhor.

## Leitura do recibo do CAR

Na nova consulta, o botão **"Preencher com o recibo do CAR (PDF)"** lê o recibo de inscrição ou o demonstrativo baixado do Sicar e preenche o **código do CAR, a situação e os módulos fiscais**. O técnico confere antes de consultar.

1. **O texto sai do PDF no navegador** (`apps/web/src/lerDocumento.ts`, com pdf.js). O arquivo não é enviado. Só PDF digital: foto ou escaneado pede o preenchimento à mão.
2. **Leitura por padrões primeiro**, sem IA: o código do CAR (formato fixo), "Situação: Ativo", área, módulos fiscais, data de inscrição.
3. **A IA completa o que faltou**, com o texto sem CPF, CNPJ, CAR e e-mail. O código do CAR vem **sempre** da leitura por padrões (cópia literal), nunca da IA.
4. **Conferência:** todo número que a IA devolver precisa estar escrito no recibo; UF, data e situação precisam estar no formato certo. Senão, fica só o que os padrões acharam.

**Quem pode usar e quanto:**
- Só contas com o **e-mail confirmado**, como na consulta grátis. Isso evita contas falsas em série gastando a IA.
- Até **30 leituras por conta, por dia** (`LEITURAS_RECIBO_POR_DIA` em `rotas/ia.ts`). A leitura é grátis e o limite diário da IA é um só para o site inteiro: sem esse freio, uma conta sozinha gastaria a IA do dia de todo mundo.
- A contagem fica na memória da API: zera à meia-noite de Brasília ou quando a API reinicia.

## Conferência de documentos do dossiê

Em cada item do dossiê (impedimento ou atenção), **"Conferir um documento"** recebe a ASV, o PRAD, o TAC, o termo de embargo, a licença… A IA compara com o que a consulta encontrou e devolve: tipo do documento, órgão, número, datas, área, qual documento da lista da saída ele parece atender, e de 1 a 6 pontos **confere / diverge / conferir**. Quem conclui é o técnico.

- **PDF digital:** só o texto vai, sem CPF, CNPJ, CAR e e-mail. Se o documento cita um CAR, o site confere **sem IA** se é o deste imóvel ou de outro.
- **Escaneado ou foto:** até 4 páginas viram imagens reduzidas no navegador e vão **do jeito que estão** (podem ter nomes e números). A tela avisa e só envia depois de o técnico confirmar. Nesse caso, a tela pede para conferir números e datas no papel.
- **Conferência:** o "requisito" precisa ser um da lista da norma; nada de dado pessoal, promessa de aprovação ou (no texto) número que não está no documento nem na consulta.
- **O arquivo não fica guardado**, só o que foi lido. Fica no dossiê (tabela `consulta_apoio`), visível só para quem fez a consulta e a equipe. Até 40 itens por consulta.
- **Sem IA, fica indisponível** e a tela diz por quê; a lista de documentos do dossiê continua valendo.

## Rascunhos

Em cada item do dossiê, botões geram rascunhos com os fatos da consulta:

- **Carta ao banco**: sempre (impedimento ou atenção);
- **Pedido de retificação do CAR**: quando o item é de contestação e vem de cruzamento com mapa;
- **Requerimento ao órgão**: embargo, Prodes e CAR.

O texto aparece numa caixa editável, com **[colchetes]** no que o técnico completa (nome, registro, número do processo), e o botão **Copiar texto**. Conferência: de 600 a 6.000 caracteres, sem promessa, sem dado pessoal e sem número que não esteja nos fatos. **Sem IA (ou barrado), sai um modelo fixo**, sempre correto, para completar.

## Frase explicada no e-mail da carteira

No e-mail de mudanças da carteira, cada imóvel ganha **uma frase** que diz o que mudou e o que fazer (ex.: "Apareceu um embargo do Ibama: vale consultar de novo antes da próxima proposta"). Vai só o que mudou (o item, antes e depois), sem CAR nem nome. Barrada ou sem IA, vale a frase de modelo.

## Análise de norma nova

No painel (só administrador), **Normas novas**: cole o nome e o texto de uma resolução ou portaria. A IA resume, diz a vigência e lista o que mudou, **quais regras do site** (pelos códigos das regras) conferir e o quê. Se não tiver relação com o MCR 2-9, diz isso. **Nenhuma regra muda sozinha**: é o ponto de partida da revisão. Fica guardada (tabela `analise_norma`) e na auditoria (`analisou_norma`).

## Como ligar (painel administrativo, sem reinstalar nada)

Só quem tem papel de **administrador** vê a aba **Inteligência artificial** no painel (`/admin?aba=ia`).

1. Crie uma chave em [platform.openai.com](https://platform.openai.com) → API keys. Coloque um limite de gasto na conta da OpenAI, por segurança.
2. Na aba, cole a chave e clique em **Salvar chave**.
3. Clique em **Testar a chave**. O site faz uma chamada pequena com um resultado fictício e mostra se deu certo.
4. Marque **"Ligar a IA"**, escolha as **funções**, confira o modelo e o limite por dia (vale para todas as funções juntas) e clique em **Salvar**.

Vale em até 30 segundos, sem reiniciar nada. Para desligar, desmarque a opção. Para trocar a chave, cole a nova. Para tirar, use **Apagar chave**. Tudo fica na **Auditoria** (quem e quando, nunca a chave).

## Como a chave fica protegida

- **Guardada cifrada** no banco (AES-256-GCM), com a `CHAVE_SEGREDOS`, que fica só no `.env.producao` do servidor. Quem copiar o banco ou um backup não consegue usar a chave.
- **Nunca é mostrada de novo:** depois de salva, ninguém vê a chave inteira, nem o administrador. A tela mostra só o final (`sk-…a1B2`), e a auditoria guarda só esse final.
- **Só sai do servidor para a OpenAI**, no cabeçalho da chamada. Não aparece em log nem em mensagem de erro.
- **Fica separada** das outras configurações do painel (preços, limites), que são mostradas abertas.
- **Se a `CHAVE_SEGREDOS` for trocada,** a chave salva deixa de abrir. É só cadastrar de novo no painel.

## Quanto custa

- **O modelo padrão é o `gpt-6-luna`,** o mais econômico da linha atual da OpenAI (US$ 0,10 por milhão de tokens enviados e US$ 0,50 por milhão recebidos, pela [tabela oficial](https://developers.openai.com/api/docs/pricing) de 26/10/2026). Uma explicação usa por volta de mil tokens (um pouco mais com o raciocínio baixo), ou seja, **frações de centavo**.
- **Só gasta quando alguém usa:** clica no botão (uma vez por consulta), lê um recibo, confere um documento, pede um rascunho, ou quando sai um e-mail da carteira com mudança. Documento em imagem gasta mais (cerca de mil a dois mil tokens por página).
- **O painel mostra o uso do mês por função.**
- **O limite por dia** (padrão: 300 chamadas) segura o gasto. Passou dele, vale a explicação de modelo até o dia seguinte.
- **O painel mostra o uso do mês** e um **custo estimado**. O valor cobrado de verdade é o do painel da OpenAI.

## Privacidade (LGPD)

Na explicação, nos rascunhos e na frase da carteira, vão fatos sobre o imóvel tirados das bases públicas, sem dado pessoal (ver o passo 3). No recibo e nos documentos em PDF digital, vai o texto do arquivo sem CPF, CNPJ, CAR e e-mail. **Escaneado ou foto vai como imagem**, só com a confirmação do técnico. Os arquivos não ficam guardados. A política de privacidade (`/privacidade`) diz que o apoio usa um fornecedor de IA fora do Brasil. Ver `conformidade-legal.md`.

## Para quem mexe no código

| Peça | Onde |
| --- | --- |
| Conferências comuns (dados pessoais, números, promessas) | `apps/api/src/ia/comum.ts` |
| Liga/desliga por função, chave, limite, registro de uso | `apps/api/src/ia/executor.ts` |
| Explicação: fatos, instruções, conferência, modelo, serviço | `apps/api/src/ia/explicacao.ts` |
| Recibo do CAR | `apps/api/src/ia/recibo.ts` |
| Documentos do dossiê | `apps/api/src/ia/documentos.ts` |
| Rascunhos | `apps/api/src/ia/rascunhos.ts` |
| Frase da carteira | `apps/api/src/ia/carteira.ts` (usada em `monitorar.ts`) |
| Análise de norma | `apps/api/src/ia/normas.ts` |
| Guarda dos documentos, rascunhos e análises | `apps/api/src/ia/apoio.ts` |
| Cliente da OpenAI (Responses API, saída em JSON Schema) | `apps/api/src/ia/provedor.ts` |
| Cifra e cofre de segredos | `apps/api/src/ia/segredos.ts` |
| Contagem de uso e preços para a estimativa | `apps/api/src/ia/uso.ts` |
| Rotas do apoio | `POST /v1/ia/recibo-car`; `GET /v1/consultas/:id/apoio`; `POST /v1/consultas/:id/documentos`; `POST /v1/consultas/:id/rascunhos`; `DELETE /v1/consultas/:id/apoio/:item`; `GET` e `POST /v1/admin/ia/normas` (`rotas/ia.ts`) |
| Rotas | `POST /v1/consultas/:id/explicacao` (`rotas/consultas.ts`); `GET /v1/admin/ia`, `PUT` e `DELETE /v1/admin/ia/chave`, `POST /v1/admin/ia/testar` (`rotas/admin.ts`); liga, modelo e limite em `PUT /v1/admin/configuracoes/ia` |
| Banco | migração `013_explicacao_ia.sql`: tabelas `segredo` e `ia_uso`, coluna `consulta.explicacao`; migração `018_ia_apoio.sql`: coluna `ia_uso.tarefa`, tabelas `consulta_apoio` e `analise_norma` |
| Telas | `ExplicacaoProdutor` em `paginas/Resultado.tsx`; recibo em `paginas/Consulta.tsx`; `componentes/ApoioDossie.tsx` no dossiê; aba e normas em `paginas/IAPainel.tsx`; leitura de PDF em `lerDocumento.ts` |
| Testes | `apps/api/test/ia.test.ts`: chave escondida, cifra, conferência, limite, cache, nada de CAR ou CPF no envio; `apps/api/test/ia-apoio.test.ts`: recibo, documentos, rascunhos, carteira, normas, funções desligadas, dono da consulta |
| Ensaio | OpenAI falsa em `deploy/ensaio/asaas-falso.mjs` (`IA_URL`) |
