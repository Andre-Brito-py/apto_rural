-- Backup fora do servidor e vigia do site (docs/backup-e-vigia.md).

-- Cada execução do backup diário: se o arquivo saiu e se a cópia cifrada chegou
-- ao armazenamento externo. O monitor das 6h avisa se o backup parou de rodar.
CREATE TABLE IF NOT EXISTS backup_execucao (
  id        bigserial PRIMARY KEY,
  quando    timestamptz NOT NULL DEFAULT now(),
  arquivo   text,
  bytes     bigint,
  local_ok  boolean NOT NULL,
  -- ok: cópia cifrada enviada | erro: falhou | desligado: armazenamento externo não configurado
  externo   text NOT NULL CHECK (externo IN ('ok', 'erro', 'desligado')),
  mensagem  text,
  -- O vigia (no monitor) já mandou o sinal deste backup ao serviço de alerta externo?
  sinal_enviado boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS backup_execucao_quando ON backup_execucao (quando DESC);

-- Cada conferência do vigia (o site visto de fora, pelo endereço público).
CREATE TABLE IF NOT EXISTS vigia_verificacao (
  id        bigserial PRIMARY KEY,
  quando    timestamptz NOT NULL DEFAULT now(),
  ok        boolean NOT NULL,
  ms        integer,
  mensagem  text,
  -- O serviço de alerta externo (ex.: healthchecks.io) recebeu o sinal?
  avisado   boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS vigia_verificacao_quando ON vigia_verificacao (quando DESC);

-- Erros do backup e do vigia também vão para o registro (painel e e-mail).
ALTER TABLE erro_registro DROP CONSTRAINT IF EXISTS erro_registro_origem_check;
ALTER TABLE erro_registro ADD CONSTRAINT erro_registro_origem_check
  CHECK (origem IN ('api', 'site', 'monitor', 'coletor', 'backup', 'vigia'));
