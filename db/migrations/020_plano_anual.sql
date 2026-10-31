-- Plano anual (docs/plano-anual.md): uma cobrança por ano, com os créditos do ano inteiro.
-- valor_mensal continua sendo o valor de cada cobrança (no anual, o da anuidade).
ALTER TABLE assinatura ADD COLUMN IF NOT EXISTS ciclo text NOT NULL DEFAULT 'mensal'
  CHECK (ciclo IN ('mensal', 'anual'));
-- Até quando o ano pago vale (anual). Cancelar a renovação mantém o plano até esta data.
ALTER TABLE assinatura ADD COLUMN IF NOT EXISTS valida_ate timestamptz;
ALTER TABLE assinatura ADD COLUMN IF NOT EXISTS renovacao_cancelada_em timestamptz;
CREATE INDEX IF NOT EXISTS assinatura_anual_vencendo ON assinatura (valida_ate)
  WHERE ciclo = 'anual' AND status = 'ativa' AND renovacao_cancelada_em IS NOT NULL;
