# Interface: decisões para o técnico do campo

| Contexto do usuário | Decisão |
| --- | --- |
| Celular, sol forte | Fundo claro, texto escuro, base de 17px, contraste AA nas cores de status |
| Dedos, luva, tela pequena | Alvos de toque de 48px; botões de largura total no celular |
| 3G fraco na fazenda | Fonte do sistema, nenhum mapa de terceiros; contorno do imóvel em SVG próprio; ~64 KB compactados |
| Daltonismo | Status sempre com ícone + palavra (✕ Impedimento, ⚠ Atenção, ✓ OK, ? Não verificado) |
| Linguagem | Pergunta de técnico em cada item + o item do MCR clicável |
| Repassar ao produtor | Botão "Enviar resumo no WhatsApp" |
| Anexar à proposta | "Salvar relatório em PDF" pelo próprio navegador, com estilo de impressão |
| Confiança | Página "Regras" lista norma, base e data de atualização de cada item |
| Honestidade | Base não consultada = "Não verificado"; avisos do MMA repetidos no resultado |

O resultado abre com o veredito e, em seguida, os itens ordenados pelo que trava primeiro: impedimento, atenção, não verificado, OK. Os itens com problema já vêm abertos, com os caminhos de saída.

## Página de vendas (landing)

É o que o visitante sem conta vê em `/`. O objetivo é passar confiança a quem chega por um anúncio ou indicação, por isso segue o padrão visual de produtos de software profissionais:

| Seção | Para quê |
| --- | --- |
| Topo com prévia do produto | Mostra o resultado de verdade (com dados fictícios, avisado) ao lado da promessa e do botão principal. |
| Faixa das fontes | Lista os órgãos de onde vêm os dados. Só os nomes, sem logotipos de governo, para não sugerir parceria oficial. |
| Problema, prazos do Prodes, como funciona, o que checamos | Explica a dor, a urgência (com a norma citada) e o produto. |
| Diferenciais | Dossiê "do vermelho ao verde", carteira com avisos e relatório com QR. |
| Preços | Lê planos e preços do painel (nada fixo no código). O plano marcado como destaque aparece como "Recomendado". |
| Perguntas e chamada final | Tira objeções e repete o convite para a consulta grátis. |

Escolhas de cuidado: nada de depoimentos ou números inventados; fonte do sistema (sem baixar fontes externas, o que a política de segurança do site bloquearia); ícones desenhados no próprio código (`componentes/Icones.tsx`); layout de 1120px no computador e de uma coluna no celular, sem rolagem lateral. Os estilos ficam no fim de `estilo.css`, com o prefixo `l-`.
