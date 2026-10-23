-- Contas, sessões, créditos de consulta e pagamentos.

CREATE TABLE usuario (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             text        NOT NULL,
  email            text        NOT NULL UNIQUE,   -- sempre em minúsculas
  whatsapp         text,
  profissao        text,
  senha_hash       text        NOT NULL,          -- scrypt
  aceite_termos_em timestamptz NOT NULL,
  -- Cliente no provedor de pagamento. O CPF/CNPJ de cobrança vai direto ao
  -- provedor e não é guardado aqui (LGPD, minimização).
  pagamento_cliente_id text,
  criado_em        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessao (
  token_hash text PRIMARY KEY,                    -- SHA-256 do token do cookie
  usuario_id uuid        NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  criada_em  timestamptz NOT NULL DEFAULT now(),
  expira_em  timestamptz NOT NULL
);
CREATE INDEX sessao_usuario ON sessao (usuario_id);

-- Livro-razão de créditos: saldo = soma das quantidades. Nunca se apaga linha.
-- "referencia" única torna cada lançamento idempotente (ex.: pedido:<id>:consulta).
CREATE TABLE credito_lancamento (
  id         bigserial PRIMARY KEY,
  usuario_id uuid        NOT NULL REFERENCES usuario (id),
  tipo       text        NOT NULL CHECK (tipo IN ('consulta', 'dossie')),
  quantidade integer     NOT NULL CHECK (quantidade <> 0),
  motivo     text        NOT NULL,
  referencia text        UNIQUE,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credito_usuario ON credito_lancamento (usuario_id, tipo);

CREATE TABLE pedido (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   uuid        NOT NULL REFERENCES usuario (id),
  produto      text        NOT NULL,
  valor        numeric(10, 2) NOT NULL,
  status       text        NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'estornado', 'cancelado')),
  provedor     text        NOT NULL,
  provedor_id  text UNIQUE,
  link         text,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  pago_em      timestamptz
);
CREATE INDEX pedido_usuario ON pedido (usuario_id);

-- Eventos de webhook já processados (o provedor entrega "pelo menos uma vez").
CREATE TABLE webhook_evento (
  id          text PRIMARY KEY,
  provedor    text        NOT NULL,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  payload     jsonb       NOT NULL
);

ALTER TABLE consulta
  ADD COLUMN usuario_id uuid REFERENCES usuario (id),
  ADD COLUMN dossie_liberado_em timestamptz;
CREATE INDEX consulta_usuario ON consulta (usuario_id, criada_em DESC);
