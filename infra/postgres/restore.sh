#!/bin/sh
set -eu

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:=5432}"
: "${PGUSER:?PGUSER is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"

checksum_file="${BACKUP_FILE}.sha256"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi
if [ ! -f "$checksum_file" ]; then
  echo "Checksum file not found: $checksum_file" >&2
  exit 1
fi

sha256sum -c "$checksum_file"

pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --exit-on-error \
  --single-transaction \
  --dbname="$PGDATABASE" \
  "$BACKUP_FILE"

echo "Restore completed and checksum verified."
