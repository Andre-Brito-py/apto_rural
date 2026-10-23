"""
MCR 2-9-17 — lista do MMA de imóveis com supressão de vegetação após 31/7/2019.

Fonte oficial: página "Atendimento ao Manual de Crédito Rural" do MMA.
Campos conforme a Nota Explicativa da Metodologia (MMA, 27/03/2026):
  cod_imovel, status_imo (AT/PE/SU/CA), condicao, m_fiscal, soma_desmat,
  dentro_criterio ("Sim" = abaixo do limite do bioma; "Não" = acima),
  criterio_aplicado, biomas, resultados.
O nome do CSV dentro do ZIP traz a data de processamento (DDMMAAAA).

Uso:  python -m coletores.mma_lista_mcr [--arquivo lista.zip] [--simular]
"""

from __future__ import annotations

import csv
import hashlib
import io
import re
import unicodedata
import zipfile
from datetime import date

from .comum import Download, argumentos, baixar, carga, deve_carregar, numero_br

FONTE = "mma_lista_mcr"
URL = (
    "https://www.gov.br/mma/pt-br/assuntos/controle-ao-desmatamento-queimadas-e-ordenamento-ambiental-territorial/"
    "controle-do-desmatamento-1/atendimento-ao-manual-de-credito-rural/car_lista_mcr_acima4mf_toleranc.zip"
)


def _sem_acento(texto: str) -> str:
    return unicodedata.normalize("NFD", texto).encode("ascii", "ignore").decode().strip().lower()


def _data_do_nome(nome: str) -> date | None:
    m = re.search(r"_(\d{2})(\d{2})(\d{4})_", nome)
    return date(int(m[3]), int(m[2]), int(m[1])) if m else None


def ler(caminho):
    with zipfile.ZipFile(caminho) as z:
        nome = next(n for n in z.namelist() if n.lower().endswith(".csv"))
        referencia = _data_do_nome(nome)
        with z.open(nome) as bruto:
            leitor = csv.DictReader(io.TextIOWrapper(bruto, encoding="utf-8-sig"), delimiter=";")
            linhas = (
                {
                    "cod_car": l["cod_imovel"].strip().upper(),
                    "status_car": (l.get("status_imo") or "").strip() or None,
                    "condicao": (l.get("condicao") or "").strip() or None,
                    "modulos_fiscais": numero_br(l.get("m_fiscal")),
                    "area_supressao_ha": numero_br(l.get("soma_desmat")),
                    # Campo oficial: "Não" = soma acima do critério -> item 17 se aplica.
                    "acima_criterio": {"nao": True, "sim": False}.get(_sem_acento(l.get("dentro_criterio") or "")),
                    "criterio": (l.get("criterio_aplicado") or "").strip() or None,
                    "bioma": (l.get("biomas") or "").strip() or None,
                    "resultados": (l.get("resultados") or "").strip() or None,
                }
                for l in leitor
            )
            yield referencia, nome
            yield from linhas


def main() -> None:
    args = argumentos(__doc__.splitlines()[1])
    if args.arquivo:
        dl = Download(URL, args.arquivo, hashlib.sha256(args.arquivo.read_bytes()).hexdigest())
    else:
        dl = baixar(URL, "mma_lista_mcr.zip")

    linhas = ler(dl.caminho)
    referencia, nome = next(linhas)
    print(f"Arquivo {nome} (referência {referencia}), sha256 {dl.sha256[:12]}…")

    if args.simular:
        total = acima = 0
        for l in linhas:
            total += 1
            acima += bool(l["acima_criterio"])
        print(f"{total} imóveis; {acima} acima do critério do item 17.")
        return

    if not deve_carregar(FONTE, dl.sha256, args.forcar):
        return
    with carga(FONTE, dl.url, dl.sha256, referencia) as (conn, carga_id, contador):
        conn.execute("TRUNCATE mma_lista_mcr")
        with conn.cursor().copy(
            "COPY mma_lista_mcr (cod_car, status_car, condicao, modulos_fiscais, area_supressao_ha,"
            " acima_criterio, criterio, bioma, resultados, carga_id) FROM STDIN"
        ) as copia:
            for l in linhas:
                copia.write_row((*l.values(), carga_id))
                contador["registros"] += 1
    print(f"{contador['registros']} imóveis carregados.")


if __name__ == "__main__":
    main()
