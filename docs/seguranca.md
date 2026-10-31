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
3. **Tentativas de senha por conta.** Além do limite por IP (10 a cada 15 min; 20 desde 27/10/2026, ver abaixo), agora **8 senhas erradas no mesmo e-mail** travam o login dessa conta por 15 minutos, mesmo trocando de IP. Criar uma senha nova pelo e-mail destrava (`apps/api/src/contas/tentativas.ts`).
4. **Tempo de resposta igual.** Com e-mail inexistente, o login respondia mais rápido, o que permitia descobrir quais e-mails têm conta. Agora o tempo é o mesmo.
5. **Contorno da fazenda.** Coordenadas fora do planeta e contornos com mais de 100 mil pontos são recusados. Ao mesmo tempo, o limite de tamanho subiu de 1 MB para 8 MB só na consulta, porque fazendas grandes passam de 1 MB (`apps/api/src/esquemas.ts`).
6. **Política de conteúdo (CSP) e permissões do navegador.** O site só carrega scripts dele mesmo; se alguém conseguisse injetar um script de fora, o navegador não rodaria. A única exceção é o botão "Continuar com o Google", só nos endereços `https://accounts.google.com/gsi/…` que a documentação do Google indica (veja [login-google.md](login-google.md)). Câmera, microfone e localização ficam desligados (`deploy/Caddyfile`).
7. **Redirecionamento depois do login.** O endereço `?voltar=` só aceita páginas do próprio site. Antes, `//site-falso.com` passaria (truque usado em golpes de phishing).
8. **Identificadores.** Ids que não são UUID de verdade são recusados antes de chegar ao banco.
9. **Banco do computador de desenvolvimento.** Antes ficava aberto para a rede local (com a senha `apto`); agora só o próprio computador acessa.
10. **Faxina diária (LGPD, art. 15 e 16: guardar só pelo tempo necessário).** O monitor das 6h apaga sessões vencidas, links de e-mail usados ou vencidos há mais de 7 dias e registros de erro com mais de 90 dias.
11. **Excluir a conta e baixar os dados (adicionado depois da revisão).** A exclusão pede a senha de novo e não funciona no modo "entrar como"; o arquivo de dados nunca traz a senha nem chaves de acesso. Detalhes em [conformidade-legal.md](conformidade-legal.md).
12. **Alerta novo na biblioteca de validação (zod), em 23/10/2026.** Um alerta publicado depois da revisão ([GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)) mostrou que uma lista enorme de itens inválidos podia esgotar a memória do servidor; no Apto Rural, a porta de entrada seria o contorno da fazenda. A zod foi atualizada para a versão 4.6.7, e o contorno agora passa antes por uma conferência rápida que para no primeiro ponto inválido (`conferirGeometriaRapido`, em `apps/api/src/esquemas.ts`), porque mesmo a versão nova falha com listas gigantes (dá erro de pilha). Um teste automático manda 600 mil pontos inválidos e confere que a resposta é uma recusa rápida.

## Segunda revisão (27/10/2026)

Conferiu tudo o que entrou depois da primeira (equipes, IA, consulta em lote, mapa, backup externo, cupons) e de novo os pontos centrais. Nenhuma falha grave nem acesso a dados de outra pessoa. O que mudou:

