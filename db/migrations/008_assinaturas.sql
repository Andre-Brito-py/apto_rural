-- Assinatura mensal: créditos todo mês e carteira por plano.

CREATE TABLE IF NOT EXISTS assinatura (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id        uuid        NOT NULL REFERENCES usuario (id),
  plano_id          text        NOT NULL,
  -- Condições fixadas na contratação: mudar o plano depois não muda quem já assina.
  nome_plano        text        NOT NULL,
  valor_mensal      numeric(10, 2) NOT NULL,
  creditos_consulta integer     NOT NULL,
  creditos_dossie   integer     NOT NULL,
  limite_carteira   integer     NOT NULL,
  status            text        NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente', 'ativa', 'inadimplente', 'cancelada')),
  provedor          text        NOT NULL,
  provedor_id       text UNIQUE,
  link              text,
  criada_em         timestamptz NOT NULL DEFAULT now(),
  ativada_em        timestamptz,
  cancelada_em      timestamptz
);
-- No máximo uma assinatura em andamento por conta.
CREATE UNIQUE INDEX IF NOT EXISTS assinatura_uma_por_usuario
  ON assinatura (usuario_id) WHERE status IN ('pendente', 'ativa', 'inadimplente');

-- Cada mensalidade vira um pedido ligado à assinatura (mesma lógica de crédito e estorno).
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS assinatura_id uuid REFERENCES assinatura (id);
