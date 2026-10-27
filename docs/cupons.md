# Cupons de desconto

Cupom é um código, como `BEMVINDO30`, que dá desconto na compra avulsa ou na assinatura mensal. O administrador cria e controla tudo no painel, na aba **Cupons**. O desconto vai direto para a cobrança no **Asaas**: quem paga já vê o valor com desconto na fatura. Na assinatura, as mensalidades voltam sozinhas ao valor cheio quando acabam os meses de desconto.

Serve para conquistar os primeiros clientes: "os 20 primeiros técnicos pagam metade nos 3 primeiros meses", "cortesia de uma consulta para quem veio da feira", "10% para sempre para os parceiros".

---

## 1. O que dá para controlar em cada cupom

| Campo | O que faz | Exemplo |
| --- | --- | --- |
| **Código** | O que o cliente digita. Letras, números, hífen ou sublinhado, de 3 a 30. Maiúsculas e minúsculas valem igual. O botão "Gerar" cria um código fácil de ditar por telefone, sem 0/O nem 1/I. | `LANCAMENTO50` |
| **Anotação interna** | Para você lembrar de onde veio o cupom. O cliente não vê. | "Feira de Sorriso, outubro" |
| **Desconto** | Em **porcentagem** (1% a 100%) ou em **reais** (valor fixo a menos). | 50% ou R$ 30,00 |
| **Vale em** | **Todos** os planos e produtos, ou só os que você marcar. | Só o plano Projetista |
| **Na assinatura, vale por** | Quantas **mensalidades** têm desconto (ex.: as 3 primeiras) ou **todas**, enquanto a assinatura durar. Na compra avulsa, o desconto vale na compra. | 3 mensalidades |
| **Usos no total** | Quantas vezes o cupom pode ser usado, somando todos os clientes. Ou **sem limite**. | 20 (os 20 primeiros) |
| **Usos por conta** | Quantas vezes a mesma pessoa pode usar. | 1 |
| **Só para quem nunca comprou nem assinou** | Bloqueia quem já pagou alguma coisa antes (compra, mensalidade ou outro cupom de 100%). | Ligado para "primeira compra" |
| **A partir de / Até** | De que dia a que dia o cupom vale, no horário de Brasília, **contando os dois dias**. Vazio = sem limite daquele lado. | Até 31/12/2026 |
| **Ativo** | Desmarcado = **pausado**: para de valer na hora, sem apagar o histórico. | — |

Antes de salvar, o formulário mostra **"Como fica o preço"**: cada plano e produto com o preço normal e o preço com o cupom. Ele também avisa quando o cupom deixaria um valor abaixo do mínimo do Asaas (veja a seção 4).

---

## 2. A lista de cupons no painel

Cada cupom aparece com a **situação**, calculada na hora:

| Situação | Quando |
| --- | --- |
| **Valendo** | Ativo, dentro das datas e com usos disponíveis. |
| **Agendado** | Ainda não chegou o dia "a partir de". |
| **Pausado** | Você desmarcou "Ativo". |
| **Vencido** | Já passou o dia "até". |
| **Esgotado** | Chegou ao limite de usos no total. |

E os números:

- **Usos:** quantos já foram pagos, de quantos possíveis. Abaixo aparecem os que estão **aguardando pagamento**: a fatura foi gerada com o cupom e ainda não foi paga.
- **Desconto dado:** quanto o cupom já deixou de cobrar. Na assinatura, soma o desconto de cada mensalidade paga com desconto.
- **Receita:** quanto entrou nas compras e mensalidades pagas com o desconto.

Ações em cada linha:

- **Usos:** quem usou, em quê, quanto pagou, a situação e, na assinatura, quantas mensalidades já tiveram desconto.
- **Copiar link:** copia o **link de divulgação** (`https://seu-site/planos?cupom=CODIGO`). Quem abre o link já chega na página de planos com o cupom aplicado, e o cupom continua aplicado se a pessoa precisar criar a conta no meio do caminho.
- **Editar**, **Pausar / Ativar** e **Apagar**. Só dá para apagar cupom que nunca foi usado; o que já foi usado fica no histórico e pode ser pausado.

Na tela de **Usos**, assinatura com desconto em andamento tem o botão **Encerrar desconto**. Ele volta as próximas mensalidades ao valor cheio no Asaas na hora: serve para tirar o desconto de um parceiro que saiu, ou para resolver um caso em que o Asaas falhou (seção 5).

