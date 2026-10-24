-- Módulo fiscal de cada município (Incra), em hectares. Usado para estimar os
-- módulos fiscais do imóvel (área do contorno ÷ módulo fiscal do município)
-- quando o técnico não informa o número e o CAR não está na lista do MMA.
--
-- Base legal: Lei 6.746/1979 (art. 50 do Estatuto da Terra) e Decreto 84.685/1980,
-- art. 4º (o Incra fixa o módulo fiscal de cada município por Instrução Especial).
-- Valores em vigor: Instrução Especial Incra nº 5/2022 (Anexo IV) e IE nº 6/2025.
-- Arquivo oficial usado: "Índices Básicos de 2013" (gov.br/incra), conferido contra
-- a planilha da IE 5/2022 e contra a lista do MMA (ver docs/fontes-oficiais.md).
CREATE TABLE IF NOT EXISTS incra_modulo_fiscal (
  cod_ibge         text PRIMARY KEY,           -- código do município no IBGE (7 dígitos, o mesmo do CAR)
  municipio        text NOT NULL,
  modulo_fiscal_ha numeric NOT NULL CHECK (modulo_fiscal_ha > 0),
  carga_id         bigint REFERENCES fonte_carga (id)
);
