"""
MCR 2-9-4 — Cadastro de Empregadores (trabalho análogo ao escravo), do MTE.

Fonte oficial: PDF publicado pelo Ministério do Trabalho e Emprego
(Portaria Interministerial MTE/MDHC/MIR nº 18, de 13/09/2024), atualizado
semestralmente. A edição de 6/10/2026 tem uma única seção (art. 2º, caput).

LGPD: guardamos só o HMAC-SHA256 (mesma chave DOCUMENTO_HASH_SECRET da API) de
cada CPF, CNPJ e raiz de CNPJ. Nome, endereço e números em claro não são gravados.

Uso:  python -m coletores.mte_empregadores [--arquivo cadastro.pdf] [--simular]
"""

from __future__ import annotations

import hashlib
import hmac
import os
import re
from datetime import date

import pypdf

from .comum import Download, argumentos, baixar, carga, deve_carregar

FONTE = "mte_empregadores"
URL = (
    "https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/"
    "areas-de-atuacao/cadastro_de_empregadores.pdf"
)
CPF = re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b")
CNPJ = re.compile(r"\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b")
MESES = "janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro".split()


def documentos(texto: str) -> set[str]:
    """CPF (11 dígitos), CNPJ (14) e a raiz do CNPJ (8), que identifica a pessoa jurídica."""
    docs = {re.sub(r"\D", "", c) for c in CPF.findall(texto)}
    for c in CNPJ.findall(texto):
        d = re.sub(r"\D", "", c)
        docs |= {d, d[:8]}
    return docs


def referencia(texto: str) -> date | None:
    m = re.search(r"Atualiza\w+ peri\w+ de (\d{1,2}) de (\w+) de (\d{4})", texto)
    if not m or m[2].lower() not in MESES:
        return None
    return date(int(m[3]), MESES.index(m[2].lower()) + 1, int(m[1]))


def main() -> None:
    args = argumentos(__doc__.splitlines()[1])
    if args.arquivo:
        dl = Download(URL, args.arquivo, hashlib.sha256(args.arquivo.read_bytes()).hexdigest())
    else:
        dl = baixar(URL, "mte_cadastro_de_empregadores.pdf")

    texto = "\n".join(p.extract_text() or "" for p in pypdf.PdfReader(dl.caminho).pages)
    ref = referencia(texto)
    docs = documentos(texto)
    print(f"Edição de {ref}: {sum(len(d) == 11 for d in docs)} CPFs, {sum(len(d) == 14 for d in docs)} CNPJs.")
    if args.simular:
        return

    if not deve_carregar(FONTE, dl.sha256, args.forcar):
        return
    segredo = os.environ["DOCUMENTO_HASH_SECRET"].encode()
    with carga(FONTE, dl.url, dl.sha256, ref) as (conn, carga_id, contador):
        conn.execute("TRUNCATE mte_empregador")
        with conn.cursor().copy("COPY mte_empregador (documento_hash, carga_id) FROM STDIN") as copia:
            for d in sorted(docs):
                copia.write_row((hmac.new(segredo, d.encode(), "sha256").hexdigest(), carga_id))
                contador["registros"] += 1
    print(f"{contador['registros']} códigos carregados.")


if __name__ == "__main__":
    main()
