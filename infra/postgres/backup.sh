#!/bin/sh
set -eu

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:=5432}"
: "${PGUSER:?PGUSER is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${BACKUP_DIR:=./backups}"

umask 077
mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${BACKUP_DIR%/}/miran-${timestamp}.dump"
checksum_file="${backup_file}.sha256"

pg_dump \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-acl \
  --file="$backup_file" \
  "$PGDATABASE"

sha256sum "$backup_file" > "$checksum_file"
chmod 600 "$backup_file" "$checksum_file"

printf '%s\n' "$backup_file"
