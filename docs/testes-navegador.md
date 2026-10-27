# Testes no navegador (ponta a ponta)

Os testes de regras e da API conferem a lógica. Estes conferem o que o cliente vê: abrem o site num **Chrome de verdade** (também como celular) e clicam como uma pessoa. Usam o [Playwright](https://playwright.dev), versão fixa 1.64.1.

Rodam sozinhos no GitHub a cada envio de código (`verificacao-automatica.md`). Também dá para rodar no seu computador.

## O que é testado

| Caminho | Onde |
| --- | --- |
| Landing sem erro de JavaScript, planos, regras e fontes, termos, privacidade, página que não existe | `publico.spec.ts` |
| Consulta de exemplo sem conta: resultado, mapa do entorno, dossiê com QR; código do CAR inválido recusado; sem conta não aparece o botão de IA | `consulta-demo.spec.ts` |
| Criar conta, confirmar pelo e-mail que chegou de verdade, sair, senha errada, entrar, **baixar meus dados**, **excluir a conta** (LGPD), recuperar a senha | `conta.spec.ts` |
| Comprar com o pagamento simulado, consultar um imóvel com contorno, explicação para o produtor, acompanhar na carteira; sem crédito, o site pede para comprar | `compra-e-carteira.spec.ts` |
| Consulta em lote com planilha do Excel em português (acentos em Windows-1252), resultado baixado em planilha | `lote.spec.ts` |
| Painel: quem não é administrador fica de fora; visão geral (servidor e bases), abas, aba de IA recusa o que não é chave | `admin.spec.ts` |
| Cupons: o administrador cria o cupom pela tela (com a simulação do preço), o cliente chega pelo link de divulgação, assina com desconto e o painel mostra o uso; código inexistente; cupom de 100% na consulta avulsa sai de graça | `cupons.spec.ts` |
| **No celular** (Pixel 7): as páginas principais sem rolagem para o lado, consulta de exemplo com mapa | `celular.spec.ts` |

Todo teste também falha se a página tiver **erro de JavaScript** ou **algum arquivo ou chamada respondendo erro**, mesmo que a tela pareça certa.

## Como funciona

- **O mesmo jeito de servir que em produção:** o site compilado, servido pela API num endereço só (`apps/e2e/servidor.mjs`).
- **Um banco próprio,** `apto_e2e`, apagado e recriado a cada rodada. O banco de desenvolvimento nunca é tocado.
- **E-mails de verdade, por SMTP,** para o **Mailpit** (uma caixa de correio falsa). O teste lê o link de confirmação lá.
- **Modo demonstração ligado:** CARs de exemplo e pagamento simulado, sem Asaas e sem as bases oficiais.

## Rodar no seu computador

```bash
# 1. banco (o mesmo do desenvolvimento) e a caixa de correio falsa
docker compose up -d db
docker compose -f apps/e2e/docker-compose.yml up -d
# 2. uma vez só: o Chromium que o Playwright usa (~150 MB)
npx playwright install chromium
# 3. compila e roda
npm run e2e
```

Para ver o relatório com fotos da tela e o passo a passo de cada teste:

```bash
npm run relatorio -w @apto/e2e
```

## O que os testes já acharam (26/10/2026)

1. **Limite de acessos baixo demais.** O freio geral da API (120 por minuto por endereço de internet) contava também os arquivos do site: cada página carrega de 10 a 15. Com pouca navegação, ou num escritório com vários técnicos atrás do mesmo endereço, o logo sumia e os botões de exemplo não apareciam.
   - **Agora:** os arquivos do site ficam fora do freio, e a API tem 300 por minuto. Login, cadastro e e-mails continuam com freios próprios, mais apertados.
2. **Confirmação de e-mail limitada a 5 por 15 minutos por endereço.** O 6º técnico de um escritório não conseguia confirmar a conta.
   - **Agora:** 30. O link tem um código aleatório de 256 bits, impossível de adivinhar.
3. **Erro no navegador a cada consulta de município fora da tabela do Incra.** A busca do módulo fiscal respondia 404.
   - **Agora:** responde vazio, que é o caso normal para municípios criados depois de 2013 e para os CARs de exemplo.

## Como escrever um teste novo

- **Um arquivo por caminho do cliente** em `apps/e2e/testes/`.
- **Peças prontas** em `apoio.ts`:
  - `criarContaConfirmada`;
  - `linkDoEmail`;
  - `emailNovo` (e-mail único por teste);
  - `semRolagemLateral`;
  - `vigiarErros`.
- **Procure pelo que o cliente vê:** o texto do botão, o rótulo do campo (`getByRole`, `getByLabel`), não a classe do CSS. Assim o teste não quebra quando o visual muda.
- **Os testes rodam um de cada vez** (`workers: 1`): eles dividem o mesmo banco.
