# Arquitetura

```
 Bases oficiais (MMA, Ibama, MMA/CNUC, Funai, Incra, SFB, MTE)
        │  coletores Python, agendados (proveniência: URL, data, SHA-256)
        ▼
 PostgreSQL + PostGIS ──► API (Fastify) ──► motor de regras (@apto/regras)
                              ▲
              site (React) ───┤
       robô de WhatsApp (futuro) ┘   cooperativas via chave de API (futuro)
```

## Princípios

1. **Evidência separada de julgamento.** A API só coleta o que as bases dizem (`Evidencias`). O pacote `@apto/regras` julga, sem banco e sem rede, então é testável e auditável linha a linha.
2. **Ausência de dado nunca é verde.** Base não carregada, contorno não enviado ou CPF não autorizado: o item sai "Não verificado".
3. **Datas pelo fuso de Brasília.** Os prazos do MCR (4/1/2027, 1/7/2027, 3/1/2028, 30/6/2027) são comparados com a data de hoje em `America/Sao_Paulo`.
4. **Proveniência.** Toda carga registra URL, data e hash em `fonte_carga`; cada resultado mostra a data da base usada.
5. **Consulta guardada.** Evidências e resultado ficam em `consulta`, para o código QR do relatório apontar para a versão original.

## Carteira e monitor

- O técnico coloca na carteira um imóvel de uma consulta sua (até 50 por conta). O contorno e os dados da consulta ficam guardados em `imovel_monitorado`.
- O monitor (`apps/api/src/monitorar.ts`) roda às 6h, depois dos coletores. Para cada imóvel: coleta as evidências com as bases do dia (situação do CAR e módulos fiscais da lista do MMA têm prioridade, por serem mais recentes), avalia e compara com o resultado anterior (`compararResultados`, em `@apto/regras`).
- Se mudou: grava uma consulta nova (sem gastar crédito), cria um `aviso` e, no fim, manda um e-mail por usuário com os avisos ainda não enviados. Só recebe e-mail quem confirmou o endereço.
- Item que vira "Não verificado" não gera aviso: costuma ser base que falhou ao atualizar.
- A virada de data do Prodes (ex.: 01/07/2027 para 4 a 15 MF) gera aviso naturalmente, porque a avaliação usa a data do dia.

## Equipes: a "conta em uso"

- Uma equipe é o **responsável** (quem assina) mais os **membros** (`equipe`, `equipe_membro`). Uma pessoa está em no máximo uma equipe.
- Créditos, carteira, avisos e assinatura **não mudaram de lugar**: continuam na conta do responsável. O que mudou é **qual conta cada rota usa**: `contaEmUso()` (`apps/api/src/equipe/conta.ts`) devolve a conta do responsável para quem é membro e a própria conta para os outros. Toda rota de saldo, consulta, dossiê, carteira e avisos passa por ela.
- O débito guarda quem usou o crédito (`credito_lancamento.autor_id`); a consulta guarda quem a fez (`consulta.usuario_id`). Qualquer pessoa da equipe vê como "minha" e pode liberar o dossiê de uma consulta de outra pessoa da mesma equipe.
- Permissões em um lugar só: `podePagar` (só o responsável compra, assina e cancela) e `podeGerir` (responsável e administradores convidam, removem, mudam papéis e tiram imóveis da carteira).
- O limite de pessoas fica **fixado na assinatura** (`assinatura.limite_membros`), como o da carteira, e só vale enquanto ela está ativa. Convites em aberto contam para o limite.
- Convite: token aleatório de uso único, só o SHA-256 no banco (`convite_equipe`), válido por 7 dias. O token vai no corpo das requisições (`POST /v1/convites/ver` e `/aceitar`), e não na URL da API, para não aparecer nos registros de acesso.
- O monitor manda o resumo da carteira ao responsável e também aos administradores da equipe.

## Por que o contorno do imóvel vem do técnico

O download da consulta pública do Sicar é protegido por captcha e não declara licença (ver `conformidade-legal.md`). O técnico já tem o arquivo do CAR do cliente; no MVP ele o envia em KML ou GeoJSON. A lista do MMA, por sua vez, é consultada pelo código do CAR e já traz situação e módulos fiscais.
