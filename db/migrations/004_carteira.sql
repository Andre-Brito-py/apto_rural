-- Carteira: imóveis que o técnico acompanha, reconferidos todo dia pelo monitor.

CREATE TABLE IF NOT EXISTS imovel_monitorado (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id         uuid        NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  cod_car            text        NOT NULL,
  apelido            text,
  -- Dados da consulta de origem, reaproveitados a cada reconferência.
  situacao_car       text,
  modulos_fiscais    numeric,
  uso_coletivo       boolean     NOT NULL DEFAULT false,
  geojson            jsonb,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  verificado_em      timestamptz NOT NULL DEFAULT now(),
  -- Último resultado e a consulta que o guarda (para abrir resultado e dossiê).
  resultado          jsonb       NOT NULL,
  ultima_consulta_id uuid        REFERENCES consulta (id),
  UNIQUE (usuario_id, cod_car)
);

CREATE TABLE IF NOT EXISTS aviso (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid        NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  imovel_id   uuid        NOT NULL REFERENCES imovel_monitorado (id) ON DELETE CASCADE,
  consulta_id uuid        REFERENCES consulta (id),
  alteracoes  jsonb       NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  lido_em     timestamptz,
  emailado_em timestamptz
);
CREATE INDEX IF NOT EXISTS aviso_usuario ON aviso (usuario_id, criado_em DESC);
