#!/usr/bin/env bash
# Бэкап БД и файлов задач taskterm в ./backups, старые копии удаляются.
# Использование: scripts/backup.sh [папка] [сколько дней хранить]
# Cron (каждую ночь в 03:15):  15 3 * * * cd /opt/taskterm && scripts/backup.sh >> backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
dir="${1:-backups}"
keep_days="${2:-14}"
mkdir -p "$dir"
file="$dir/taskterm-$(date +%F-%H%M).dump"
docker compose exec -T db pg_dump -U taskterm -Fc taskterm > "$file.tmp"
mv "$file.tmp" "$file"
find "$dir" -name 'taskterm-*.dump' -mtime "+$keep_days" -delete
echo "$(date '+%Y-%m-%dT%H:%M:%S%z') ok $file ($(du -h "$file" | cut -f1))"

# файлы, прикреплённые к задачам (папка /app/uploads внутри контейнера app)
files="$dir/taskterm-uploads-$(date +%F-%H%M).tar.gz"
docker compose exec -T app tar -C /app/uploads -czf - . > "$files.tmp"
mv "$files.tmp" "$files"
find "$dir" -name 'taskterm-uploads-*.tar.gz' -mtime "+$keep_days" -delete
echo "$(date '+%Y-%m-%dT%H:%M:%S%z') ok $files ($(du -h "$files" | cut -f1))"
