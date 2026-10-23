# Segurança do Apto Rural

Revisão completa feita em **23/10/2026**, antes do lançamento. Este documento explica, em linguagem simples, o que foi conferido, o que foi corrigido e o que ainda depende de você.

## Por que isso importa

O Apto Rural guarda contas, senhas (em forma irreversível), pedidos pagos e dados de fazendas. A **LGPD** (Lei 13.709/2018) obriga quem trata dados pessoais a usar "medidas de segurança, técnicas e administrativas" para protegê-los (art. 46) e a avisar a ANPD e as pessoas afetadas quando houver um incidente que traga risco (art. 48). Fonte: [Lei 13.709/2018, no Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm).

## Resumo

| Área | Situação |
| --- | --- |
| Bibliotecas de terceiros | **0 vulnerabilidades conhecidas** (`npm audit` e `pip-audit`), depois de atualizar 6 pacotes. |
| Senhas e sessões | Conferido e reforçado (freio por e-mail, tempo de resposta igual). |
| Permissões do painel | Conferido: toda rota do painel checa o papel no servidor. |
| Pagamentos (Asaas) | Conferido: webhook autenticado e créditos sem duplicar. |
| Entradas do usuário | Reforçado: limites de tamanho e de coordenadas no contorno da fazenda. |
| Navegador | Reforçado: política de conteúdo (CSP) e redirecionamento só para o próprio site. |
| Servidor e banco | Reforçado: proxy confiável, banco local fechado à rede, faxina diária de dados vencidos. |

## O que foi corrigido nesta revisão

1. **Bibliotecas desatualizadas com falhas conhecidas.** Atualizadas: `@fastify/static` (falha alta), `nodemailer` (falha alta), `react-router-dom` (redirecionamento aberto) e, no ambiente de desenvolvimento, `vite`, `vitest` e `esbuild`.
2. **Endereço do visitante podia ser forjado.** A API confiava em qualquer cabeçalho `X-Forwarded-For`, e alguém poderia trocar de "IP" a cada tentativa para fugir do limite de tentativas. Agora só confia no Caddy, pela rede interna do Docker (`apps/api/src/servidor.ts`).
3. **Tentativas de senha por conta.** Além do limite por IP (10 a cada 15 min), agora **8 senhas erradas no mesmo e-mail** travam o login dessa conta por 15 minutos, mesmo trocando de IP. Criar uma senha nova pelo e-mail destrava (`apps/api/src/contas/tentativas.ts`).
4. **Tempo de resposta igual.** Com e-mail inexistente, o login respondia mais rápido, o que permitia descobrir quais e-mails têm conta. Agora o tempo é o mesmo.
5. **Contorno da fazenda.** Coordenadas fora do planeta e contornos com mais de 100 mil pontos são recusados. Ao mesmo tempo, o limite de tamanho subiu de 1 MB para 8 MB só na consulta, porque fazendas grandes passam de 1 MB (`apps/api/src/esquemas.ts`).
6. **Política de conteúdo (CSP) e permissões do navegador.** O site só carrega scripts dele mesmo; se alguém conseguisse injetar um script de fora, o navegador não rodaria. Câmera, microfone e localização ficam desligados (`deploy/Caddyfile`).
7. **Redirecionamento depois do login.** O endereço `?voltar=` só aceita páginas do próprio site. Antes, `//site-falso.com` passaria (truque usado em golpes de phishing).
8. **Identificadores.** Ids que não são UUID de verdade são recusados antes de chegar ao banco.
9. **Banco do computador de desenvolvimento.** Antes ficava aberto para a rede local (com a senha `apto`); agora só o próprio computador acessa.
10. **Faxina diária (LGPD, art. 15 e 16: guardar só pelo tempo necessário).** O monitor das 6h apaga sessões vencidas, links de e-mail usados ou vencidos há mais de 7 dias e registros de erro com mais de 90 dias.
11. **Excluir a conta e baixar os dados (adicionado depois da revisão).** A exclusão pede a senha de novo e não funciona no modo "entrar como"; o arquivo de dados nunca traz a senha nem chaves de acesso. Detalhes em [conformidade-legal.md](conformidade-legal.md).

## O que foi conferido e já estava certo

