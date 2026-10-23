-- Papéis, bloqueio de contas, auditoria e "entrar como" (personificação).

-- usuario: cliente comum; suporte: vê o painel e entra como (só leitura);
-- admin: tudo. Os e-mails de ADMIN_EMAILS são sempre admin (para o primeiro acesso).
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS papel text NOT NULL DEFAULT 'usuario'
  CHECK (papel IN ('usuario', 'suporte', 'admin'));
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS bloqueado_em timestamptz;
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS bloqueio_motivo text;

-- Sessão aberta por um administrador "entrando como" o usuário: só leitura.
ALTER TABLE sessao ADD COLUMN IF NOT EXISTS personificado_por uuid REFERENCES usuario (id) ON DELETE CASCADE;

-- Toda ação administrativa: quem, o quê, em quem, quando.
CREATE TABLE IF NOT EXISTS auditoria_admin (
  id              bigserial PRIMARY KEY,
  quando          timestamptz NOT NULL DEFAULT now(),
  admin_id        uuid        NOT NULL REFERENCES usuario (id),
  acao            text        NOT NULL,
  alvo_usuario_id uuid        REFERENCES usuario (id) ON DELETE SET NULL,
  detalhes        jsonb       NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS auditoria_quando ON auditoria_admin (quando DESC);
CREATE INDEX IF NOT EXISTS auditoria_alvo ON auditoria_admin (alvo_usuario_id, quando DESC);
