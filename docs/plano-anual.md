# Plano anual

Além da mensalidade, cada plano pode ser assinado **por ano**: uma cobrança só, por um preço menor que 12 mensalidades, com os créditos do ano inteiro liberados no pagamento. O plano anual ajuda nas épocas fracas: quem assina na safra continua cliente o ano todo.

## Como funciona para o cliente

| | Mensal | Anual |
| --- | --- | --- |
| **Cobrança** | Todo mês | Uma vez por ano (Pix, cartão ou boleto) |
| **Preço padrão** | Projetista R$ 199, Escritório R$ 499 | 10 mensalidades: R$ 1.990 e R$ 4.990 (2 meses grátis) |
| **Créditos** | Os do mês, a cada mensalidade paga | Os do ano inteiro (12 × os do mês), de uma vez, no pagamento |
| **Carteira e equipe** | As do plano | As mesmas do plano mensal |
| **Cancelar** | As próximas mensalidades não são cobradas | "Cancelar renovação": o plano vale até o fim do ano pago |
| **Créditos que sobram** | Não vencem | Não vencem |

- Na tela de Planos, um seletor **Mensal / Anual** mostra os dois preços. O selo diz quantos meses saem de graça (ou "com desconto", se o preço não fechar em meses inteiros). O card do anual mostra o valor por mês e a economia no ano.
- O link `/planos?ciclo=anual` já abre no anual (combina com o cupom: `/planos?cupom=CODIGO&ciclo=anual`).
- Com a renovação cancelada, a tela mostra "renovação cancelada: vale até …", e outro plano só pode ser assinado depois dessa data.

## Regras por dentro

- **Preço:** cada plano tem `valorAnual` no painel (**Preços e limites**, coluna R$/ano). Vazio = o plano não tem opção anual. Configurações salvas antes do plano anual usam o padrão do plano (10 mensalidades).
- **Na contratação**, ficam fixados o preço, os créditos do ano, a carteira e a equipe, como no mensal. A assinatura guarda `ciclo = anual`, e o nome aparece como "Projetista (anual)".
- **No Asaas**, a assinatura é criada com `cycle: YEARLY`. Os avisos de pagamento são os mesmos do mensal.
- **Cada anuidade paga** vira um pedido com os créditos do ano e estende `valida_ate` em 12 meses. Se a renovação for paga antes de vencer, os 12 meses contam a partir do fim do ano anterior.
- **Cancelar renovação** (anual já pago, dentro do ano): cancela a assinatura no Asaas (não há próxima cobrança), marca `renovacao_cancelada_em` e mantém a assinatura **ativa**. Na reconferência diária das 6h, as que passaram de `valida_ate` são encerradas.
- **Anual ainda não pago:** cancelar encerra na hora, como no mensal.
- **Atraso na renovação:** a assinatura fica "em atraso", como no mensal, e a carteira volta ao limite de quem não assina até o pagamento.
- **Painel:** a receita recorrente conta a anuidade como 1/12 por mês. Na ficha do usuário, o plano aparece com "/ano" e a data até quando vale. O administrador que cancela pela ficha encerra na hora (é o caminho para devolver o dinheiro: cancelar e estornar o pedido).
- **Cupom:** o desconto vai na anuidade. Um cupom de "N mensalidades" vale **só na primeira anuidade**; um de "todas as mensalidades" vale em todas as anuidades. Depois, a renovação volta sozinha ao valor cheio no Asaas, como no mensal ([cupons.md](cupons.md)).

## A confirmar

- **Devolução:** hoje, cancelar a renovação não devolve o dinheiro do ano pago. O direito de arrependimento (7 dias, art. 49 do Código de Defesa do Consumidor) é atendido pelo painel: cancelar e estornar o pedido. **A CONFIRMAR** com advogado: a regra de devolução no plano anual e o texto dos termos de uso.
- **No sandbox do Asaas:** conferir a assinatura anual (`cycle: YEARLY`) e a volta ao valor cheio depois de um cupom.

## Para quem mexe no código

| Peça | Onde |
| --- | --- |
| Preço anual e créditos do ano | `apps/api/src/produtos.ts` (`valorAnual`, `valorAnualDoPlano`, `creditosDoAno`) |
| Contratar e cancelar | `apps/api/src/rotas/assinaturas.ts` |
| Validade do ano pago e encerramento | `apps/api/src/assinaturas/mensalidades.ts` (`proximaValidade`, `encerrarAnuaisVencidas`), chamado em `monitorar.ts` |
| Asaas | `apps/api/src/pagamentos/asaas.ts` (`cycle: YEARLY`) |
| Cupom no anual | `apps/api/src/cupons/aplicar.ts` e `regras.ts`; `/v1/cupons/validar` devolve o preço mensal e o anual |
| Banco | migração `020_plano_anual.sql`: `assinatura.ciclo`, `valida_ate`, `renovacao_cancelada_em` |
| Telas | `paginas/Planos.tsx` (seletor e card), `Landing.tsx`, `ConfiguracoesPainel.tsx` (coluna R$/ano), `AdminUsuario.tsx` |
| Testes | `apps/api/test/plano-anual.test.ts` |
