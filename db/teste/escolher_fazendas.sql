-- FERRAMENTA DE TESTE: classifica a amostra de imóveis reais do MMA
-- (tabela teste_imovel_mma) pelo que cada um cruza nas bases carregadas.
WITH c AS (
  SELECT t.cod_car, t.uf, t.status_car, t.modulos_fiscais,
    EXISTS (SELECT 1 FROM ibama_embargo e WHERE e.ativo AND ST_Intersects(e.geom, t.geom)) AS embargo,
    EXISTS (SELECT 1 FROM funai_ti f WHERE ST_Intersects(f.geom, t.geom)
              AND (f.fase IN ('Regularizada','Homologada','Encaminhada RI') OR f.modalidade = 'Reserva Indígena')) AS ti,
    EXISTS (SELECT 1 FROM cnuc_uc u WHERE u.grupo = 'Proteção Integral' AND ST_Intersects(u.geom, t.geom)) AS uc_pi,
    EXISTS (SELECT 1 FROM cnuc_uc u WHERE u.grupo = 'Uso Sustentável' AND ST_Intersects(u.geom, t.geom)) AS uc_us,
    EXISTS (SELECT 1 FROM sfb_floresta_tipo_b s WHERE ST_Intersects(s.geom, t.geom)) AS fp_b
  FROM teste_imovel_mma t
)
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE embargo) AS com_embargo,
  count(*) FILTER (WHERE ti) AS com_ti,
  count(*) FILTER (WHERE uc_pi) AS com_uc_protecao_integral,
  count(*) FILTER (WHERE uc_us) AS com_uc_uso_sustentavel,
  count(*) FILTER (WHERE fp_b) AS com_floresta_tipo_b,
  count(*) FILTER (WHERE status_car IN ('SU','CA')) AS car_suspenso_cancelado,
  count(*) FILTER (WHERE NOT (embargo OR ti OR uc_pi OR uc_us OR fp_b) AND status_car = 'AT') AS so_prodes
FROM c;
