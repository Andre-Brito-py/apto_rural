-- Configurações editáveis pelo painel (preços, limites, aviso no site)
-- e estorno/cancelamento de pedidos.

CREATE TABLE IF NOT EXISTS configuracao (
  chave          text PRIMARY KEY,
  valor          jsonb       NOT NULL,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid        REFERENCES usuario (id) ON DELETE SET NULL
);

-- Créditos do pacote fixados no momento da compra: mudar o pacote depois
-- não altera o que o cliente já comprou.
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS creditos_consulta integer;
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS creditos_dossie integer;
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS nome_produto text;
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS motivo_estorno text;
