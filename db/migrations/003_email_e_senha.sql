-- Confirmação de e-mail e recuperação de senha.

ALTER TABLE usuario ADD COLUMN IF NOT EXISTS email_confirmado_em timestamptz;

-- Tokens enviados por e-mail. Só o SHA-256 fica guardado; cada token vale uma vez.
CREATE TABLE IF NOT EXISTS token_email (
  token_hash text PRIMARY KEY,
  usuario_id uuid        NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  tipo       text        NOT NULL CHECK (tipo IN ('confirmacao', 'senha')),
  criado_em  timestamptz NOT NULL DEFAULT now(),
  expira_em  timestamptz NOT NULL,
  usado_em   timestamptz
);
CREATE INDEX IF NOT EXISTS token_email_usuario ON token_email (usuario_id, tipo);
