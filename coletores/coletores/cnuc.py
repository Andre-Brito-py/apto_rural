"""
MCR 2-9-5 — Unidades de Conservação do CNUC (MMA).

Fonte oficial: https://dados.mma.gov.br/dataset/unidadesdeconservacao (licença CC BY).
O shapefile mais novo com download direto é o de 2025_08. Versões de 2026 estão
publicadas só em SharePoint: baixe manualmente e use --arquivo.
Campos usados: cd_cnuc, nome_uc, categoria, grupo, pl_manejo, esfera, situacao.

Uso:  python -m coletores.cnuc [--arquivo shp_cnuc.zip] [--simular]
"""

from __future__ import annotations

import collections
import hashlib
import re
from datetime import date

from .comum import Download, argumentos, baixar, carga, copiar_poligonos, deve_carregar, ler_shapefile

FONTE = "cnuc"
URL = (
    "https://dados.mma.gov.br/dataset/44b6dc8a-dc82-4a84-8d95-1b0da7c85dac/resource/"
    "6ba9a557-87e8-4882-acb7-b3e0f0ea192d/download/shp_cnuc_2025_08.zip"
)


def ler(caminho):
    for a, geojson in ler_shapefile(caminho):
        if (a.get("situacao") or "").strip().lower() not in ("", "ativo"):
            continue
        yield {
            "id": a["cd_cnuc"],
            "nome": a["nome_uc"],
            "categoria": a["categoria"],
            "grupo": a.get("grupo") or None,
            "plano_manejo": a.get("pl_manejo") or None,
            "esfera": a.get("esfera") or None,
            "geojson": geojson,
        }


def _referencia(zip_caminho) -> date | None:
    """Mês da edição, pelo nome do shapefile oficial dentro do ZIP (ex.: cnuc_2025_08)."""
    import zipfile

    with zipfile.ZipFile(zip_caminho) as z:
        for nome in z.namelist():
            m = re.search(r"cnuc_(\d{4})_(\d{2})\.shp$", nome, re.I)
            if m:
                return date(int(m[1]), int(m[2]), 1)
    return None


def main() -> None:
    args = argumentos(__doc__.splitlines()[1])
    if args.arquivo:
        dl = Download(URL, args.arquivo, hashlib.sha256(args.arquivo.read_bytes()).hexdigest())
    else:
        dl = baixar(URL, "shp_cnuc_2025_08.zip")

    if args.simular:
        grupos = collections.Counter(l["grupo"] for l in ler(dl.caminho))
        print(f"{sum(grupos.values())} UCs ativas: {dict(grupos)}")
        return

    colunas = ["id", "nome", "categoria", "grupo", "plano_manejo", "esfera"]
    if not deve_carregar(FONTE, dl.sha256, args.forcar):
        return
    with carga(FONTE, dl.url, dl.sha256, _referencia(dl.caminho)) as (conn, carga_id, contador):
        conn.execute("TRUNCATE cnuc_uc")
        copiar_poligonos(conn, "cnuc_uc", colunas, ler(dl.caminho), carga_id, contador)
    print(f"{contador['registros']} UCs carregadas.")


if __name__ == "__main__":
    main()
