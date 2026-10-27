# Explicação para o produtor (inteligência artificial)

No resultado de uma consulta, o botão **"Explicar para o produtor"** escreve em palavras simples o que deu, o que pesa e o que dá para fazer. O texto sai pronto para copiar ou mandar no WhatsApp.

## A regra de ouro: a IA não decide nada

Quem decide o resultado continua sendo o **motor de regras** (MCR 2-9), com as bases oficiais. A IA recebe **só o que as regras já decidiram** e reescreve em linguagem simples. O resultado oficial aparece sempre acima da explicação. A explicação sempre leva o aviso: "Explicação gerada por inteligência artificial a partir do resultado oficial e conferida automaticamente. O que vale é o resultado acima."

## Como funciona, passo a passo

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

## Como ligar (painel administrativo, sem reinstalar nada)

Só quem tem papel de **administrador** vê a aba **Inteligência artificial** no painel (`/admin?aba=ia`).

1. Crie uma chave em [platform.openai.com](https://platform.openai.com) → API keys. Coloque um limite de gasto na conta da OpenAI, por segurança.
2. Na aba, cole a chave e clique em **Salvar chave**.
3. Clique em **Testar a chave**. O site faz uma chamada pequena com um resultado fictício e mostra se deu certo.
4. Marque **"Usar a IA no botão"**, confira o modelo e o limite por dia e clique em **Salvar**.

Vale em até 30 segundos, sem reiniciar nada. Para desligar, desmarque a opção. Para trocar a chave, cole a nova. Para tirar, use **Apagar chave**. Tudo fica na **Auditoria** (quem e quando, nunca a chave).

## Como a chave fica protegida

- **Guardada cifrada** no banco (AES-256-GCM), com a `CHAVE_SEGREDOS`, que fica só no `.env.producao` do servidor. Quem copiar o banco ou um backup não consegue usar a chave.
- **Nunca é mostrada de novo:** depois de salva, ninguém vê a chave inteira, nem o administrador. A tela mostra só o final (`sk-…a1B2`), e a auditoria guarda só esse final.
- **Só sai do servidor para a OpenAI**, no cabeçalho da chamada. Não aparece em log nem em mensagem de erro.
- **Fica separada** das outras configurações do painel (preços, limites), que são mostradas abertas.
- **Se a `CHAVE_SEGREDOS` for trocada,** a chave salva deixa de abrir. É só cadastrar de novo no painel.

## Quanto custa

- **O modelo padrão é o `gpt-6-luna`,** o mais econômico da linha atual da OpenAI (US$ 0,10 por milhão de tokens enviados e US$ 0,50 por milhão recebidos, pela [tabela oficial](https://developers.openai.com/api/docs/pricing) de 26/10/2026). Uma explicação usa por volta de mil tokens (um pouco mais com o raciocínio baixo), ou seja, **frações de centavo**.
- **Só gasta quando alguém clica** no botão, e uma vez por consulta.
- **O limite por dia** (padrão: 300 chamadas) segura o gasto. Passou dele, vale a explicação de modelo até o dia seguinte.
- **O painel mostra o uso do mês** e um **custo estimado**. O valor cobrado de verdade é o do painel da OpenAI.

## Privacidade (LGPD)

O que vai para a OpenAI são fatos sobre o imóvel tirados das bases públicas, sem dado pessoal do produtor ou do técnico (ver o passo 3). Mesmo assim, como é um serviço de fora do Brasil, a política de privacidade deve dizer que a explicação é gerada por um fornecedor de IA. Ver `conformidade-legal.md`.

## Para quem mexe no código

| Peça | Onde |
| --- | --- |
| Fatos, instruções, conferência, explicação de modelo, serviço | `apps/api/src/ia/explicacao.ts` |
| Cliente da OpenAI (Responses API, saída em JSON Schema) | `apps/api/src/ia/provedor.ts` |
| Cifra e cofre de segredos | `apps/api/src/ia/segredos.ts` |
| Contagem de uso e preços para a estimativa | `apps/api/src/ia/uso.ts` |
| Rotas | `POST /v1/consultas/:id/explicacao` (`rotas/consultas.ts`); `GET /v1/admin/ia`, `PUT` e `DELETE /v1/admin/ia/chave`, `POST /v1/admin/ia/testar` (`rotas/admin.ts`); liga, modelo e limite em `PUT /v1/admin/configuracoes/ia` |
| Banco | migração `013_explicacao_ia.sql`: tabelas `segredo` e `ia_uso`, coluna `consulta.explicacao` |
| Telas | `ExplicacaoProdutor` em `paginas/Resultado.tsx`; aba em `paginas/IAPainel.tsx` |
| Testes | `apps/api/test/ia.test.ts`: chave escondida, cifra, conferência, limite, cache, nada de CAR ou CPF no envio |
| Ensaio | OpenAI falsa em `deploy/ensaio/asaas-falso.mjs` (`IA_URL`) |
