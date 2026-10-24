# Conformidade legal

Decisões que protegem o produto e o cliente. Cada uma deve ser revisada por um advogado antes do lançamento.

## O que o Apto Rural é e não é

- **É:** uma pré-checagem que antecipa o que o banco tende a encontrar nas mesmas bases públicas, com a norma e a fonte citadas em cada item.
- **Não é:** aprovação de crédito, laudo técnico, parecer jurídico ou certificado de regularidade ambiental.
- O laudo de sensoriamento remoto do MCR 2-9-18 "d" é de **responsabilidade da instituição financeira**. O dossiê do Apto Rural organiza evidências para o técnico levar ao banco; ele nunca se apresenta como esse laudo.

## Linguagem obrigatória

- Nunca "irregular", "ilegal" ou "desmatamento ilegal" para descrever um imóvel. Usar "consta na lista", "sobreposição encontrada", "impedimento provável".
- Todo resultado mostra: a norma (item do MCR + resolução), a base usada e a **data de atualização** dessa base.
- Quando uma base não foi consultada, o item aparece como **"Não verificado"**, nunca como verde.
- Repetir o aviso do MMA: sobreposição com o Prodes não é, por si só, presunção de ilegalidade.

## Dados pessoais (LGPD)

- CPF/CNPJ só é usado para o item 2-9-4 (cadastro de empregadores do MTE) e só com a marcação de que o produtor autorizou a consulta.
- O documento é guardado apenas como hash (SHA-256 com chave secreta) no histórico; o número em claro não é armazenado.
- Base legal, termo de uso e política de privacidade: **A CONFIRMAR com advogado**.

## Direitos do titular (baixar dados e excluir a conta)

A LGPD garante a quem tem conta, a qualquer momento e sem custo, o acesso aos dados, a portabilidade e a eliminação (art. 18, II, V e VI). Os dados devem ser eliminados quando o tratamento termina, mas podem ser guardados para cumprir obrigação legal (art. 16, I). O acesso pode ser dado na hora, em formato simplificado (art. 19, I). Fonte: [Lei 13.709/2018, no Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm); resumo da ANPD em [Direito dos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares).

Como o Apto Rural atende, pela tela **Minha conta**:

| Pedido | O que acontece |
| --- | --- |
| **Baixar meus dados** | Arquivo JSON na hora, com conta, créditos, compras, assinaturas, consultas, carteira, avisos e sessões abertas. Não inclui a senha nem chaves de acesso (são de segurança, não dados da pessoa). No modo "entrar como", o suporte não consegue baixar. |
| **Excluir minha conta** | Pede a senha de novo e uma confirmação. Cancela a assinatura no Asaas antes de tudo (se falhar, nada é apagado). Depois apaga nome, e-mail, WhatsApp, profissão, senha, carteira, avisos, sessões e links de e-mail, e manda um comprovante para o e-mail antigo. |

O que **fica guardado** e por quê:

