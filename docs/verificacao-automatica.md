# Verificação automática (GitHub Actions)

Toda vez que um código novo chega ao GitHub (um `git push` para a `main` ou um pull request), o GitHub liga um computador temporário, baixa o projeto e confere se nada quebrou. Ninguém precisa lembrar de rodar os testes: se algo der errado, o commit ganha um **X vermelho** e o GitHub manda um **e-mail** para quem enviou.

O roteiro está em [`.github/workflows/verificacao.yml`](../.github/workflows/verificacao.yml).

## O que é conferido

| Verificação | O que faz | Por que importa |
| --- | --- | --- |
| **Testes, tipos e build** | Instala as bibliotecas exatamente como estão no `package-lock.json`, confere os tipos do TypeScript, roda os testes das regras do MCR e da API (contas, pagamentos, equipes, LGPD, segurança) e monta a versão de produção do site e da API. | Pega erro de lógica numa regra ou num pagamento antes de chegar ao servidor. |
| **Migrações num banco novo** | Sobe um PostgreSQL + PostGIS vazio, aplica todas as migrações de `db/migrations` e roda de novo para confirmar que nada é aplicado duas vezes. | Um erro de SQL só apareceria na hora de atualizar o servidor, com o site fora do ar. |
| **Testes no navegador (ponta a ponta)** | Abre o site num Chrome de verdade, no computador e no celular, e faz o caminho de um cliente: criar conta, confirmar o e-mail (o e-mail sai mesmo, para uma caixa falsa), comprar com o pagamento simulado, consultar, gerar o dossiê, usar o lote e o painel. Veja [testes-navegador.md](testes-navegador.md). | Pega o que os outros testes não veem: botão que some, página quebrada no celular, logo que não carrega. Achou dois problemas reais no primeiro dia. |
| **Coletores (Python)** | Instala as bibliotecas dos coletores e confere que todo o código abre e compila (sem baixar nenhuma base). | Os coletores rodam de madrugada: um erro bobo só seria notado no dia seguinte. |
| **Bibliotecas sem falhas conhecidas** | `npm audit` (falhas altas ou críticas) e `pip-audit` nos coletores. | Avisa quando surge um alerta de segurança novo numa biblioteca, como o da zod em 23/10/2026. |
| **Imagens de produção (Docker)** | Monta as duas imagens que o servidor usa (API + site e coletores), sem publicar nada. | Garante que o `docker compose ... up --build` do servidor vai funcionar. |

As seis rodam ao mesmo tempo e levam alguns minutos. O fluxo só **lê** o código: não publica nada, não mexe no repositório e não usa senha nem chave nenhuma.

## Como acompanhar

- No GitHub, na aba **Actions** do repositório, aparece cada execução, com um ✓ verde ou um ✗ vermelho.
- Na lista de commits, cada um mostra o mesmo sinal ao lado.
- Para rodar à mão (por exemplo, para ver se um alerta de biblioteca já foi resolvido), abra **Actions → Verificação → Run workflow**.

## Quando der vermelho

1. Abra a execução com ✗ e clique na verificação que falhou. O GitHub mostra o passo e a mensagem de erro.
2. Rode o mesmo comando no seu computador (veja a tabela abaixo) para reproduzir.
3. Corrija, envie de novo e veja ficar verde.

| Verificação | Comando no seu computador |
| --- | --- |
| Testes, tipos e build | `npm run typecheck`, `npm test` e `npm run build` |
| Migrações | `npm run migrar -w @apto/api` (com o banco local rodando) |
| Navegador | `npm run e2e` (veja [testes-navegador.md](testes-navegador.md)). Se falhar no GitHub, baixe o **relatorio-testes-navegador** no fim da página da execução: ele tem a foto da tela e o passo a passo de onde parou. |
| Coletores | `python -m compileall -q coletores` |
| Bibliotecas | `npm audit --audit-level=high` e `pip-audit -r coletores/requirements.txt` |
| Docker | `docker build .` e `docker build -f Dockerfile.coletores .` |

> Se a única coisa vermelha for **"Bibliotecas sem falhas conhecidas"**, não é erro no seu código: saiu um alerta novo numa biblioteca usada pelo projeto. Atualize a biblioteca (`npm audit` mostra qual) e envie de novo.

## O que esta verificação **não** cobre

- **Os testes com fazendas reais** (`apps/api/scripts/testar-*.ts`) precisam das bases oficiais carregadas, que ocupam gigabytes. Eles continuam sendo rodados à mão, antes de cada atualização importante (veja o README, seção "Testes").
- **O visual em detalhe:** os testes de navegador conferem se as coisas aparecem e funcionam (e se a página não rola para o lado no celular), não se está bonito.
- **O servidor de produção:** ela confere que as imagens montam, não que o servidor está no ar. Para isso existe o vigia do site ([backup-e-vigia.md](backup-e-vigia.md)).
