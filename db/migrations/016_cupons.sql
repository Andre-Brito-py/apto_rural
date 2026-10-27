-- Cupons de desconto, criados pelo administrador no painel (docs/cupons.md).
-- O desconto vai para o Asaas no valor da cobrança (compra avulsa) ou da assinatura
-- (mensalidade); quando os meses de desconto acabam, a API volta a assinatura ao valor cheio.

CREATE TABLE IF NOT EXISTS cupom (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Sempre em maiúsculas: "bemvindo" e "BEMVINDO" são o mesmo cupom.
  codigo           text        NOT NULL UNIQUE CHECK (codigo ~ '^[A-Z0-9_-]{3,30}$'),
  descricao        text        NOT NULL DEFAULT '',
  tipo             text        NOT NULL CHECK (tipo IN ('percentual', 'fixo')),
  valor            numeric(10, 2) NOT NULL CHECK (valor > 0),
  -- Produtos avulsos e planos em que o cupom vale (ids). Vazio = todos.
  alvos            text[]      NOT NULL DEFAULT '{}',
  -- Assinatura: quantas mensalidades têm desconto. NULL = todas, enquanto a assinatura durar.
  meses            integer     CHECK (meses IS NULL OR meses >= 1),
  -- Usos no total (NULL = sem limite) e por conta.
  limite_usos      integer     CHECK (limite_usos IS NULL OR limite_usos >= 1),
  limite_por_conta integer     NOT NULL DEFAULT 1 CHECK (limite_por_conta >= 1),
  -- Só para quem nunca pagou nada (primeira compra ou assinatura).
  apenas_novos     boolean     NOT NULL DEFAULT false,
  -- Datas de Brasília, inclusive nas duas pontas. NULL = sem limite daquele lado.
  valido_de        date,
  valido_ate       date,
  ativo            boolean     NOT NULL DEFAULT true,
  criado_por       uuid        REFERENCES usuario (id) ON DELETE SET NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  CHECK (tipo <> 'percentual' OR valor <= 100),
  CHECK (valido_de IS NULL OR valido_ate IS NULL OR valido_de <= valido_ate)
);

-- Cada uso do cupom: em um pedido avulso ou em uma assinatura.
-- reservado = cobrança gerada, ainda sem pagamento; usado = pago; liberado = não conta mais
-- (cobrança cancelada, estornada ou assinatura cancelada antes do primeiro pagamento).
CREATE TABLE IF NOT EXISTS cupom_uso (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cupom_id              uuid        NOT NULL REFERENCES cupom (id),
  usuario_id            uuid        NOT NULL REFERENCES usuario (id),
  pedido_id             uuid        REFERENCES pedido (id),
  assinatura_id         uuid        REFERENCES assinatura (id),
  item                  text        NOT NULL,
  nome_item             text        NOT NULL,
  valor_original        numeric(10, 2) NOT NULL,
  valor_final           numeric(10, 2) NOT NULL,
  -- Assinatura: mensalidades com desconto (copiado do cupom no dia da contratação).
  meses                 integer,
  mensalidades_pagas    integer     NOT NULL DEFAULT 0,
  desconto_encerrado_em timestamptz,
  status                text        NOT NULL DEFAULT 'reservado' CHECK (status IN ('reservado', 'usado', 'liberado')),
  criado_em             timestamptz NOT NULL DEFAULT now(),
  usado_em              timestamptz,
  CHECK ((pedido_id IS NULL) <> (assinatura_id IS NULL))
);
CREATE INDEX IF NOT EXISTS cupom_uso_cupom ON cupom_uso (cupom_id, status);
CREATE INDEX IF NOT EXISTS cupom_uso_usuario ON cupom_uso (usuario_id, cupom_id);
CREATE UNIQUE INDEX IF NOT EXISTS cupom_uso_pedido ON cupom_uso (pedido_id) WHERE pedido_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cupom_uso_assinatura ON cupom_uso (assinatura_id) WHERE assinatura_id IS NOT NULL;

-- O que o cliente vê na compra: o código usado e quanto saiu de desconto.
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS cupom_codigo text;
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS desconto numeric(10, 2);
-- Assinatura com cupom: valor_mensal é o que está sendo cobrado agora; valor_cheio, o do plano.
ALTER TABLE assinatura ADD COLUMN IF NOT EXISTS cupom_codigo text;
ALTER TABLE assinatura ADD COLUMN IF NOT EXISTS valor_cheio numeric(10, 2);