- **Compras e créditos** (valor, data, situação), ligados a uma conta sem nenhum dado pessoal. Motivo: os comprovantes das operações devem ser conservados até a prescrição dos tributos (Código Tributário Nacional, art. 195, parágrafo único, como lido no [Parecer PGFN nº 177/1993](https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?visao=anotado&idAto=31062)). O Asaas guarda os dados de cobrança por conta própria.
- **Relatórios já emitidos** (CAR, mapa e resultado), sem dono e sem o código do CPF/CNPJ do produtor, para que o QR que foi ao banco continue abrindo. Os dados são do imóvel, não da pessoa que consultou.
- **Código irreversível do e-mail** (HMAC) da conta excluída, para que a mesma pessoa não apague e recrie a conta só para ganhar a amostra grátis de novo (prevenção a fraude).
- **Registros de acesso do servidor** (logs da API) seguem o seu próprio prazo. O Marco Civil da Internet manda o provedor de aplicações que é pessoa jurídica guardar os registros de acesso por 6 meses (art. 15; texto em [Pensando o Direito/MJ](https://pensando.mj.gov.br/marcocivil/tema/registros-de-acesso/)).

**A CONFIRMAR com advogado:** o prazo exato de guarda das compras, se guardar os relatórios sem dono e o código do e-mail está coberto pelas bases legais acima, e o canal do encarregado (art. 41) para pedidos que não passam pela tela (correção de dados, informação sobre compartilhamento etc.).

## Acesso administrativo aos dados dos clientes

- O "entrar como" mostra os dados do cliente a quem tem papel de suporte ou administrador. É só leitura, dura até 1 hora e fica registrado na auditoria.
- A política de privacidade precisa dizer que a equipe pode acessar a conta para suporte (**A CONFIRMAR** com advogado, junto com o prazo de guarda da auditoria e dos registros de erro).
- Registros de erro nunca guardam o corpo das requisições (que pode ter CPF/CNPJ): só rota, mensagem e pilha técnica.

## Equipes (plano Escritório)

- Na equipe, o responsável e os administradores veem **nome, e-mail, papel e quantas consultas cada pessoa fez no mês**. Técnicos veem só nomes e papéis. Isso precisa constar na política de privacidade (**A CONFIRMAR** com advogado).
- O convite guarda o e-mail convidado até ser aceito, cancelado ou vencer. Ao excluir a conta, os convites para aquele e-mail são apagados.
- A conta e os dados continuam sendo de cada pessoa: cada membro baixa os próprios dados e exclui a própria conta. Ao sair da equipe, volta a usar só a própria conta.
- As consultas feitas por um membro ficam ligadas a ele (não ao responsável); o crédito gasto fica no extrato do responsável com a indicação de quem usou.

## Coleta de dados públicos

- **Sicar:** o download da consulta pública é protegido por captcha e a licença não é declarada. O Apto Rural **não contorna captcha**. No MVP, o imóvel entra pelo arquivo que o técnico já tem (shapefile, KML ou GeoJSON exportado do CAR) e a situação do CAR é informada a partir do demonstrativo. Acesso automatizado ao Sicar só com autorização ou convênio com o SFB.
- Para cada base: conferir licença e exigência de citação antes de vender (ver `fontes-oficiais.md`).
- **Mapa do resultado e do dossiê:** mostra recortes dessas mesmas bases públicas em volta do imóvel, sempre com a citação dos órgãos (Ibama, Funai, MMA/CNUC, Incra, SFB) e a data da consulta, e com o aviso de que o desenho é simplificado e os limites oficiais são os de cada órgão. A conferência de licença acima vale também para esse uso. O mapa não tem dado pessoal: só o contorno enviado pelo técnico e áreas públicas.
- Os coletores registram a URL, a data do download e o hash de cada arquivo, para provar a origem de cada resultado.

## Critérios do produto (não estão na norma)

Cada um aparece no código com comentário e deve ser revisado por advogado:

- **Sobreposição de borda** abaixo de 0,1 ha sai como "Atenção", não "Impedimento". A norma não prevê tolerância; o texto avisa isso ao técnico.
- **UC de Uso Sustentável** (APA, ARIE, RDS…) sai como "Atenção": o item 5 ressalva atividade conforme o Plano de Manejo. **Proteção Integral** sai como "Impedimento".
- **Terra indígena "Encaminhada RI"** conta como homologada (o registro em cartório é etapa posterior à homologação). A modalidade "Reserva Indígena" impede em qualquer fase.
- **Embargo sem data** usa o limite mais restritivo do item 12-"h" (5% ou 20 ha). O Ibama publica a data do termo, não a da notificação: o texto pede para conferir no processo.
- **CNPJ** é procurado também pela raiz (8 dígitos) no cadastro do MTE, porque o item 4 alcança a pessoa jurídica.
- **Conexões TLS** usam o repositório de certificados do sistema (`truststore`); a verificação nunca é desligada.

## Regras mudam

- As regras ficam em `packages/regras` como configuração, cada uma com o ato que a criou. Mudou uma resolução: atualizar a regra, os testes e `fontes-oficiais.md` no mesmo commit.
- Normas em disputa (PDL 262/2026, ações no STF) devem ser acompanhadas.
