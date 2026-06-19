#!/bin/bash
# DB 备份脚本 — 每天凌晨 3 点执行
# crontab: 0 3 * * * /opt/private-kb/deploy/backup-db.sh
set -euo pipefail

BACKUP_DIR="/opt/private-kb/backups"
PG_CONTAINER="private-kb-pg"
PG_USER="${PG_USER:-kb}"
PG_DB="${PG_DB:-private_kb}"
RETAIN_DAYS=7
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/private_kb_$DATE.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Backing up $PG_DB to $BACKUP_FILE"
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" "$PG_DB" | gzip > "$BACKUP_FILE"

# 清理旧备份
find "$BACKUP_DIR" -name "private_kb_*.sql.gz" -mtime +$RETAIN_DAYS -delete
echo "[$(date)] Done. Current backups:"
ls -lh "$BACKUP_DIR"/private_kb_*.sql.gz 2>/dev/null | tail -5
