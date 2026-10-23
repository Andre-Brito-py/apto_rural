-- Equipes (plano Escritório): várias pessoas usando os mesmos créditos e a mesma carteira.
--
-- O responsável é quem paga: créditos, assinatura, carteira e avisos continuam
-- na conta dele. Os membros entram por convite e passam a usar a conta dele.

CREATE TABLE IF NOT EXISTS equipe (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dono_id   uuid        NOT NULL UNIQUE REFERENCES usuario (id) ON DELETE CASCADE,
  criada_em timestamptz NOT NULL DEFAULT now()
);

-- Uma pessoa está em no máximo uma equipe (usuario_id único).
CREATE TABLE IF NOT EXISTS equipe_membro (
  equipe_id  uuid        NOT NULL REFERENCES equipe (id) ON DELETE CASCADE,
  usuario_id uuid        NOT NULL UNIQUE REFERENCES usuario (id) ON DELETE CASCADE,
  papel      text        NOT NULL CHECK (papel IN ('administrador', 'tecnico')),
  entrou_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (equipe_id, usuario_id)
);

-- Convite por e-mail: no banco fica só o SHA-256 do token do link.
CREATE TABLE IF NOT EXISTS convite_equipe (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    text        NOT NULL UNIQUE,
  equipe_id     uuid        NOT NULL REFERENCES equipe (id) ON DELETE CASCADE,
  email         text        NOT NULL,               -- sempre em minúsculas
  papel         text        NOT NULL CHECK (papel IN ('administrador', 'tecnico')),
  convidado_por uuid        REFERENCES usuario (id) ON DELETE SET NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  expira_em     timestamptz NOT NULL,
  aceito_em     timestamptz,
  cancelado_em  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS convite_pendente_unico
  ON convite_equipe (equipe_id, email) WHERE aceito_em IS NULL AND cancelado_em IS NULL;

-- Quantas pessoas o plano permite (fixado na contratação, como a carteira).
ALTER TABLE assinatura ADD COLUMN IF NOT EXISTS limite_membros integer NOT NULL DEFAULT 1;
-- Assinaturas do Escritório feitas antes das equipes ganham o padrão do plano (5 pessoas).
UPDATE assinatura SET limite_membros = 5 WHERE plano_id = 'plano-escritorio' AND limite_membros = 1;

-- Quem da equipe gastou o crédito (o lançamento é da conta do responsável).
ALTER TABLE credito_lancamento ADD COLUMN IF NOT EXISTS autor_id uuid REFERENCES usuario (id) ON DELETE SET NULL;
