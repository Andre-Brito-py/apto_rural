"""
MCR 2-9-7 — terras indígenas (Funai).

Fonte oficial: GeoServer da Funai, camada Funai:tis_poligonais (EPSG:4674).
Campos usados: gid, terrai_nome, fase_ti, modalidade_ti.
Valores de fase_ti vistos em 23/10/2026: Regularizada, Homologada, Encaminhada RI,
Declarada, Delimitada, Em Estudo. Modalidade: Tradicionalmente ocupada,
Reserva Indígena, Dominial Indígena, Interditada.
Licença: A CONFIRMAR com a Funai.

Uso:  python -m coletores.funai_ti [--arquivo tis.geojson] [--simular]
"""

from __future__ import annotations

import collections
import hashlib
import json
import re
from datetime import date

import requests

from .comum import CABECALHOS, PASTA_DADOS, Download, argumentos, carga, copiar_poligonos

FONTE = "funai_ti"
WFS = "https://geoserver.funai.gov.br/geoserver/Funai/ows"
POR_PAGINA = 100


def baixar_wfs() -> Download:
    """Baixa a camada em páginas (WFS 2.0, startIndex) e junta num GeoJSON."""
    feicoes, inicio = [], 0
    while True:
        r = requests.get(
            WFS,
            params={
                "service": "WFS",
                "version": "2.0.0",
                "request": "GetFeature",
                "typeNames": "Funai:tis_poligonais",
                "outputFormat": "json",
                "count": POR_PAGINA,
                "startIndex": inicio,
                "sortBy": "gid",
            },
            headers=CABECALHOS,
            timeout=180,
        )
        r.raise_for_status()
        pagina = r.json()["features"]
        feicoes += pagina
        if len(pagina) < POR_PAGINA:
            break
        inicio += POR_PAGINA
    PASTA_DADOS.mkdir(exist_ok=True)
    caminho = PASTA_DADOS / "funai_tis_poligonais.geojson"
    conteudo = json.dumps({"type": "FeatureCollection", "features": feicoes}).encode()
    caminho.write_bytes(conteudo)
    return Download(f"{WFS}?typeNames=Funai:tis_poligonais", caminho, hashlib.sha256(conteudo).hexdigest())


def referencia(caminho) -> date | None:
    """Data de atualização mais recente entre as terras publicadas (campo data_atualizacao)."""
    datas = []
    for f in json.loads(caminho.read_text(encoding="utf-8"))["features"]:
        # O GeoServer publica no formato DD/MM/AAAA.
        m = re.match(r"(\d{2})/(\d{2})/(\d{4})", str(f["properties"].get("data_atualizacao") or ""))
        if m:
            datas.append(date(int(m[3]), int(m[2]), int(m[1])))
    validas = [d for d in datas if d <= date.today()]
    return max(validas) if validas else None


def ler(caminho):
    for f in json.loads(caminho.read_text(encoding="utf-8"))["features"]:
        p = f["properties"]
        if not f.get("geometry"):
            continue
        yield {
            "id": str(p["gid"]),
            "nome": p["terrai_nome"],
            "fase": p["fase_ti"],
            "modalidade": p.get("modalidade_ti"),
            "geojson": json.dumps(f["geometry"]),
        }


def main() -> None:
    args = argumentos(__doc__.splitlines()[1])
    if args.arquivo:
        dl = Download(WFS, args.arquivo, hashlib.sha256(args.arquivo.read_bytes()).hexdigest())
    else:
        dl = baixar_wfs()

    if args.simular:
        fases = collections.Counter(l["fase"] for l in ler(dl.caminho))
        print(f"{sum(fases.values())} terras indígenas: {dict(fases)}")
        return

    ref = referencia(dl.caminho)
    print(f"Atualização mais recente na base da Funai: {ref}")
    with carga(FONTE, dl.url, dl.sha256, ref) as (conn, carga_id, contador):
        conn.execute("TRUNCATE funai_ti")
        copiar_poligonos(conn, "funai_ti", ["id", "nome", "fase", "modalidade"], ler(dl.caminho), carga_id, contador)
    print(f"{contador['registros']} terras indígenas carregadas.")


if __name__ == "__main__":
    main()
