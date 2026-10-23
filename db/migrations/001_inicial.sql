-- Apto Rural — esquema inicial.
-- Geometrias em SIRGAS 2000 (EPSG:4674), o referencial oficial do Brasil.
-- Áreas calculadas com geography, em hectares.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Proveniência: cada carga de base pública fica registrada (URL, data, hash).
CREATE TABLE fonte_carga (
  id            bigserial PRIMARY KEY,
  fonte_id      text        NOT NULL,
  url           text        NOT NULL,
  baixado_em    timestamptz NOT NULL DEFAULT now(),
  -- Data de referência informada pelo próprio órgão, quando houver.
  referencia_em date,
  sha256        text        NOT NULL,
  registros     integer     NOT NULL,
  ativa         boolean     NOT NULL DEFAULT false
);
CREATE INDEX fonte_carga_ativa ON fonte_carga (fonte_id) WHERE ativa;

-- MCR 2-9-17: lista do MMA (BiomasBR / Prodes), chave = código do CAR.
-- Campos conforme a Nota Explicativa do MMA (27/03/2026).
CREATE TABLE mma_lista_mcr (
  cod_car           text PRIMARY KEY,           -- cod_imovel
  status_car        text,                       -- status_imo: AT, PE, SU, CA
  condicao          text,                       -- condicao
  modulos_fiscais   numeric,                    -- m_fiscal
  area_supressao_ha numeric,                    -- soma_desmat (após 31/7/2019)
  acima_criterio    boolean,                    -- dentro_criterio = 'Não'
  criterio          text,                       -- criterio_aplicado
  bioma             text,                       -- biomas
  resultados        text,                       -- resultados
  carga_id          bigint REFERENCES fonte_carga (id)
);

-- MCR 2-9-10: termos de embargo do Ibama. Sem nome nem CPF/CNPJ do autuado:
-- o produto não precisa desses dados pessoais (LGPD, minimização).
CREATE TABLE ibama_embargo (
  seq               text PRIMARY KEY,           -- SEQ_TAD
  numero            text NOT NULL,              -- NUM_TAD (+ SER_TAD)
  data_embargo      date,                       -- DAT_EMBARGO (datas impossíveis viram NULL)
  area_ha           numeric,                    -- QTD_AREA_EMBARGADA
  descricao         text,                       -- DES_TAD
  ativo             boolean NOT NULL,           -- não cancelado e sem desembargo
  geom              geometry (Geometry, 4674),  -- GEOM_AREA_EMBARGADA ou ponto do termo
  carga_id          bigint REFERENCES fonte_carga (id)
);
CREATE INDEX ibama_embargo_geom ON ibama_embargo USING gist (geom) WHERE ativo;

-- MCR 2-9-5: Unidades de Conservação (CNUC).
CREATE TABLE cnuc_uc (
  id           text PRIMARY KEY,               -- cd_cnuc
  nome         text NOT NULL,                  -- nome_uc
  categoria    text NOT NULL,                  -- categoria
  grupo        text,                           -- grupo: Proteção Integral / Uso Sustentável
  plano_manejo text,                           -- pl_manejo
  esfera       text,
  geom      geometry (MultiPolygon, 4674) NOT NULL,
  carga_id  bigint REFERENCES fonte_carga (id)
);
CREATE INDEX cnuc_uc_geom ON cnuc_uc USING gist (geom);

-- MCR 2-9-7: terras indígenas (Funai), com a fase do processo.
CREATE TABLE funai_ti (
  id         text PRIMARY KEY,                 -- gid
  nome       text NOT NULL,                    -- terrai_nome
  fase       text NOT NULL,                    -- fase_ti
  modalidade text,                             -- modalidade_ti
  geom     geometry (MultiPolygon, 4674) NOT NULL,
  carga_id bigint REFERENCES fonte_carga (id)
);
CREATE INDEX funai_ti_geom ON funai_ti USING gist (geom);

-- MCR 2-9-8: territórios quilombolas titulados (Incra).
CREATE TABLE incra_quilombola (
  id       text PRIMARY KEY,
  nome     text NOT NULL,
  geom     geometry (MultiPolygon, 4674) NOT NULL,
  carga_id bigint REFERENCES fonte_carga (id)
);
CREATE INDEX incra_quilombola_geom ON incra_quilombola USING gist (geom);

-- MCR 2-9-14: florestas públicas Tipo B (CNFP / SFB).
CREATE TABLE sfb_floresta_tipo_b (
  id       text PRIMARY KEY,
  nome     text NOT NULL,
  geom     geometry (MultiPolygon, 4674) NOT NULL,
  carga_id bigint REFERENCES fonte_carga (id)
);
CREATE INDEX sfb_floresta_tipo_b_geom ON sfb_floresta_tipo_b USING gist (geom);

-- MCR 2-9-4: cadastro de empregadores do MTE. Só o hash do documento (LGPD):
-- HMAC do CPF, do CNPJ e da raiz do CNPJ (8 dígitos, a pessoa jurídica).
CREATE TABLE mte_empregador (
  documento_hash text PRIMARY KEY,
  carga_id       bigint REFERENCES fonte_carga (id)
);

-- Histórico de consultas: guarda o que foi encontrado e o resultado,
-- para que cada relatório possa ser verificado depois (código QR).
CREATE TABLE consulta (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_car         text        NOT NULL,
  criada_em       timestamptz NOT NULL DEFAULT now(),
  data_referencia date        NOT NULL,
  documento_hash  text,
  geom            geometry (MultiPolygon, 4674),
  evidencias      jsonb       NOT NULL,
  resultado       jsonb       NOT NULL
);
CREATE INDEX consulta_car ON consulta (cod_car);