O suporte vê a aba Cupons, mas só o administrador cria, edita, pausa, apaga e encerra descontos. Toda ação fica na **Auditoria**.

---

## 3. O que o cliente vê

Na página **Planos**:

1. Campo **"Tem um cupom de desconto?"**. A pessoa digita o código e toca em **Aplicar**. Quem chega pelo link de divulgação já vê o cupom aplicado.
2. Cada plano e produto em que o cupom vale mostra o **preço antigo riscado** e o preço com desconto. Na assinatura aparece também por quanto tempo, por exemplo: "50% de desconto nas 3 primeiras mensalidades; depois, R$ 199,00/mês".
3. Onde o cupom não vale, aparece o motivo ("Este cupom não vale para o plano Escritório.").
4. Se o cupom não vale de jeito nenhum, a tela diz por quê: não encontrado, pausado, vencido em tal dia, começa a valer em tal dia, esgotado, já usado por esta conta, só para a primeira compra. Os números internos (quantos usos faltam, por exemplo) nunca aparecem.
5. Compra avulsa que fica **de graça** (cupom de 100%) mostra **"Grátis"** e o botão **"Resgatar grátis"**: os créditos entram na hora, sem fatura e sem pedir CPF/CNPJ.
6. Quem assina com cupom vê, no quadro da assinatura, o código e quantas mensalidades com desconto ainda faltam.

A central de ajuda tem a resposta "Como uso um cupom de desconto?".

---

## 4. Como o desconto chega ao Asaas

O Asaas não tem um cadastro de "cupom". O Apto Rural calcula o preço com desconto e manda **esse valor** para a cobrança. Por isso funciona com Pix, cartão e boleto, sem nada a configurar no Asaas.

**Compra avulsa**

- O pedido é criado com o valor com desconto (`POST /v3/payments` com `value` já descontado). A descrição da fatura diz qual cupom foi usado.
- Cupom de 100%: não há cobrança no Asaas. O pedido fica registrado como pago, com valor R$ 0,00 e provedor "cupom".

**Assinatura mensal**

- A assinatura é criada no Asaas com a mensalidade com desconto (`POST /v3/subscriptions` com `value` descontado).
- A cada mensalidade paga, o Apto Rural conta mais um mês de desconto. Quando chega ao número de meses do cupom, ele manda o valor cheio para o Asaas: `PUT /v3/subscriptions/{id}` com `value` (o preço do plano) e `updatePendingPayments: true`. Assim a mensalidade que o Asaas já tiver gerado e ainda não foi paga também passa ao valor cheio. As já pagas, vencidas ou canceladas não mudam.
- Cupom com desconto em **todas** as mensalidades nunca volta ao valor cheio sozinho; só pelo botão "Encerrar desconto".
- O valor cheio é o do plano **no dia em que a pessoa assinou**. Se você mudar o preço do plano depois, quem já assina continua com as condições do dia, como sempre.

**Valor mínimo**

O Asaas não aceita cobrança abaixo de **R$ 5,00**. Por isso:

- Compra avulsa: o cupom pode deixar de graça (R$ 0) ou em R$ 5,00 ou mais. Entre R$ 0,01 e R$ 4,99, ele é recusado.
- Mensalidade: precisa ficar em **R$ 5,00 ou mais**, todo mês, porque toda mensalidade gera uma cobrança. Não dá para fazer "primeiro mês grátis"; dá para fazer "primeiro mês por R$ 5,00" (por exemplo, R$ 194 de desconto no Projetista, por 1 mensalidade).

A simulação do formulário marca em vermelho os itens em que o cupom ficaria abaixo do mínimo.

> Conferir no sandbox do Asaas antes de abrir para clientes: a rota de atualização da assinatura (`PUT /v3/subscriptions/{id}`) e o valor mínimo de R$ 5,00 foram tirados da documentação do Asaas em 27/10/2026. O Asaas falso do ensaio (`deploy/ensaio/asaas-falso.mjs`) já imita essa rota.

---

## 5. Regras de uso, uma por uma

