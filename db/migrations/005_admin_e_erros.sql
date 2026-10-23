-- Monitoramento: erros registrados e conferência das bases oficiais.

-- Erros de qualquer parte do sistema. Nunca guarda corpo de requisição
-- (pode ter CPF): só rota, mensagem e pilha.
CREATE TABLE IF NOT EXISTS erro_registro (
  id         bigserial PRIMARY KEY,
  quando     timestamptz NOT NULL DEFAULT now(),
  origem     text        NOT NULL CHECK (origem IN ('api', 'site', 'monitor', 'coletor')),
  mensagem   text        NOT NULL,
  detalhe    text,
  rota       text,
  usuario_id uuid REFERENCES usuario (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS erro_registro_quando ON erro_registro (quando DESC);

-- Última vez que o coletor conferiu a fonte oficial, mesmo quando o arquivo
-- não mudou (aí ele não recarrega, mas a base continua em dia).
ALTER TABLE fonte_carga ADD COLUMN IF NOT EXISTS conferido_em timestamptz;
UPDATE fonte_carga SET conferido_em = baixado_em WHERE conferido_em IS NULL;
