"""
Módulo fiscal de cada município (Incra), em hectares.

Base legal: Lei 6.746/1979 e Decreto 84.685/1980, art. 4º (o Incra fixa o módulo
fiscal de cada município por Instrução Especial). Em vigor: IE Incra nº 5/2022
(Anexo IV), alterada pela IE nº 6/2025.

Fonte: PDF oficial "Índices Básicos de 2013" (Sistema Nacional de Cadastro Rural),
publicado em gov.br/incra. A consulta atual do Incra (Plataforma de Governança
Territorial) tem captcha, e o Apto Rural não contorna captcha. Em 24/10/2026 o MF
deste PDF foi conferido contra a planilha da IE 5/2022 (1.885 municípios, todos
iguais) e contra a lista do MMA (3.998 imóveis, 98,7% a menos de 1%). Ver
docs/fontes-oficiais.md.

Municípios criados depois de 2013 que não estão no PDF ficam sem módulo fiscal:
a consulta pede o número ao técnico, em vez de adivinhar.

Uso:  python -m coletores.incra_modulo_fiscal [--arquivo indices.pdf] [--simular]
"""

from __future__ import annotations

import hashlib
import re

import pypdf

from .comum import Download, argumentos, baixar, carga, deve_carregar

FONTE = "incra_modulo_fiscal"
URL = "https://www.gov.br/incra/pt-br/acesso-a-informacao/indices_basicos_2013_por_municipio.pdf/@@download/file"

# Uma linha da relação: NOME  ZP  MF  ZTM  ...  [áreas especiais]CÓDIGO_IBGE  SITUAÇÃO
# Ex.: "JANGADA 3 80 B2-5 3 ... A, PA5104906 008"
LINHA = re.compile(r"^(?P<nome>.+?) (?P<zp>\d) (?P<mf>\d{1,3}) (?P<ztm>[A-C]\d-\d) .*?(?P<cod>\d{7}) \d{3}$")

# Freios contra uma leitura quebrada (ex.: o Incra mudar o leiaute do PDF):
# melhor manter a carga anterior do que gravar uma tabela pela metade.
MINIMO_MUNICIPIOS = 5500
FAIXA_MF = (5, 110)  # menor e maior módulo fiscal do país, em hectares


def ler(caminho) -> dict[str, tuple[str, int]]:
    municipios: dict[str, tuple[str, int]] = {}
    for pagina in pypdf.PdfReader(caminho).pages:
        for linha in (pagina.extract_text() or "").splitlines():
            m = LINHA.match(linha.strip())
            if not m:
                continue
            cod, mf = m["cod"], int(m["mf"])
            if cod in municipios and municipios[cod][1] != mf:
                raise SystemExit(f"Município {cod} aparece com dois módulos fiscais: {municipios[cod][1]} e {mf}.")
            municipios[cod] = (m["nome"].title(), mf)
    return municipios


def conferir(municipios: dict[str, tuple[str, int]]) -> None:
    ufs = {cod[:2] for cod in municipios}
    fora = [(c, mf) for c, (_, mf) in municipios.items() if not FAIXA_MF[0] <= mf <= FAIXA_MF[1]]
    if len(municipios) < MINIMO_MUNICIPIOS or len(ufs) != 27 or fora:
        raise SystemExit(
            f"Leitura suspeita: {len(municipios)} municípios, {len(ufs)} UFs, {len(fora)} fora da faixa {FAIXA_MF}. Nada foi gravado."
        )


def main() -> None:
    args = argumentos(__doc__.splitlines()[1])
    if args.arquivo:
        dl = Download(URL, args.arquivo, hashlib.sha256(args.arquivo.read_bytes()).hexdigest())
    else:
        dl = baixar(URL, "incra_indices_basicos_2013.pdf")

    municipios = ler(dl.caminho)
    conferir(municipios)
    print(f"{len(municipios)} municípios, em 27 UFs; módulo fiscal de {min(mf for _, mf in municipios.values())} a {max(mf for _, mf in municipios.values())} ha.")
    if args.simular:
        return

    if not deve_carregar(FONTE, dl.sha256, args.forcar):
        return
    # Sem data de referência: o arquivo é a tabela de 2013, conferida como em vigor (IE 5/2022).
    with carga(FONTE, dl.url, dl.sha256, None) as (conn, carga_id, contador):
        conn.execute("TRUNCATE incra_modulo_fiscal")
        with conn.cursor().copy("COPY incra_modulo_fiscal (cod_ibge, municipio, modulo_fiscal_ha, carga_id) FROM STDIN") as copia:
            for cod, (nome, mf) in sorted(municipios.items()):
                copia.write_row((cod, nome, mf, carga_id))
                contador["registros"] += 1
    print(f"{contador['registros']} municípios carregados.")


if __name__ == "__main__":
    main()
