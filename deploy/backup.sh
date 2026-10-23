#!/bin/sh
# Backup diário do banco às 3h (Brasília = UTC-3, ou seja, 6h UTC).
# Guarda os últimos BACKUP_DIAS dias em /backups. Formato: pg_dump custom (-Fc).
# Restaurar: pg_restore -h <host> -U apto -d apto_rural --clean arquivo.dump
set -eu
while true; do
  agora=$(date -u +%s)
  alvo=$(date -u -d "$(date -u +%Y-%m-%d) 06:00" +%s)
  [ "$alvo" -le "$agora" ] && alvo=$((alvo + 86400))
  echo "Próximo backup em $(( (alvo - agora) / 60 )) minutos."
  sleep $((alvo - agora))

  arquivo="/backups/apto_rural_$(date -u +%Y%m%d_%H%M).dump"
  if pg_dump -h db -U apto -d apto_rural -Fc -f "$arquivo"; then
    echo "Backup ok: $arquivo ($(du -h "$arquivo" | cut -f1))"
  else
    echo "BACKUP FALHOU" >&2
    rm -f "$arquivo"
  fi
  find /backups -name 'apto_rural_*.dump' -mtime +"${BACKUP_DIAS:-14}" -delete
done
