"""
MCR 2-9-10 — termos de embargo do Ibama (dados abertos, atualização diária).

Fonte oficial: https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-termo-de-embargo
Licença declarada no portal: "Outra (Aberta)".

Não guardamos nome nem CPF/CNPJ do autuado (LGPD, minimização): o cruzamento
é feito pela geometria do embargo com o contorno do imóvel.

A CONFIRMAR com o dicionário de dados do Ibama: os valores de SIT_DESEMBARGO e
DES_STATUS_FORMULARIO. Hoje um termo conta como ativo quando não está cancelado
(SIT_CANCELADO != 'S') e não tem data de desembargo.

Uso:  python -m coletores.ibama_embargos [--arquivo termo_de_embargo.csv] [--simular]
"""

from __future__ import annotations

import csv
import hashlib
import sys

from .comum import Download, argumentos, baixar, carga, data_valida, numero_br

FONTE = "ibama_embargos"
URL = (
    "https://stibamadadosabertosprd.blob.core.windows.net/dados-abertos/dados/"
    "TERMOS_DE_EMBARGO/TERMO_EMBARGO/termo_de_embargo.csv"
)

# Alguns polígonos em WKT passam do limite padrão de campo do módulo csv.
csv.field_size_limit(min(sys.maxsize, 2**31 - 1))


def _geometria(l: dict) -> str | None:
    """WKT do polígono embargado; sem ele, o ponto do termo."""
    wkt = (l.get("GEOM_AREA_EMBARGADA") or "").strip()
    if wkt:
        return wkt
    lon, lat = numero_br(l.get("NUM_LONGITUDE_TAD")), numero_br(l.get("NUM_LATITUDE_TAD"))
    if lon is None or lat is None or not (-75 < lon < -28 and -35 < lat < 6):
        return None
    return f"POINT({lon} {lat})"


def ler(caminho):
    with open(caminho, encoding="utf-8-sig", newline="") as f:
        for l in csv.DictReader(f, delimiter=";"):
            serie = (l.get("SER_TAD") or "").strip()
            yield {
                "seq": l["SEQ_TAD"].strip(),
                "numero": l["NUM_TAD"].strip() + (f"/{serie}" if serie else ""),
                "data_embargo": data_valida(l.get("DAT_EMBARGO")),
                "area_ha": numero_br(l.get("QTD_AREA_EMBARGADA")),
                "descricao": (l.get("DES_TAD") or "").strip()[:2000] or None,
                "ativo": (l.get("SIT_CANCELADO") or "").strip().upper() != "S"
                and not (l.get("DAT_DESEMBARGO") or "").strip(),
                "wkt": _geometria(l),
            }


def main() -> None:
    args = argumentos(__doc__.splitlines()[1])
    if args.arquivo:
        h = hashlib.sha256()
        with open(args.arquivo, "rb") as f:
            for bloco in iter(lambda: f.read(1 << 20), b""):
                h.update(bloco)
        dl = Download(URL, args.arquivo, h.hexdigest())
    else:
        dl = baixar(URL, "ibama_termo_de_embargo.csv")

    if args.simular:
        total = ativos = sem_geo = sem_data = 0
        for l in ler(dl.caminho):
            total += 1
            ativos += l["ativo"]
            sem_geo += l["wkt"] is None
            sem_data += l["data_embargo"] is None
        print(f"{total} termos; {ativos} ativos; {sem_geo} sem geometria; {sem_data} sem data válida.")
        return

    with carga(FONTE, dl.url, dl.sha256, None) as (conn, carga_id, contador):
        conn.execute("TRUNCATE ibama_embargo")
        conn.execute(
            "CREATE TEMP TABLE ibama_bruto (seq text, numero text, data_embargo date, area_ha numeric,"
            " descricao text, ativo boolean, wkt text) ON COMMIT DROP"
        )
        with conn.cursor().copy("COPY ibama_bruto FROM STDIN") as copia:
            for l in ler(dl.caminho):
                copia.write_row(tuple(l.values()))
                contador["registros"] += 1
        # Geometria inválida é corrigida; a que não tem conserto fica NULL e não cruza.
        conn.execute(
            """
            INSERT INTO ibama_embargo (seq, numero, data_embargo, area_ha, descricao, ativo, geom, carga_id)
            SELECT DISTINCT ON (seq) seq, numero, data_embargo, area_ha, descricao, ativo,
                   CASE WHEN wkt IS NULL THEN NULL
                        ELSE ST_MakeValid(ST_GeomFromText(wkt, 4674)) END,
                   %s
              FROM ibama_bruto
            """,
            (carga_id,),
        )
    print(f"{contador['registros']} termos carregados.")


if __name__ == "__main__":
    main()
