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

## Acesso administrativo aos dados dos clientes

- O "entrar como" mostra os dados do cliente a quem tem papel de suporte ou administrador. É só leitura, dura até 1 hora e fica registrado na auditoria.
- A política de privacidade precisa dizer que a equipe pode acessar a conta para suporte (**A CONFIRMAR** com advogado, junto com o prazo de guarda da auditoria e dos registros de erro).
- Registros de erro nunca guardam o corpo das requisições (que pode ter CPF/CNPJ): só rota, mensagem e pilha técnica.

## Coleta de dados públicos

- **Sicar:** o download da consulta pública é protegido por captcha e a licença não é declarada. O Apto Rural **não contorna captcha**. No MVP, o imóvel entra pelo arquivo que o técnico já tem (GeoJSON/KML exportado do CAR) e a situação do CAR é informada a partir do demonstrativo. Acesso automatizado ao Sicar só com autorização ou convênio com o SFB.
- Para cada base: conferir licença e exigência de citação antes de vender (ver `fontes-oficiais.md`).
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
