# Arquitetura

```
 Bases oficiais (MMA, Ibama, MMA/CNUC, Funai, Incra, SFB, MTE)
        │  coletores Python, agendados (proveniência: URL, data, SHA-256)
        ▼
 PostgreSQL + PostGIS ──► API (Fastify) ──► motor de regras (@apto/regras)
                              ▲
              site (React) ───┤
       robô de WhatsApp (futuro) ┘   cooperativas via chave de API (futuro)
```

## Princípios

1. **Evidência separada de julgamento.** A API só coleta o que as bases dizem (`Evidencias`). O pacote `@apto/regras` julga, sem banco e sem rede, então é testável e auditável linha a linha.
2. **Ausência de dado nunca é verde.** Base não carregada, contorno não enviado ou CPF não autorizado: o item sai "Não verificado".
3. **Datas pelo fuso de Brasília.** Os prazos do MCR (4/1/2027, 1/7/2027, 3/1/2028, 30/6/2027) são comparados com a data de hoje em `America/Sao_Paulo`.
4. **Proveniência.** Toda carga registra URL, data e hash em `fonte_carga`; cada resultado mostra a data da base usada.
5. **Consulta guardada.** Evidências e resultado ficam em `consulta`, para o código QR do relatório apontar para a versão original.

## Por que o contorno do imóvel vem do técnico

O download da consulta pública do Sicar é protegido por captcha e não declara licença (ver `conformidade-legal.md`). O técnico já tem o arquivo do CAR do cliente; no MVP ele o envia em KML ou GeoJSON. A lista do MMA, por sua vez, é consultada pelo código do CAR e já traz situação e módulos fiscais.