- **Quando um uso conta:** assim que a fatura com o cupom é gerada (fica "aguardando pagamento") e, de vez, quando é paga.
- **Fatura não paga:** a reserva deixa de contar no limite depois de **3 dias**, o prazo da fatura avulsa do Asaas. Se a pessoa pagar depois disso, o uso volta a contar. Num cupom com limite, pode acontecer de passar um pouco do limite nesse caso.
- **A mesma pessoa gera outra fatura com o mesmo cupom** (fechou a primeira sem pagar): a reserva antiga é liberada e a nova fica no lugar, sem gastar o limite dela.
- **Cancelado ou estornado:** pedido avulso cancelado (pelo painel ou pelo Asaas) ou estornado devolve o uso: ele deixa de contar.
- **Assinatura cancelada antes do primeiro pagamento** devolve o uso. Depois de paga uma mensalidade, o uso fica contado, mesmo que a pessoa cancele depois.
- **Dois clientes no último uso ao mesmo tempo:** só um leva. A conferência final é feita no banco, com o cupom travado durante a reserva; o outro ouve "Este cupom acabou de esgotar."
- **Assinatura aguardando o primeiro pagamento, sem cupom:** para usar um cupom, a pessoa cancela essa assinatura na tela de Planos e assina de novo com o cupom (a tela explica).
- **Editar um cupom já usado:** as mudanças valem para as compras novas. Quem já comprou ou assinou mantém o que foi combinado no dia: o valor, o desconto e o número de meses ficam guardados no uso. O **código** não muda depois do primeiro uso, porque ele está nos pedidos e nos links divulgados: pause o cupom e crie outro.
- **Pausar um cupom** não tira o desconto de quem já assinou com ele. Para isso, use "Encerrar desconto" em cada assinatura.
- **Equipe (plano Escritório):** quem compra e assina é o responsável, então é ele quem usa o cupom.
- **Se o Asaas falhar ao voltar a assinatura ao valor cheio:** o erro vai para o painel (e para o e-mail de alerta dos administradores), o desconto continua marcado como em andamento, e a próxima mensalidade paga tenta de novo. Para resolver na hora, use "Encerrar desconto".
- **Conferência na página de planos:** tem um freio de 15 tentativas por minuto por endereço, para ninguém ficar testando códigos ao acaso.

---

## 6. Por dentro (para quem mexe no código)

| Arquivo | O que tem |
| --- | --- |
| `db/migrations/016_cupons.sql` | Tabelas `cupom` (o cupom) e `cupom_uso` (cada uso, com o valor original, o valor final, os meses e as mensalidades com desconto), e as colunas `cupom_codigo`/`desconto` em `pedido` e `cupom_codigo`/`valor_cheio` em `assinatura`. |
| `apps/api/src/cupons/regras.ts` | O cálculo do preço, a situação (valendo, vencido...), as mensagens e o mínimo de R$ 5,00. Sem banco: fácil de testar. |
| `apps/api/src/cupons/aplicar.ts` | Confere se o cupom vale numa compra e o que acontece em cada evento: pagamento, cancelamento, estorno, mensalidade paga e fim do desconto no Asaas. |
| `apps/api/src/cupons/postgres.ts` e `memoria.ts` | Onde os cupons ficam guardados: no banco, ou na memória no modo demonstração. A reserva do uso é atômica no banco (`SELECT … FOR UPDATE`). |
| `apps/api/src/rotas/cupons.ts` | `POST /v1/cupons/validar` (página de planos) e as rotas do painel: `GET/POST /v1/admin/cupons`, `GET/PUT/DELETE /v1/admin/cupons/:id` e `POST /v1/admin/cupons/usos/:id/encerrar-desconto`. |
| `apps/api/src/rotas/pedidos.ts` e `assinaturas.ts` | `POST /v1/pedidos` e `POST /v1/assinaturas` aceitam `cupom`. |
| `apps/api/src/pagamentos/asaas.ts` | `atualizarValorAssinatura`: o `PUT /v3/subscriptions/{id}`. |
| `apps/web/src/paginas/CuponsPainel.tsx` | A aba Cupons do painel. |
| `apps/web/src/paginas/Planos.tsx` | O campo do cupom e os preços com desconto. |
| `apps/api/test/cupons.test.ts` | Testes da API: limites, datas, valor mínimo, 100%, primeira compra, assinatura que volta ao valor cheio, falha do Asaas e encerramento pelo painel. |
| `apps/e2e/testes/cupons.spec.ts` | Testes no navegador: o administrador cria o cupom pela tela e o cliente assina pelo link; código inexistente e cupom de 100%. |

Na exportação de dados do titular (LGPD, "Baixar meus dados"), o cupom aparece em cada compra (código e desconto) e em cada assinatura (código e valor cheio).