1. **Alerta de erro não vira golpe.** O endereço que recebe erros das telas (`POST /v1/erros`) é aberto a qualquer visitante, e o texto ia para o assunto e o corpo do e-mail de alerta dos administradores, saindo do domínio do Apto Rural. Alguém poderia mandar "sua conta Asaas foi suspensa, acesse…". Agora, nos erros que vêm do site, o assunto é fixo, os links vêm quebrados (`https[:]//`) e o texto é marcado como "enviado pelo navegador de um visitante". O texto inteiro continua no painel (`apps/api/src/monitoramento/erros.ts`).
2. **Verificação em duas etapas.** Login com senha **e** o código de 6 dígitos de um aplicativo autenticador (Google Authenticator, Microsoft Authenticator…), que muda a cada 30 segundos. Ligar é em **Minha conta**: senha, QR no aplicativo, primeiro código e **10 códigos de recuperação** (cada um vale uma vez, para quando o celular some).
   - **Obrigatória para administrador e suporte no servidor de produção:** sem ela, o painel fica bloqueado e mostra onde ligar. Nas outras contas, é opcional.
   - O segredo do aplicativo fica **cifrado** no banco (AES-256-GCM, com a `CHAVE_SEGREDOS`); os códigos de recuperação, só como SHA-256.
   - O mesmo código não vale duas vezes, e ligar a verificação desconecta os outros aparelhos.
   - Código errado conta no freio de 8 tentativas por e-mail, que só zera quando senha **e** código estão certos.
   - O link de "esqueci minha senha" não basta para entrar: a pessoa cria a senha nova e entra com ela **e** com o código.
   - **Perdeu o celular e os códigos?** Outro administrador desliga a verificação na ficha da pessoa (com motivo, na auditoria), depois de confirmar que é ela. A pessoa sai de todos os aparelhos. Se for o **único** administrador, veja "Se o único administrador perder o celular", abaixo.
   - Código: `apps/api/src/contas/totp.ts` (RFC 6238, conferido com os exemplos oficiais da norma), `contas/doisFatores.ts` e `rotas/doisFatores.ts`.
3. **Painel só com login recente.** Os poderes de administrador e suporte valem por **12 horas** depois do login (a sessão comum continua valendo 30 dias, mas só como cliente). Uma sessão esquecida aberta ou roubada não dá poder de administrador por um mês.
4. **Aviso de acesso ao painel.** Cada login de administrador ou suporte manda um e-mail com data, endereço de internet e navegador, e um botão para criar senha nova se não foi a pessoa.
5. **Limite de login por endereço: 20 a cada 15 minutos** (era 10). Com a verificação em duas etapas, cada login são dois pedidos, e um escritório com vários técnicos sai pelo mesmo endereço. Quem tenta adivinhar a senha ou o código de uma conta para no freio por e-mail.
6. **Nada de cópia no navegador.** As respostas da API (`/v1/…`) vão com `Cache-Control: no-store`: num computador compartilhado, o "voltar" do navegador não mostra os dados da conta de outra pessoa.
7. **Avisos do Asaas não ficam para sempre.** A faxina diária apaga o conteúdo dos avisos de pagamento depois de 90 dias (fica só o id, que impede aplicar o mesmo aviso duas vezes) e o aviso inteiro depois de 1 ano. O que vale para a contabilidade fica no pedido.
8. **Backup externo:** a senha da cifra não aparece mais na lista de processos do servidor, e o rclone passou a usar a segunda senha (o "sal"), derivada da mesma `BACKUP_EXTERNO_SENHA`. Restaurar continua precisando só dela (`deploy/backup.sh`).

### Se o único administrador perder o celular e os códigos

No servidor, com acesso ao banco (`docker compose exec db psql -U apto apto_rural`):

```sql
UPDATE usuario SET totp_segredo = NULL, totp_ativado_em = NULL, totp_ultimo_passo = NULL WHERE email = 'seu-email@exemplo.com';
DELETE FROM totp_recuperacao WHERE usuario_id = (SELECT id FROM usuario WHERE email = 'seu-email@exemplo.com');
```

Depois, entre só com a senha e ligue a verificação de novo em Minha conta. Fica o registro: anote no seu controle de incidentes quando e por que fez isso.

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
- [ ] Ativar a **verificação em duas etapas** no GitHub, no Asaas, no provedor de e-mail, no registro do domínio e no servidor, e no próprio Apto Rural (Minha conta), guardando os códigos de recuperação num gerenciador de senhas.
- [ ] No servidor, entrar só por **chave SSH** (sem senha) e liberar no firewall apenas as portas 22, 80 e 443.
- [ ] Configurar a **cópia automática e cifrada dos backups para fora do servidor** e os **alertas de site fora do ar** ([backup-e-vigia.md](backup-e-vigia.md)), guardar a `BACKUP_EXTERNO_SENHA` num gerenciador de senhas e testar uma restauração a partir da cópia de fora.
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
