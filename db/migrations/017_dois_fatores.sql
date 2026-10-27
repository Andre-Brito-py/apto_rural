-- Verificação em duas etapas (TOTP, o código de 6 dígitos do aplicativo autenticador).
-- Obrigatória para administrador e suporte em produção; opcional para as outras contas.
-- Ver docs/seguranca.md.

-- O segredo do autenticador fica cifrado (AES-256-GCM, com a CHAVE_SEGREDOS), nunca em claro.
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS totp_segredo text;
-- NULL = ainda não ativou (o segredo pode estar guardado, esperando o primeiro código certo).
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS totp_ativado_em timestamptz;
-- Último intervalo de 30 s aceito: o mesmo código não vale duas vezes.
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS totp_ultimo_passo bigint;

-- Códigos de recuperação (para quando o celular some): só o SHA-256, cada um vale uma vez.
CREATE TABLE IF NOT EXISTS totp_recuperacao (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid        NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  codigo_hash text        NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  usado_em    timestamptz
);
CREATE INDEX IF NOT EXISTS totp_recuperacao_usuario ON totp_recuperacao (usuario_id);
