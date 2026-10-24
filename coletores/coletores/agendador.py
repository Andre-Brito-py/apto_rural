"""
Agenda a atualização das bases oficiais. Roda para sempre (é o processo do
container "coletores" em produção).

- Todo dia às 4h (Brasília): Ibama (atualização diária), MMA (a cada ~15 dias),
  Funai e MTE (arquivos leves).
- Domingo às 4h: também CNUC, CNFP (arquivos grandes, mudam pouco) e o módulo
  fiscal do Incra (muda raramente; só recarrega se o PDF oficial mudar).

Cada coletor só recarrega se o arquivo oficial mudou (SHA-256). A falha de um
não impede os outros, e a carga anterior continua valendo.

Uso:  python -m coletores.agendador            (fica rodando)
      python -m coletores.agendador --agora    (roda tudo uma vez e sai)
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .comum import registrar_erro

FUSO = ZoneInfo("America/Sao_Paulo")
HORA = 4
DIARIOS = ["ibama_embargos", "mma_lista_mcr", "funai_ti", "mte_empregadores"]
SEMANAIS = ["cnuc", "sfb_cnfp", "incra_modulo_fiscal"]


def rodar(coletores: list[str]) -> None:
    for nome in coletores:
        inicio = time.monotonic()
        print(f"[{datetime.now(FUSO):%Y-%m-%d %H:%M}] {nome}: iniciando", flush=True)
        r = subprocess.run([sys.executable, "-m", f"coletores.{nome}"], capture_output=True, text=True)
        print(r.stdout, end="", flush=True)
        print(r.stderr, end="", file=sys.stderr, flush=True)
        situacao = "ok" if r.returncode == 0 else f"FALHOU (código {r.returncode})"
        print(f"[{datetime.now(FUSO):%Y-%m-%d %H:%M}] {nome}: {situacao} em {time.monotonic() - inicio:.0f}s", flush=True)
        if r.returncode != 0:
            registrar_erro(f"Coletor {nome} falhou (código {r.returncode})", r.stderr or r.stdout)


def proxima_execucao(agora: datetime) -> datetime:
    alvo = agora.replace(hour=HORA, minute=0, second=0, microsecond=0)
    return alvo if alvo > agora else alvo + timedelta(days=1)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    p.add_argument("--agora", action="store_true", help="roda todos os coletores uma vez e sai")
    if p.parse_args().agora:
        rodar(DIARIOS + SEMANAIS)
        return

    while True:
        alvo = proxima_execucao(datetime.now(FUSO))
        print(f"Próxima atualização: {alvo:%Y-%m-%d %H:%M} (Brasília)", flush=True)
        time.sleep(max(0, (alvo - datetime.now(FUSO)).total_seconds()))
        domingo = alvo.weekday() == 6
        rodar(DIARIOS + (SEMANAIS if domingo else []))


if __name__ == "__main__":
    main()
