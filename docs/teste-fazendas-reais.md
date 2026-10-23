# Teste com fazendas reais — 23/10/2026

Primeiro teste de ponta a ponta com as seis bases oficiais carregadas no PostGIS e imóveis reais.

## Bases carregadas

| Base | Registros | Data de referência |
| --- | --- | --- |
| Lista MCR do MMA (Prodes) | 106.024 imóveis | 21/09/2026 |
| Termos de embargo do Ibama | 116.925 termos (89.994 ativos) | download de 23/10/2026 (atualização diária) |
| CNUC (MMA) | 3.121 UCs | edição 2025_08 |
| Terras indígenas (Funai) | 665 | 15/10/2026 |
| Florestas públicas Tipo B (SFB) | 1.742 | item modificado em 23/07/2026 |
| Cadastro de empregadores (MTE) | 661 códigos (335 CPFs, 163 CNPJs + raízes) | 06/10/2026 |

Quilombolas titulados: sem fonte aberta (item sai "Não verificado").

## Amostra

4.000 imóveis reais da lista do MMA (2.000 do Cerrado em MT e 2.000 da Amazônia no PA), com contorno baixado do serviço ArcGIS do próprio MMA (`labdez.mma.gov.br`, camadas do painel oficial). Cruzamentos na amostra:

| Caso | Imóveis |
| --- | --- |
| Embargo ativo do Ibama | 1.103 |
| Floresta pública Tipo B | 1.126 (219 só de borda; 462 com metade ou mais do imóvel) |
| CAR suspenso ou cancelado | 1.493 |
| UC de Uso Sustentável | 493 |
| UC de Proteção Integral | 80 |
| Terra indígena com fase impeditiva | 82 |
| Nenhuma sobreposição (só Prodes) | 1.270 |

## Resultado

`apps/api/scripts/testar-fazendas-reais.ts` consultou 3 imóveis de cada caso pela API, como o site faz, e conferiu o resultado contra o banco: **24 consultas, 0 divergências**. Tempo por consulta: mediana 73 ms, p90 211 ms, máximo 221 ms.

## Problemas encontrados e corrigidos

1. **Embargo do vizinho na divisa.** Em Jangada/MT, o polígono embargado da fazenda vizinha encostava no imóvel por 0,01 ha e o motor marcava "Impedimento". Agora sobreposição de embargo abaixo de 0,1 ha sai como "Atenção", como já acontecia com as outras camadas.
2. **Polígono oficial inválido no Ibama.** Um termo tem anel não fechado e derrubava a carga inteira. A carga agora é termo a termo; o que não tem conserto fica com o ponto do termo.
3. **Datas de referência.** CNUC, Funai e CNFP passaram a gravar a data informada pelo órgão, não a do download.
4. **Porta do banco.** Esta máquina já tem um PostgreSQL 18 na porta 5432; o PostGIS do projeto usa a 5433.

## Como repetir

```bash
docker compose up -d
cd coletores
python -m coletores.amostra_mma --bioma cerrado --uf MT --limite 2000
cd ../apps/api
npx tsx --env-file=../../.env scripts/testar-fazendas-reais.ts
```
