# Central de ajuda, tour e navegação

Três peças para a pessoa achar o caminho sozinha, sem esperar suporte e sem gastar IA:

1. **Central de ajuda com cara de chat**: o botão verde "Dúvidas?" no canto de baixo de todas as telas.
2. **Tour de boas-vindas**: na primeira entrada, mostra as funções principais em 8 passos.
3. **Menu com todas as telas**: no celular e em telas menores, o botão "Menu" do cabeçalho.

## 1. Central de ajuda

**Como a pessoa usa:**
- Clica em "Dúvidas?" e o chat abre com as **dúvidas comuns da tela em que ela está** (no lote, as do lote; no resultado, as do semáforo, do mapa e do dossiê).
- Toca numa pergunta, ou escreve com as próprias palavras ("meu shapefile não abre", "aceita pix?").
- A resposta vem na hora, com **links para a tela certa** ("Recuperar a senha", "Abrir a carteira"…) e outras perguntas parecidas.
- Se nada combinar, o chat diz que não achou e oferece os assuntos. Ele **nunca inventa resposta**.
- Esc ou o X fecham. "Recomeçar" limpa a conversa.

**Também existe a página `/ajuda`:** as mesmas perguntas, todas à vista, separadas por assunto e com busca. Cada pergunta tem endereço próprio, por exemplo `/ajuda#quilombolas`, para mandar a um cliente.

**Por que não usa IA:**
- As respostas são **textos prontos**, escritos a partir do que o sistema faz de verdade.
- A busca roda **no próprio navegador**: não chama a API, não custa nada e responde mesmo com a internet fraca do campo.
- A busca ignora acentos e maiúsculas, entende plural e palavras parecidas ("consultar" acha "consulta") e usa uma lista de sinônimos por pergunta.

**Onde fica cada coisa:**

| Arquivo | O que tem |
| --- | --- |
| `apps/web/src/ajuda/conteudo.ts` | Os assuntos e as perguntas com as respostas, links, palavras-chave e telas em que cada uma aparece. |
| `apps/web/src/ajuda/busca.ts` | A busca (pontuação por palavra) e as sugestões por tela. |
| `apps/web/src/componentes/CentralAjuda.tsx` | O botão e o chat. |
| `apps/web/src/paginas/Ajuda.tsx` | A página `/ajuda`. |

**Como acrescentar ou mudar uma resposta:**
1. Edite `ajuda/conteudo.ts`. Cada pergunta tem `pergunta`, `resposta` (um parágrafo por item), `links`, `palavras` (como as pessoas falam) e `telas` (a primeira é a principal).
2. **Mudou uma regra, um prazo ou uma tela? Atualize a resposta junto.** Os números das respostas foram conferidos no código em 26/10/2026:
   - links: confirmação vale 48 h, convite 7 dias, nova senha 1 h;
   - senha: pelo menos 10 caracteres;
   - lote: até 200 imóveis;
   - arquivos: .zip até 25 MB, KML e GeoJSON até 5 MB;
   - consulta grátis: 1, ao confirmar o e-mail;
   - consulta que falha por erro nosso: o crédito volta.
3. Preços **não** entram nas respostas: elas mandam para a tela de Planos, que mostra o valor do painel.
4. Os testes em `apps/e2e/testes/ajuda.spec.ts` conferem algumas respostas. Se mudar o texto delas, ajuste o teste.

## 2. Tour de boas-vindas

**Quando aparece:**
- Na **primeira vez** que a pessoa entra com a conta, na tela de consulta.
- Pular ou terminar grava na conta que o tour já foi visto (coluna `usuario.tour_visto_em`, migração 015, rota `POST /v1/conta/tour`). Assim ele **não volta**, nem em outro celular ou computador.
- Nunca aparece no modo "entrar como" do suporte.
- Para ver de novo: "Ver o tour do sistema" no chat, ou "Ver o tour de novo" na página de ajuda.

**Os 8 passos:**
1. Boas-vindas.
2. Código do CAR.
3. Arquivo do contorno.
4. Botão de consultar e o que vem no resultado.
5. Consulta em lote.
6. Carteira (no celular, o passo aponta para o botão "Menu").
7. Saldo e conta.
8. O botão de ajuda.

**Como funciona por dentro:**
- Cada passo destaca um elemento marcado com `data-tour="…"` na tela. O resto escurece e não pode ser clicado.
- Se o elemento não estiver na tela, o passo aparece no meio, sem destaque.
- Teclado: setas para andar, Esc para pular.
- O código fica em `apps/web/src/componentes/Tour.tsx`.

## 3. Navegação

**No computador (1024 px ou mais),** o cabeçalho mostra: Consultar, Em lote, Carteira, Equipe (quem é de equipe), Planos, Ajuda, Painel (administração e suporte) e o saldo.

**Em telas menores,** ficam à vista só o saldo (ou "Criar conta") e o botão **Menu**. O menu abre a lista completa, agrupada pelo que a pessoa quer fazer:

| Grupo | Telas |
| --- | --- |
| Consultar | Consultar imóvel, Consulta em lote |
| Acompanhar | Carteira, Equipe |
| Conta | Minha conta, Planos e créditos, Painel administrativo, Sair |
| Ajuda | Tirar uma dúvida agora (abre o chat), Perguntas frequentes, Regras e fontes |

O menu fecha ao trocar de tela, com Esc ou ao clicar fora.

**Outras melhorias de caminho:**
- O rodapé ganhou a coluna **Ajuda**.
- A página "não encontrada" oferece "Fazer uma consulta" e "Central de ajuda".
- Qualquer tela pode abrir o chat ou o tour com `abrirAjuda()` e `iniciarTour()`, de `apps/web/src/ajuda/eventos.ts`.

## Testes

`apps/e2e/testes/ajuda.spec.ts`, no navegador, a cada envio para o GitHub:
- **Chat:** sugestões da tela, resposta para dúvida escrita, link que leva à tela certa, dúvida sem resposta pronta e Esc para fechar.
- **Página de ajuda:** busca sem acento e pergunta aberta pelo endereço.
- **Tour:** aparece na primeira entrada, não volta depois de pular e pode ser visto de novo até o fim.
- **Celular:** o menu leva a todas as telas, fecha ao navegar e abre o chat, sem rolagem lateral.

Os outros testes criam contas com o tour já marcado como visto, para ele não cobrir a tela (veja `criarContaConfirmada` em `apps/e2e/testes/apoio.ts`).