- **Senhas:** guardadas com `scrypt` (algoritmo lento de propósito), nunca em texto. Mínimo de 10 caracteres.
- **Sessão:** cookie `httpOnly` (o JavaScript da página não lê), `Secure` em produção e `SameSite=Lax`, o que, junto com o corpo em JSON, protege contra pedidos forjados de outros sites (CSRF). No banco fica só o código embaralhado (SHA-256) do token.
- **Senha nova derruba as outras sessões.** Links de e-mail valem uma vez só e vencem.
- **Painel:** suporte só vê; admin altera. Tudo é checado no servidor e registrado na auditoria. "Entrar como" é só leitura e dura 1 hora.
- **Banco de dados:** todas as consultas usam parâmetros, sem montar SQL com texto do usuário (evita *SQL injection*).
- **Telas:** o React escapa tudo o que mostra; os e-mails em HTML também escapam o texto.
- **Asaas:** o webhook confere o token com comparação de tempo constante; cada crédito tem uma referência única, então o mesmo pagamento nunca vira crédito duas vezes; o débito trava o saldo durante a operação.
- **CPF/CNPJ:** só com autorização e guardado como código irreversível (HMAC). O CPF de cobrança vai direto ao Asaas.
- **Logs:** cookies e o token do Asaas são apagados dos logs; o corpo das requisições nunca é registrado; erros internos não mostram detalhes a quem chamou.
- **Produção:** a API se recusa a subir sem banco, Asaas e SMTP, e o modo demonstração fica desligado. Containers rodam sem ser `root`; banco e API não ficam expostos na internet, só o Caddy (HTTPS com HSTS).
- **Coletores (Python):** baixam só dos endereços oficiais, por HTTPS, e a extração de arquivos `.zip` impede caminhos maliciosos.

## Escolhas conscientes (não são falhas)

- **Resultado público pelo link.** Quem tem o link (ou o QR do relatório) de uma consulta vê o resultado. É de propósito: o banco precisa conferir o relatório. O link é um UUID, impossível de adivinhar, e não mostra o CPF/CNPJ nem o dono.
- **Cadastro avisa se o e-mail já existe.** Facilita a vida do usuário; o custo é revelar que o e-mail tem conta. O limite de tentativas reduz o abuso.
- **O freio por e-mail fica na memória.** Reiniciar a API zera a contagem. Com um processo só, é suficiente; se um dia houver mais de uma API, mover para o banco.
- **Estilos na própria página.** A CSP permite estilos inline (`'unsafe-inline'` só em `style-src`) porque a interface usa alguns; scripts inline continuam proibidos.

## O que depende de você antes de lançar

- [ ] Gerar senhas e chaves **fortes e únicas** no `.env.producao` (`openssl rand -hex 32`) e nunca enviá-lo ao GitHub.
- [ ] Ativar a **verificação em duas etapas** no GitHub, no Asaas, no provedor de e-mail, no registro do domínio e no servidor.
- [ ] No servidor, entrar só por **chave SSH** (sem senha) e liberar no firewall apenas as portas 22, 80 e 443.
- [ ] Copiar os **backups para fora do servidor** com alguma frequência e testar uma restauração.
- [ ] Rodar `npm audit` antes de cada atualização e ativar os alertas do Dependabot no GitHub.
- [ ] Revisão de um advogado da política de privacidade, incluindo o plano para incidentes (abaixo).

## Se acontecer um incidente

1. **Conter:** bloquear contas suspeitas pelo painel, trocar as chaves afetadas (Asaas, SMTP, banco) e, se preciso, tirar o site do ar.
2. **Registrar:** o que aconteceu, quando, quais dados e quantas pessoas. A ANPD exige guardar esse registro por **5 anos**, mesmo dos incidentes que não precisam ser comunicados (Resolução CD/ANPD nº 15/2024, art. 10).
3. **Comunicar:** se houver risco ou dano relevante às pessoas, avisar a **ANPD** e os **titulares** em até **3 dias úteis** a partir de quando você soube que dados pessoais foram afetados (arts. 6º e 9º da mesma resolução). Fontes: [Resolução CD/ANPD nº 15/2024](https://bibliotecadigital.mj.gov.br/bitstream/1/12879/2/RES_ANPD_2024_15.html) e [página da ANPD sobre comunicação de incidente](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis).

## Como conferir de novo

```bash
npm audit                     # bibliotecas com falhas conhecidas
npm test --workspaces         # inclui os testes de segurança ("segurança" em apps/api/test)
```

Com o banco local rodando, os scripts `apps/api/scripts/testar-*.ts` testam carteira, painel e fazendas reais de ponta a ponta.
