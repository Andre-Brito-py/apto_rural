"""Peças comuns dos coletores: download com proveniência e carga atômica."""

from __future__ import annotations

import argparse
import hashlib
import os
import re
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import requests
import truststore

# Usa o repositório de certificados do sistema operacional. Alguns servidores
# gov.br (ex.: GeoServer da Funai) não enviam o certificado intermediário; o
# sistema completa a cadeia. A verificação TLS continua ligada.
truststore.inject_into_ssl()

PASTA_DADOS = Path(__file__).resolve().parents[2] / "dados"
# Alguns portais gov.br recusam requisições sem User-Agent (HTTP 403).
CABECALHOS = {"User-Agent": "AptoRural-Coletor/0.1 (+contato: definir)"}


@dataclass
class Download:
    url: str
    caminho: Path
    sha256: str


def baixar(url: str, nome: str) -> Download:
    """Baixa em streaming para dados/, calculando o SHA-256 do arquivo."""
    PASTA_DADOS.mkdir(exist_ok=True)
    caminho = PASTA_DADOS / nome
    h = hashlib.sha256()
    with requests.get(url, headers=CABECALHOS, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(caminho, "wb") as f:
            for bloco in r.iter_content(1 << 20):
                f.write(bloco)
                h.update(bloco)
    return Download(url, caminho, h.hexdigest())


def numero_br(valor: str | None) -> float | None:
    """'1.234,56' -> 1234.56; vazio -> None."""
    if valor is None or not valor.strip():
        return None
    return float(valor.strip().replace(".", "").replace(",", ".") if "," in valor else valor)


def data_valida(valor: str | None, minimo: int = 1980) -> date | None:
    """Datas impossíveis (há anos como 2925 na base do Ibama) viram None."""
    if not valor:
        return None
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", valor)
    if not m:
        return None
    try:
        d = date(int(m[1]), int(m[2]), int(m[3]))
    except ValueError:
        return None
    return d if minimo <= d.year <= date.today().year else None


def argumentos(descricao: str) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=descricao)
    p.add_argument("--arquivo", type=Path, help="usa um arquivo já baixado em vez de baixar")
    p.add_argument("--simular", action="store_true", help="só lê e conta, sem gravar no banco")
    p.add_argument("--forcar", action="store_true", help="recarrega mesmo se o arquivo oficial não mudou")
    return p.parse_args()


def deve_carregar(fonte_id: str, sha256: str, forcar: bool = False) -> bool:
    """False quando o arquivo é idêntico (mesmo SHA-256) ao da carga ativa."""
    if forcar:
        return True
    import psycopg

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        linha = conn.execute(
            "SELECT 1 FROM fonte_carga WHERE fonte_id = %s AND ativa AND sha256 = %s", (fonte_id, sha256)
        ).fetchone()
    if linha:
        print(f"{fonte_id}: arquivo oficial igual ao já carregado; nada a fazer.")
        return False
    return True


def ler_shapefile(zip_caminho: Path, nome_base: str | None = None, encoding: str = "utf-8"):
    """
    Lê um shapefile dentro de um ZIP e devolve (atributos, geometria GeoJSON).
    Recusa projeção que não seja SIRGAS 2000 geográfico, para não gravar
    coordenadas erradas em silêncio.
    """
    import json
    import zipfile

    import shapefile

    # Extrai para o disco: há shapefiles oficiais com quase 1 GB descompactados.
    destino = PASTA_DADOS / Path(zip_caminho).stem
    with zipfile.ZipFile(zip_caminho) as z:
        if nome_base is None:
            nome_base = next(n for n in z.namelist() if n.lower().endswith(".shp"))[:-4]
        for ext in (".shp", ".shx", ".dbf", ".prj"):
            z.extract(nome_base + ext, destino)
    prj = (destino / f"{nome_base}.prj").read_text(encoding="latin-1")
    if "SIRGAS" not in prj.upper() or not prj.upper().startswith("GEOGCS"):
        raise SystemExit(f"Projeção inesperada em {nome_base}.prj: {prj[:120]}")
    # encodingErrors="replace": há textos oficiais cortados no meio de um caractere.
    with shapefile.Reader(str(destino / nome_base), encoding=encoding, encodingErrors="replace") as r:
        for forma in r.iterShapeRecords():
            if forma.shape.shapeType == shapefile.NULL:
                continue
            yield forma.record.as_dict(), json.dumps(forma.shape.__geo_interface__)


# Polígono válido, 2D, multipart e em SIRGAS 2000.
GEOM_DE_GEOJSON = "ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(geojson), 4674))), 3))"


def copiar_poligonos(conn, tabela: str, colunas: list[str], linhas, carga_id: int, contador: dict) -> None:
    """Grava linhas {coluna: valor, ..., 'geojson': str} numa tabela de polígonos."""
    defs = ", ".join(f"{c} text" for c in colunas)
    conn.execute(f"CREATE TEMP TABLE bruto ({defs}, geojson text) ON COMMIT DROP")
    with conn.cursor().copy(f"COPY bruto ({', '.join(colunas)}, geojson) FROM STDIN") as copia:
        for l in linhas:
            copia.write_row([l[c] for c in colunas] + [l["geojson"]])
            contador["registros"] += 1
    lista = ", ".join(colunas)
    conn.execute(
        f"INSERT INTO {tabela} ({lista}, geom, carga_id)"
        f" SELECT DISTINCT ON (id) {lista}, {GEOM_DE_GEOJSON}, %s FROM bruto",
        (carga_id,),
    )
    conn.execute(f"DELETE FROM {tabela} WHERE ST_IsEmpty(geom)")


@contextmanager
def carga(fonte_id: str, url: str, sha256: str, referencia_em: date | None):
    """
    Abre uma transação, registra a carga e a ativa no fim. Se algo falhar,
    nada muda: a carga anterior continua valendo.
    """
    import psycopg

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.transaction():
            carga_id = conn.execute(
                "INSERT INTO fonte_carga (fonte_id, url, sha256, referencia_em, registros)"
                " VALUES (%s, %s, %s, %s, 0) RETURNING id",
                (fonte_id, url, sha256, referencia_em),
            ).fetchone()[0]
            contador = {"registros": 0}
            yield conn, carga_id, contador
            conn.execute("UPDATE fonte_carga SET ativa = false WHERE fonte_id = %s", (fonte_id,))
            conn.execute(
                "UPDATE fonte_carga SET ativa = true, registros = %s WHERE id = %s",
                (contador["registros"], carga_id),
            )
