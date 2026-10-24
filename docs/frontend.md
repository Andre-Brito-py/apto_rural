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

Escolhas de cuidado: nada de depoimentos ou números inventados; fonte **Inter** (licença livre OFL) servida pelo próprio site, sem Google Fonts, porque a política de segurança só permite arquivos do próprio site. O navegador baixa só o trecho latino, cerca de 48 KB, e as variantes ligadas deixam "I", "l" e "1" diferentes, o que ajuda a ler códigos do CAR e senhas; ícones desenhados no próprio código (`componentes/Icones.tsx`); layout de 1120px no computador e de uma coluna no celular, sem rolagem lateral. Os estilos ficam em `estilo.css`, com o prefixo `l-`.

## Telas do app no mesmo padrão

As telas de quem já tem conta seguem o visual da landing, para o produto parecer uma coisa só:

- **Topo de cada página:** sobretítulo verde em maiúsculas, título grande e uma linha de explicação (classes `topo-pagina` e `sobretitulo`).
- **Entrar / criar conta:** no computador, um painel verde ao lado do formulário lembra o que o Apto Rural entrega; no celular, só o formulário.
- **Planos:** os mesmos cartões de preço da landing; a compra avulsa aparece em dois cartões menores.
- **Minha conta:** o saldo de consultas e dossiês em destaque, atalhos e a lista de compras em tabela.
- **Consulta:** o formulário dividido em três partes numeradas (dados do imóvel, mapa, opcional) e os exemplos de demonstração como botões pequenos.
- **Resultado:** veredito maior, contagem em etiquetas e botões de ação lado a lado.

- **Equipe (`/equipe`):** ocupação ("3 de 5 pessoas"), lista de pessoas com papel e consultas no mês, convites em aberto, formulário de convite e o que cada papel faz. O técnico vê só a lista e o botão de sair. Quem não tem plano de equipe vê o convite para conhecer o Escritório.
- **Convite (`/convite?token=…`):** o que a pessoa vê ao abrir o link do e-mail. Sem conta, cria pelo próprio link (o e-mail já vem preenchido); com outra conta aberta, oferece sair e entrar com o e-mail certo.
- **Carteira:** pensada para quem acompanha dezenas ou centenas de fazendas.
  - **Painel de resumo** num cartão só: imóveis acompanhados e o limite do plano; barra de distribuição por situação, cuja legenda também filtra; e a hora da última reconferência ("hoje, 06:02"), no fuso de Brasília.
  - **Lista em linhas**, como uma tabela, com colunas Imóvel (apelido, UF e CAR), Situação (selo curto com ícone), **O que pesa** (os itens com problema, sem precisar abrir o resultado) e Conferido.
  - **Ferramentas:** filtro em abas, busca e ordenação ("mais graves primeiro" é o padrão).
  - **Ação destrutiva escondida:** "Deixar de acompanhar" fica num menu "⋯", longe do "Ver resultado".
  - **No celular**, cada linha vira um bloco empilhado.
- **Dossiê:** aparece como uma folha de documento (cabeçalho com a marca, identificação do imóvel, QR de conferência, resumo numerado e uma seção por item), com uma barra fixa no topo para voltar ou salvar em PDF. Na impressão sai só a folha, sem menus. Antes de gerar, a tela explica o que o dossiê traz e quanto custa.
- **Painel administrativo:** organizado em abas (Visão geral, Usuários, Pedidos, Preços e limites, Auditoria). A aba fica no endereço (`/admin?aba=usuarios`), então dá para mandar o link direto. A visão geral separa os números de negócio dos de uso e marca na aba quando há erros ou bases atrasadas. A ficha do usuário mostra iniciais, etiquetas (papel, bloqueio, e-mail não confirmado) e os números principais em destaque.
- **Para quem está numa equipe:** o topo mostra o saldo da equipe e o link "Equipe"; Minha conta e Carteira dizem de quem é a equipe; Planos explica que só o responsável compra; o técnico não vê o botão de tirar imóveis da carteira.

**Identidade visual (versão atual):** cabeçalho branco fixo no topo, com o saldo num selo verde discreto e o botão "Criar conta" para quem chega; topo da landing claro, com uma trama de pontos bem leve e o produto em destaque; verde da marca nos botões principais e no destaque do título; amarelo só no aviso do modo demonstração; rodapé completo, em colunas (Produto, Conta, Legal). Base de 16 px, títulos com peso 650–700 e espaçamento apertado, cantos de 10–12 px e sombras suaves.

A base (cartões, botões, campos, rodapé) mudou para todas as telas: bordas mais suaves, cantos de 14px e cores de texto iguais às da landing.
