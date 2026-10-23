"""
FERRAMENTA DE TESTE — não faz parte do produto.

Baixa uma amostra de contornos de imóveis da lista MCR publicada pelo MMA no
serviço ArcGIS do próprio ministério (labdez.mma.gov.br, camadas usadas pelo
painel oficial "Consulta ao CAR por bioma"), para testar o Apto Rural com
fazendas reais. Grava na tabela teste_imovel_mma, separada das tabelas do produto.

Uso:  python -m coletores.amostra_mma --bioma cerrado --uf MT --limite 2000
"""

from __future__ import annotations

import argparse
import json
import os

import psycopg
import requests

from .comum import CABECALHOS, GEOM_DE_GEOJSON

SERVICO = "https://labdez.mma.gov.br/server/rest/services/Hosted/lista_mcr_{bioma}_VF/FeatureServer/0/query"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    p.add_argument("--bioma", default="cerrado", help="cerrado, amazonia, pantanal… (nome da camada do MMA)")
    p.add_argument("--uf", default="MT")
    p.add_argument("--limite", type=int, default=2000)
    a = p.parse_args()

    r = requests.get(
        SERVICO.format(bioma=a.bioma),
        params={
            "where": f"uf='{a.uf}'",
            "outFields": "cod_imovel,status_imo,condicao,m_fiscal,area_total_ha,soma_desmat,municipio",
            "outSR": 4674,
            "resultRecordCount": a.limite,
            "f": "geojson",
        },
        headers=CABECALHOS,
        timeout=300,
    )
    r.raise_for_status()
    feicoes = r.json()["features"]
    print(f"{len(feicoes)} imóveis recebidos ({a.bioma}, {a.uf}).")

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS teste_imovel_mma (
                 cod_car text PRIMARY KEY, uf text, municipio text, status_car text, condicao text,
                 modulos_fiscais numeric, area_ha numeric, soma_desmat numeric,
                 geojson jsonb, geom geometry (MultiPolygon, 4674))"""
        )
        with conn.cursor() as cur:
            for f in feicoes:
                if not f.get("geometry"):
                    continue
                pr = f["properties"]
                geojson = json.dumps(f["geometry"])
                cur.execute(
                    f"""INSERT INTO teste_imovel_mma
                          (cod_car, uf, municipio, status_car, condicao, modulos_fiscais, area_ha, soma_desmat, geojson, geom)
                        SELECT %s, %s, %s, %s, %s, %s, %s, %s, geojson::jsonb, {GEOM_DE_GEOJSON}
                          FROM (SELECT %s::text AS geojson) x
                        ON CONFLICT (cod_car) DO NOTHING""",
                    (
                        pr["cod_imovel"].upper(), a.uf, pr.get("municipio"), pr.get("status_imo"), pr.get("condicao"),
                        pr.get("m_fiscal"), pr.get("area_total_ha"), pr.get("soma_desmat"), geojson,
                    ),
                )
    print("Amostra gravada em teste_imovel_mma.")


if __name__ == "__main__":
    main()
