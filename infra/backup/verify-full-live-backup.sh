#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command is missing: $1"
}

require_command sha256sum
require_command tar
require_command find
require_command tr

ARCHIVE="${MIRAN_BACKUP_ARCHIVE:?Set MIRAN_BACKUP_ARCHIVE to the .tar.gz full live backup}"
[[ -f "$ARCHIVE" ]] || fail "Backup archive not found: $ARCHIVE"
CHECKSUM_FILE="${ARCHIVE}.sha256"
[[ -f "$CHECKSUM_FILE" ]] || fail "Archive checksum file not found: $CHECKSUM_FILE"

ARCHIVE_DIR="$(cd "$(dirname "$ARCHIVE")" && pwd)"
(
  cd "$ARCHIVE_DIR"
  sha256sum -c "$(basename "$CHECKSUM_FILE")"
)

umask 077
VERIFY_DIR="$(mktemp -d)"
trap 'rm -rf "$VERIFY_DIR"' EXIT

tar -C "$VERIFY_DIR" -xzf "$ARCHIVE"
mapfile -t ROOTS < <(find "$VERIFY_DIR" -mindepth 1 -maxdepth 1 -type d -print)
[[ ${#ROOTS[@]} -eq 1 ]] || fail "Backup archive must contain exactly one bundle directory"
BUNDLE_DIR="${ROOTS[0]}"
[[ -f "$BUNDLE_DIR/SHA256SUMS" ]] || fail "Internal SHA256 manifest is missing"
[[ -f "$BUNDLE_DIR/source/PRODUCTION_COMMIT" ]] || fail "Production commit marker is missing"
[[ -s "$BUNDLE_DIR/database/postgres.dump" ]] || fail "PostgreSQL dump is missing or empty"
[[ -f "$BUNDLE_DIR/storage/private/objects.tsv" ]] || fail "Private object storage inventory is missing"
[[ -f "$BUNDLE_DIR/storage/public/objects.tsv" ]] || fail "Public object storage inventory is missing"
[[ -f "$BUNDLE_DIR/secrets/production.env" ]] || fail "Production environment backup is missing"

(
  cd "$BUNDLE_DIR"
  sha256sum -c SHA256SUMS
)

printf 'Full live backup verified successfully.\n'
printf 'Production commit: %s\n' "$(tr -d '[:space:]' <"$BUNDLE_DIR/source/PRODUCTION_COMMIT")"
printf 'Private object count: %s\n' "$(tr -d '[:space:]' <"$BUNDLE_DIR/storage/private/object-count.txt")"
printf 'Public object count: %s\n' "$(tr -d '[:space:]' <"$BUNDLE_DIR/storage/public/object-count.txt")"
printf 'WARNING: Verification extracted production secrets into a protected temporary directory and removed it on exit.\n'
