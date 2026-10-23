-- FERRAMENTA DE TESTE: tamanho das sobreposições com floresta Tipo B na amostra.
WITH s AS (
  SELECT t.cod_car,
         sum(ST_Area(ST_Intersection(f.geom, t.geom)::geography)) / 10000 AS ha,
         max(t.area_ha) AS area_imovel
    FROM teste_imovel_mma t JOIN sfb_floresta_tipo_b f ON ST_Intersects(f.geom, t.geom)
   GROUP BY t.cod_car
)
SELECT count(*) AS imoveis,
       count(*) FILTER (WHERE ha < 0.1) AS borda_menos_0_1ha,
       count(*) FILTER (WHERE ha >= 0.1 AND ha < 1) AS de_0_1_a_1ha,
       count(*) FILTER (WHERE ha / nullif(area_imovel, 0) >= 0.5) AS metade_ou_mais_do_imovel,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY ha)::numeric, 1) AS mediana_ha
  FROM s;

-- Um imóvel com embargo: o termo encontrado e a área dentro do imóvel.
SELECT e.numero, e.data_embargo, e.area_ha AS area_termo_ha,
       round((ST_Area(ST_Intersection(e.geom, t.geom)::geography) / 10000)::numeric, 2) AS area_no_imovel_ha,
       left(e.descricao, 120) AS descricao
  FROM teste_imovel_mma t JOIN ibama_embargo e ON e.ativo AND ST_Intersects(e.geom, t.geom)
 WHERE t.cod_car = 'MT-5104906-FAB083D0E06E4C88BD6B872BC5258FD2';
