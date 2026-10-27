-- Funções de apoio por IA (docs/ia.md): leitura do recibo do CAR, conferência de documentos
-- do dossiê, rascunhos de requerimento e carta, frase do e-mail da carteira e análise de
-- norma nova para o administrador. A IA nunca decide o semáforo: ajuda o técnico.

-- Uso por função, para o painel mostrar onde está o gasto.
ALTER TABLE ia_uso ADD COLUMN IF NOT EXISTS tarefa text NOT NULL DEFAULT 'explicacao';

-- O que a IA produziu para uma consulta: documentos conferidos e rascunhos. Só o resultado
-- (campos lidos, pontos a conferir, texto do rascunho); o arquivo enviado não fica guardado.
CREATE TABLE IF NOT EXISTS consulta_apoio (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id uuid        NOT NULL REFERENCES consulta (id) ON DELETE CASCADE,
  tipo        text        NOT NULL CHECK (tipo IN ('documento', 'rascunho')),
  regra_id    text        NOT NULL,
  dados       jsonb       NOT NULL,
  criado_por  uuid        REFERENCES usuario (id) ON DELETE SET NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consulta_apoio_consulta ON consulta_apoio (consulta_id, criado_em);

-- Análises de normas novas (resolução do CMN, mudança no MCR) feitas no painel. Quem muda
-- as regras do sistema é sempre uma pessoa, depois de ler a análise.
CREATE TABLE IF NOT EXISTS analise_norma (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo     text        NOT NULL,
  analise    jsonb       NOT NULL,
  criado_por uuid        REFERENCES usuario (id) ON DELETE SET NULL,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
