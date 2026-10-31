# Fotos das telas do README

As imagens da seção "As telas, uma por uma" do README ficam em `docs/img/telas/`. Elas são tiradas do próprio sistema, no **modo de demonstração**, com dados fictícios: nenhuma pessoa ou fazenda real aparece.

## Quando refazer

Sempre que uma tela mudar de um jeito que a foto fique diferente do site (um botão novo, um texto trocado, uma seção nova). As fotos atuais são de 28/10/2026.

## Como refazer

São os mesmos servidores dos testes de navegador ([testes-navegador.md](testes-navegador.md)):

```bash
npm run build                                          # o site compilado
docker compose up -d db                                # banco
docker compose -f apps/e2e/docker-compose.yml up -d    # Mailpit
node apps/e2e/servidor.mjs                             # em outro terminal: API no modo demonstração
node apps/e2e/telas-readme.mjs                         # tira as fotos e grava em docs/img/telas/
```

O script `apps/e2e/telas-readme.mjs`:
1. **Cria as contas de exemplo:** uma técnica (`tecnica@exemplo.test`) e a administradora dos testes (`admin@e2e.local`), confirmando o e-mail pelo Mailpit.
2. **Faz o percurso:** uma consulta de exemplo (Embargo + Prodes), abre o dossiê, pede um rascunho, abre a ajuda e cria dois cupons no painel.
3. **Tira cada foto:** sem a faixa "Modo demonstração" e sem o botão "Dúvidas?", menos na foto da própria ajuda. O navegador roda em português, para as datas saírem no formato brasileiro.

Rode o script logo depois de subir o `servidor.mjs` (que recria o banco) e **não** junto com os testes de navegador: ele cria a conta da administradora dos testes com outra senha, e os testes do painel deixariam de entrar.

Para usar um Chromium já instalado, passe o caminho em `PW_CHROMIUM`. Se o Mailpit estiver em outro endereço, passe-o em `E2E_MAILPIT`.

Se mudar o nome de um botão usado no percurso (por exemplo "Consultar imóvel" ou "Novo cupom"), ajuste o script também.
