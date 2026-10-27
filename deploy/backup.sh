#!/bin/sh
# Backup diário do banco às 3h (Brasília = UTC-3, ou seja, 6h UTC). Ver docs/backup-e-vigia.md.
#
# 1. pg_dump (formato custom, -Fc) em /backups; guarda os últimos BACKUP_DIAS dias.
# 2. Se o armazenamento externo estiver configurado (BACKUP_S3_*), manda uma cópia
#    CIFRADA antes de sair do servidor (rclone crypt, com a BACKUP_EXTERNO_SENHA) e apaga
#    lá as cópias com mais de BACKUP_EXTERNO_DIAS dias.
# 3. Registra o resultado no banco. O painel mostra; o vigia (no monitor) manda o sinal ao
#    serviço de alerta externo (VIGIA_URL_BACKUP), e sem o sinal de "deu certo" num dia o
#    serviço avisa; o monitor das 6h também avisa se o backup parar.
#
# Uso: sh /backup.sh                        (fica rodando, um backup por dia)
#      sh /backup.sh agora                  (faz um backup já e sai)
#      sh /backup.sh externo-listar         (lista as cópias fora do servidor)
#      sh /backup.sh externo-baixar ARQUIVO (traz uma cópia de fora, decifrada, para /backups)
set -eu

banco() { psql -h db -U apto -d apto_rural -v ON_ERROR_STOP=1 -q "$@"; }

# Registra a execução; erro também vai para o registro de erros (painel e e-mail).
registrar() { # $1 arquivo $2 bytes $3 local_ok $4 externo $5 mensagem
  banco -v arquivo="$1" -v bytes="$2" -v local_ok="$3" -v externo="$4" -v mensagem="$5" <<'SQL' || echo "Não foi possível registrar o backup no banco." >&2
INSERT INTO backup_execucao (arquivo, bytes, local_ok, externo, mensagem)
VALUES (nullif(:'arquivo', ''), nullif(:'bytes', '')::bigint, :'local_ok'::boolean, :'externo', nullif(:'mensagem', ''));
INSERT INTO erro_registro (origem, mensagem, detalhe)
SELECT 'backup',
       CASE WHEN NOT :'local_ok'::boolean THEN 'Backup do banco falhou' ELSE 'Cópia do backup fora do servidor falhou' END,
       nullif(:'mensagem', '')
 WHERE NOT :'local_ok'::boolean OR :'externo' = 'erro';
SQL
}

externo_configurado() { [ -n "${BACKUP_S3_BUCKET:-}" ]; }

configurar_rclone() {
  : "${BACKUP_EXTERNO_SENHA:?defina BACKUP_EXTERNO_SENHA (cifra a cópia externa)}"
  # Tudo vem das variáveis abaixo; um arquivo de configuração vazio evita o aviso do rclone.
  export RCLONE_CONFIG=/tmp/rclone-vazio.conf
  : >"$RCLONE_CONFIG"
  export RCLONE_CONFIG_EXTERNO_TYPE=s3
  export RCLONE_CONFIG_EXTERNO_PROVIDER="${BACKUP_S3_PROVEDOR:-Other}"
  export RCLONE_CONFIG_EXTERNO_ENDPOINT="${BACKUP_S3_ENDPOINT:-}"
  export RCLONE_CONFIG_EXTERNO_REGION="${BACKUP_S3_REGIAO:-}"
  export RCLONE_CONFIG_EXTERNO_ACCESS_KEY_ID="${BACKUP_S3_CHAVE:?defina BACKUP_S3_CHAVE}"
  export RCLONE_CONFIG_EXTERNO_SECRET_ACCESS_KEY="${BACKUP_S3_SEGREDO:?defina BACKUP_S3_SEGREDO}"
  # "cofre": cifra conteúdo e nomes dos arquivos antes de enviar. Sem a senha, a cópia é ilegível.
  export RCLONE_CONFIG_COFRE_TYPE=crypt
  export RCLONE_CONFIG_COFRE_REMOTE="externo:${BACKUP_S3_BUCKET}/apto-rural"
  RCLONE_CONFIG_COFRE_PASSWORD="$(rclone obscure "$BACKUP_EXTERNO_SENHA")"
  export RCLONE_CONFIG_COFRE_PASSWORD
}

fazer_backup() {
  arquivo="/backups/apto_rural_$(date -u +%Y%m%d_%H%M).dump"
  if ! pg_dump -h db -U apto -d apto_rural -Fc -f "$arquivo" 2>/tmp/pg_dump.log; then
    msg="$(tail -c 500 /tmp/pg_dump.log)"
    echo "BACKUP FALHOU: $msg" >&2
    rm -f "$arquivo"
    registrar "" "" false desligado "$msg"
    return 0
  fi
  bytes="$(wc -c <"$arquivo" | tr -d ' ')"
  echo "Backup ok: $arquivo ($(du -h "$arquivo" | cut -f1))"
  find /backups -name 'apto_rural_*.dump' -mtime +"${BACKUP_DIAS:-14}" -delete

  if ! externo_configurado; then
    echo "Cópia fora do servidor DESLIGADA (configure BACKUP_S3_* no .env.producao)."
    registrar "$arquivo" "$bytes" true desligado ""
    return 0
  fi

  configurar_rclone
  if rclone copy "$arquivo" cofre: --s3-no-check-bucket --retries 3 --log-level ERROR 2>/tmp/rclone.log; then
    rclone delete cofre: --min-age "${BACKUP_EXTERNO_DIAS:-30}d" --log-level ERROR 2>>/tmp/rclone.log || true
    echo "Cópia cifrada enviada para fora do servidor (${BACKUP_S3_BUCKET})."
    registrar "$arquivo" "$bytes" true ok ""
  else
    msg="$(tail -c 500 /tmp/rclone.log)"
    echo "CÓPIA EXTERNA FALHOU: $msg" >&2
    registrar "$arquivo" "$bytes" true erro "$msg"
  fi
}

case "${1:-}" in
  agora)
    fazer_backup
    exit 0
    ;;
  externo-listar) # lista as cópias guardadas fora do servidor (já decifra os nomes)
    configurar_rclone
    rclone lsl cofre:
    exit 0
    ;;
  externo-baixar) # traz uma cópia de fora para /backups, decifrada, pronta para o pg_restore
    configurar_rclone
    rclone copy "cofre:${2:?diga o nome do arquivo (veja externo-listar)}" /backups/
    echo "Baixado em /backups/$2"
    exit 0
    ;;
esac

while true; do
  agora=$(date -u +%s)
  alvo=$(date -u -d "$(date -u +%Y-%m-%d) 06:00" +%s)
  [ "$alvo" -le "$agora" ] && alvo=$((alvo + 86400))
  echo "Próximo backup em $(((alvo - agora) / 60)) minutos."
  sleep $((alvo - agora))
  fazer_backup
done
