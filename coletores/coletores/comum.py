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
    return p.parse_args()


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
