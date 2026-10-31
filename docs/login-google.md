# Entrar com a conta Google

O botão **"Continuar com o Google"** aparece em **Entrar** e em **Criar conta**. A pessoa escolhe a conta Google e pronto: não precisa inventar senha nem confirmar o e-mail.

O botão só aparece depois que você cadastra o **ID do cliente** (passo a passo abaixo). Sem ele, o site funciona normalmente com e-mail e senha.

Fonte oficial usada: documentação do Google Identity Services, em [verificar o ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token) e [configurar o ID do cliente](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid). Conferida em 30/10/2026.

## Como funciona, em palavras simples

1. A pessoa toca no botão. A janela de escolha da conta é do próprio Google: **o Apto Rural nunca vê a senha do Google**.
2. O Google entrega ao site um "crachá" assinado (o *ID token*), com o nome, o e-mail e um código fixo da conta Google.
3. A API confere o crachá, como o Google manda:
   - a **assinatura**, com as chaves públicas do Google;
   - o **destinatário**: o crachá foi feito para o Apto Rural, e não para outro site;
   - o **emissor**: `accounts.google.com`;
   - a **validade**: o crachá não venceu.
4. Com o crachá certo, há três casos:

| Caso | O que acontece |
| --- | --- |
| A conta Google já está ligada a uma conta do Apto Rural | Entra. |
| Já existe conta com o mesmo e-mail | Liga a conta Google a ela. Se o e-mail **não** é Gmail nem de empresa no Google Workspace, pede a senha da conta uma vez antes (veja abaixo). |
| E-mail novo | Pede o **aceite dos termos** e cria a conta, já com o e-mail confirmado e a consulta grátis. |

**Por que às vezes pede a senha?** O Google só garante que o e-mail é da pessoa quando ele é **@gmail.com** ou de uma empresa no **Google Workspace**. Com outro e-mail (por exemplo, @hotmail.com cadastrado numa conta Google), alguém poderia criar uma conta Google com o e-mail de outra pessoa. Por isso, para ligar o Google a uma conta que já tem senha, a senha dela é pedida uma vez.

**Outras regras:**
- A conta é reconhecida pelo **código fixo do Google** (`sub`), não pelo e-mail, como o Google recomenda: o e-mail de uma conta Google pode mudar.
- E-mail **não verificado** pelo Google: recusado. A pessoa entra com e-mail e senha.
- **Verificação em duas etapas:** quem ligou digita o código também ao entrar pelo Google.
- **Conta bloqueada** não entra.
- **Conta criada pelo Google não tem senha.** Para excluir a conta ou ligar a verificação em duas etapas, a pessoa cria uma senha em **Minha conta → "Criar uma senha"** (manda o mesmo link de "Esqueci minha senha").

## Passo a passo: criar o ID do cliente (grátis, uma vez só)

1. Entre em [console.cloud.google.com](https://console.cloud.google.com) com a conta Google da empresa e crie um projeto (ex.: "Apto Rural").
2. No menu, abra **Google Auth Platform** (a tela de consentimento) e preencha **Branding** (os nomes das seções podem aparecer em português ou em inglês):
   - nome do app: "Apto Rural";
   - e-mail de suporte;
   - logotipo (opcional);
   - página inicial: `https://seu-dominio`;
   - política de privacidade: `https://seu-dominio/privacidade`;
   - termos de uso: `https://seu-dominio/termos`;
   - domínio autorizado: o seu domínio.
3. Em **Público-alvo** (*Audience*), escolha **Externo**.
4. Em **Acesso a dados** (*Data Access*), deixe só o padrão (`openid`, `email`, `profile`). Não peça mais nada: o Apto Rural não precisa.
5. Em **Clientes** (*Clients*), crie um cliente do tipo **Aplicativo da Web**:
   - **Origens JavaScript autorizadas:** `https://seu-dominio`;
   - para testar no seu computador, também `http://localhost` e `http://localhost:5180`.
6. Copie o **ID do cliente**. Ele termina em `.apps.googleusercontent.com`. Não é segredo: ele aparece no site.
7. No Apto Rural, abra **Painel → Preços e limites → "Entrar com a conta Google"**, cole o ID e clique em **Salvar**. O botão aparece em até 30 segundos.

Também dá para definir o ID pela variável `GOOGLE_CLIENT_ID` do servidor. O que for salvo no painel vale mais.

**Para esconder o botão:** apague o ID no painel e salve.

**Testando no computador (http://localhost):** o Google pede `Referrer-Policy: no-referrer-when-downgrade` nesse caso. Se o botão não abrir a janela no teste local, teste no domínio com HTTPS.

## Segurança do site

A política de segurança do navegador (`deploy/cabecalhos.caddy`) libera só os endereços que o Google indica para o botão:

| O que | Endereço liberado |
| --- | --- |
| Script | `https://accounts.google.com/gsi/client` |
| Estilo | `https://accounts.google.com/gsi/style` |
| Moldura e conexões | `https://accounts.google.com/gsi/` |

O `Cross-Origin-Opener-Policy` passou a `same-origin-allow-popups`, para a janela de escolha da conta conseguir avisar o site.

## Onde fica cada coisa

| Arquivo | O que tem |
| --- | --- |
| `apps/api/src/contas/google.ts` | Conferência do ID token (biblioteca `jose`): assinatura, destinatário, emissor e validade. |
| `apps/api/src/rotas/contas.ts` | `POST /v1/sessao/google`: entra, liga ou cria a conta. |
| `db/migrations/019_google.sql` | Coluna `usuario.google_sub` (única); senha passa a ser opcional. |
| `apps/web/src/componentes/BotaoGoogle.tsx` | O botão do Google na tela. |
| `apps/web/src/paginas/Entrar.tsx` | O passo a mais, quando falta o aceite, a senha ou o código. |
| `apps/web/src/paginas/ConfiguracoesPainel.tsx` | O campo do ID do cliente no painel. |

## LGPD

- Do Google, o site guarda só o **nome**, o **e-mail** e o **código fixo da conta**. A política de privacidade (`/privacidade`) diz isso.
- Na exclusão da conta, a ligação com o Google é apagada.
- O "baixar meus dados" informa se a conta entra pelo Google.

## Testes

| Onde | O que confere |
| --- | --- |
| `apps/api/test/google.test.ts` | O crachá certo passa; assinatura falsa, outro destinatário, outro emissor e crachá vencido são recusados. Também os três casos, o pedido da senha, o e-mail não verificado, a verificação em duas etapas e a conta bloqueada. |
| `apps/e2e/testes/google.spec.ts` | No navegador, com um **Google falso** (`apps/e2e/servidor.mjs` serve chaves e crachás de teste): o administrador liga pelo painel, uma conta nova é criada pelo Google e uma conta com senha é ligada. |

O endereço das chaves de teste (`GOOGLE_CERTS_URL`) é recusado em produção: lá vale sempre o do Google.
