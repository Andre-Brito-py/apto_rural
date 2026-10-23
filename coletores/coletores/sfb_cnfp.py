"""
MCR 2-9-14 — Florestas Públicas Tipo B (não destinadas), do CNFP.

Fonte oficial: Serviço Florestal Brasileiro, "Cadastro Nacional de Florestas
Públicas 2025" (item público do portal mapas.florestal.gov.br; licença CC BY
declarada em dados.florestal.gov.br). Shapefile em SIRGAS 2000.
Campo "tipo" com o valor "TIPO B" = áreas arrecadadas pelo poder público ainda
sem destinação (definição do próprio SFB).

Uso:  python -m coletores.sfb_cnfp [--arquivo CNFP_2025.zip] [--simular]
"""

from __future__ import annotations

import collections
import hashlib

from .comum import Download, argumentos, baixar, carga, copiar_poligonos, ler_shapefile

FONTE = "sfb_cnfp"
URL = "https://mapas.florestal.gov.br/portal/sharing/rest/content/items/2b752dfbf9254920bf8990ce363918af/data"


def ler(caminho, so_tipo_b: bool = True):
    for i, (a, geojson) in enumerate(ler_shapefile(caminho)):
        tipo = (a.get("tipo") or "").strip().upper()
        if so_tipo_b and tipo != "TIPO B":
            continue
        nome = (a.get("nome") or "").strip()
        categoria = (a.get("categoria") or "").strip()
        yield {
            # "codigo" pode vir vazio ou repetido; a posição no arquivo é única.
            "id": f"cnfp-{i}",
            "nome": f"{categoria} {nome}".strip() or "Floresta pública Tipo B",
            "tipo": tipo,
            "geojson": geojson,
        }


def _sha256(caminho) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def main() -> None:
    args = argumentos(__doc__.splitlines()[1])
    dl = Download(URL, args.arquivo, _sha256(args.arquivo)) if args.arquivo else baixar(URL, "CNFP_2025.zip")

    if args.simular:
        tipos = collections.Counter(l["tipo"] for l in ler(dl.caminho, so_tipo_b=False))
        print(f"{sum(tipos.values())} polígonos: {dict(tipos)}")
        return

    with carga(FONTE, dl.url, dl.sha256, None) as (conn, carga_id, contador):
        conn.execute("TRUNCATE sfb_floresta_tipo_b")
        linhas = ({k: v for k, v in l.items() if k != "tipo"} for l in ler(dl.caminho))
        copiar_poligonos(conn, "sfb_floresta_tipo_b", ["id", "nome"], linhas, carga_id, contador)
    print(f"{contador['registros']} florestas Tipo B carregadas.")


if __name__ == "__main__":
    main()
