#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command is missing: $1"
}

read_env_value() {
  local key="$1" line value
  line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$MIRAN_ENV_FILE" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 1
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ ${#value} -ge 2 ]]; then
    if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi
  printf '%s' "$value"
}

require_env_value() {
  local key="$1" value
  value="$(read_env_value "$key" || true)"
  [[ -n "$value" ]] || fail "Required production environment value is missing: $key"
  printf '%s' "$value"
}

aws_config_for() {
  local region="$1" force_path_style="$2" output="$3" addressing_style
  addressing_style="virtual"
  [[ "${force_path_style,,}" == "true" ]] && addressing_style="path"
  cat >"$output" <<CFG
[default]
region = ${region}
s3 =
    addressing_style = ${addressing_style}
CFG
  chmod 600 "$output"
}

aws_s3() {
  local config_file="$1" endpoint="$2" access_key="$3" secret_key="$4"
  shift 4
  AWS_CONFIG_FILE="$config_file" \
  AWS_ACCESS_KEY_ID="$access_key" \
  AWS_SECRET_ACCESS_KEY="$secret_key" \
  AWS_EC2_METADATA_DISABLED=true \
    aws --no-cli-pager --endpoint-url "$endpoint" "$@"
}

backup_bucket() {
  local label="$1" endpoint="$2" bucket="$3" region="$4" access_key="$5" secret_key="$6" force_path_style="$7" destination="$8"
  local config_file key_list key key_digest object_rel object_path head_line content_type metadata_sha actual_sha count

  [[ "$endpoint" == https://* ]] || fail "$label object storage endpoint must use HTTPS"
  mkdir -p "$destination/objects"
  : >"$destination/objects.tsv"

  config_file="$WORK_DIR/aws-${label}.config"
  aws_config_for "$region" "$force_path_style" "$config_file"

  aws_s3 "$config_file" "$endpoint" "$access_key" "$secret_key" s3api head-bucket --bucket "$bucket" >/dev/null
  key_list="$WORK_DIR/${label}-keys.txt"
  aws_s3 "$config_file" "$endpoint" "$access_key" "$secret_key" s3api list-objects-v2 \
    --bucket "$bucket" --query 'Contents[].Key' --output text | tr '\t' '\n' >"$key_list"

  count=0
  while IFS= read -r key; do
    [[ -n "$key" && "$key" != "None" ]] || continue
    [[ "$key" != *$'\t'* && "$key" != *$'\n'* ]] || fail "Unsupported object key contains a control separator"
    key_digest="$(printf '%s' "$key" | sha256sum | awk '{print $1}')"
    object_rel="objects/${key_digest}"
    object_path="$destination/$object_rel"

    aws_s3 "$config_file" "$endpoint" "$access_key" "$secret_key" s3api get-object \
      --bucket "$bucket" --key "$key" "$object_path" >/dev/null

    head_line="$(aws_s3 "$config_file" "$endpoint" "$access_key" "$secret_key" s3api head-object \
      --bucket "$bucket" --key "$key" --query '[ContentType,Metadata.sha256]' --output text)"
    content_type="${head_line%%$'\t'*}"
    metadata_sha="${head_line#*$'\t'}"
    [[ "$metadata_sha" != "$head_line" ]] || metadata_sha="None"
    [[ -n "$content_type" && "$content_type" != "None" ]] || content_type="application/octet-stream"
    [[ -n "$metadata_sha" ]] || metadata_sha="None"

    actual_sha="$(sha256sum "$object_path" | awk '{print $1}')"
    if [[ "$metadata_sha" != "None" && "$metadata_sha" != "$actual_sha" ]]; then
      fail "$label object hash metadata mismatch for key: $key"
    fi

    printf '%s\t%s\t%s\t%s\n' "$key" "$object_rel" "$content_type" "$metadata_sha" >>"$destination/objects.tsv"
    count=$((count + 1))
  done <"$key_list"

  printf '%s\n' "$count" >"$destination/object-count.txt"
  aws_s3 "$config_file" "$endpoint" "$access_key" "$secret_key" s3api list-objects-v2 \
    --bucket "$bucket" --output json >"$destination/bucket-inventory.json"
}

require_command git
require_command docker
require_command tar
require_command sha256sum
require_command awk
require_command grep
require_command aws
require_command tr

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Run this script from the Miran Shop repository"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

MIRAN_ENV_FILE="${MIRAN_ENV_FILE:-/etc/miran/production.env}"
MIRAN_BACKUP_DIR="${MIRAN_BACKUP_DIR:-/var/backups/miran/live}"
[[ -f "$MIRAN_ENV_FILE" ]] || fail "Production environment file not found: $MIRAN_ENV_FILE"
[[ -f infra/docker-compose.production.yml ]] || fail "Production compose file is missing"

if [[ -n "${MIRAN_BACKUP_TARGET_SHA:-}" ]]; then
  TARGET_SHA="$(git rev-parse "${MIRAN_BACKUP_TARGET_SHA}^{commit}")"
elif [[ -s .miran-deployed-sha ]]; then
  TARGET_SHA="$(tr -d '[:space:]' < .miran-deployed-sha)"
  TARGET_SHA="$(git rev-parse "${TARGET_SHA}^{commit}")"
else
  fail "No deployed SHA marker found. Set MIRAN_BACKUP_TARGET_SHA explicitly only after verifying the live runtime."
fi

TOOLING_SHA="${MIRAN_BACKUP_TOOLING_SHA:-$(git rev-parse HEAD)}"
TOOLING_SHA="$(git rev-parse "${TOOLING_SHA}^{commit}")"

git cat-file -e "${TARGET_SHA}^{commit}" 2>/dev/null || fail "Production commit is unavailable locally: $TARGET_SHA"
git cat-file -e "${TOOLING_SHA}^{commit}" 2>/dev/null || fail "Backup tooling commit is unavailable locally: $TOOLING_SHA"
for tooling_path in infra/backup/restore-full-live-backup.sh infra/backup/verify-full-live-backup.sh; do
  git cat-file -e "${TOOLING_SHA}:${tooling_path}" 2>/dev/null || fail "Backup tooling file is missing from tooling commit: $tooling_path"
done

TARGET_COMPOSE_BLOB="$(git rev-parse "${TARGET_SHA}:infra/docker-compose.production.yml")"
CURRENT_COMPOSE_BLOB="$(git hash-object infra/docker-compose.production.yml)"
[[ "$TARGET_COMPOSE_BLOB" == "$CURRENT_COMPOSE_BLOB" ]] || fail "Current production compose differs from the deployed commit. Use the deployed checkout before backup."

COMPOSE=(docker compose --env-file "$MIRAN_ENV_FILE" -f infra/docker-compose.production.yml)
EXPECTED_SERVICES=(web api-gateway auth-service catalog-service admin-service postgres redis caddy)
mapfile -t ACTUAL_SERVICES < <("${COMPOSE[@]}" config --services | LC_ALL=C sort)
mapfile -t EXPECTED_SORTED < <(printf '%s\n' "${EXPECTED_SERVICES[@]}" | LC_ALL=C sort)
[[ "${ACTUAL_SERVICES[*]}" == "${EXPECTED_SORTED[*]}" ]] || fail "Production compose does not contain exactly the approved eight services"

mapfile -t RUNNING_SERVICES < <("${COMPOSE[@]}" ps --services --status running | LC_ALL=C sort)
[[ "${RUNNING_SERVICES[*]}" == "${EXPECTED_SORTED[*]}" ]] || fail "All eight production services must be running before a live backup"

PRIVATE_ENDPOINT="$(require_env_value MIRAN_OBJECT_STORAGE_ENDPOINT)"
PRIVATE_BUCKET="$(require_env_value MIRAN_OBJECT_STORAGE_BUCKET)"
PRIVATE_REGION="$(read_env_value MIRAN_OBJECT_STORAGE_REGION || printf 'auto')"
PRIVATE_ACCESS_KEY="$(require_env_value MIRAN_OBJECT_STORAGE_ACCESS_KEY_ID)"
PRIVATE_SECRET_KEY="$(require_env_value MIRAN_OBJECT_STORAGE_SECRET_ACCESS_KEY)"
PRIVATE_FORCE_PATH_STYLE="$(read_env_value MIRAN_OBJECT_STORAGE_FORCE_PATH_STYLE || printf 'false')"

PUBLIC_ENDPOINT="$(require_env_value MIRAN_PUBLIC_MEDIA_ENDPOINT)"
PUBLIC_BUCKET="$(require_env_value MIRAN_PUBLIC_MEDIA_BUCKET)"
PUBLIC_REGION="$(read_env_value MIRAN_PUBLIC_MEDIA_REGION || printf 'auto')"
PUBLIC_ACCESS_KEY="$(require_env_value MIRAN_PUBLIC_MEDIA_ACCESS_KEY_ID)"
PUBLIC_SECRET_KEY="$(require_env_value MIRAN_PUBLIC_MEDIA_SECRET_ACCESS_KEY)"
PUBLIC_FORCE_PATH_STYLE="$(read_env_value MIRAN_PUBLIC_MEDIA_FORCE_PATH_STYLE || printf 'false')"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$MIRAN_BACKUP_DIR"
chmod 700 "$MIRAN_BACKUP_DIR"
BUNDLE_NAME="miran-live-${timestamp}-${TARGET_SHA:0:12}"
BUNDLE_DIR="${MIRAN_BACKUP_DIR%/}/${BUNDLE_NAME}"
ARCHIVE_PATH="${BUNDLE_DIR}.tar.gz"
WORK_DIR="${BUNDLE_DIR}.work"
umask 077
mkdir -p "$BUNDLE_DIR" "$WORK_DIR" "$BUNDLE_DIR/source" "$BUNDLE_DIR/database" "$BUNDLE_DIR/redis" "$BUNDLE_DIR/config/exact-production" "$BUNDLE_DIR/tools" "$BUNDLE_DIR/secrets" "$BUNDLE_DIR/storage/private" "$BUNDLE_DIR/storage/public"
trap 'rm -rf "$WORK_DIR"' EXIT

printf '%s\n' "$TARGET_SHA" >"$BUNDLE_DIR/source/PRODUCTION_COMMIT"
git archive --format=tar.gz --output "$BUNDLE_DIR/source/miran-source-${TARGET_SHA}.tar.gz" "$TARGET_SHA"

git show "${TARGET_SHA}:infra/docker-compose.production.yml" >"$BUNDLE_DIR/config/docker-compose.production.yml"
git show "${TARGET_SHA}:infra/caddy/Caddyfile" >"$BUNDLE_DIR/config/Caddyfile"
git show "${TARGET_SHA}:infra/postgres/backup.sh" >"$BUNDLE_DIR/config/postgres-backup.sh"
git show "${TARGET_SHA}:infra/postgres/restore.sh" >"$BUNDLE_DIR/config/postgres-restore.sh"
git archive --format=tar "$TARGET_SHA" infra services/marketplace-core/migrations services/marketplace-core/postgres/migrations | tar -C "$BUNDLE_DIR/config/exact-production" -xf -
git show "${TOOLING_SHA}:infra/backup/restore-full-live-backup.sh" >"$BUNDLE_DIR/tools/restore-full-live-backup.sh"
git show "${TOOLING_SHA}:infra/backup/verify-full-live-backup.sh" >"$BUNDLE_DIR/tools/verify-full-live-backup.sh"
chmod 700 "$BUNDLE_DIR/tools/restore-full-live-backup.sh" "$BUNDLE_DIR/tools/verify-full-live-backup.sh"
cp "$MIRAN_ENV_FILE" "$BUNDLE_DIR/secrets/production.env"
chmod 600 "$BUNDLE_DIR/secrets/production.env"

"${COMPOSE[@]}" exec -T postgres sh -ec \
  'exec pg_dump --format=custom --compress=6 --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  >"$BUNDLE_DIR/database/postgres.dump"
[[ -s "$BUNDLE_DIR/database/postgres.dump" ]] || fail "PostgreSQL dump is empty"
cat "$BUNDLE_DIR/database/postgres.dump" | "${COMPOSE[@]}" exec -T postgres pg_restore --list >/dev/null
sha256sum "$BUNDLE_DIR/database/postgres.dump" >"$BUNDLE_DIR/database/postgres.dump.sha256"

"${COMPOSE[@]}" exec -T redis sh -ec \
  'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" SAVE >/dev/null; cat /data/dump.rdb' \
  >"$BUNDLE_DIR/redis/dump.rdb"
[[ -s "$BUNDLE_DIR/redis/dump.rdb" ]] || fail "Redis RDB snapshot is empty"

backup_bucket private "$PRIVATE_ENDPOINT" "$PRIVATE_BUCKET" "$PRIVATE_REGION" "$PRIVATE_ACCESS_KEY" "$PRIVATE_SECRET_KEY" "$PRIVATE_FORCE_PATH_STYLE" "$BUNDLE_DIR/storage/private"
backup_bucket public "$PUBLIC_ENDPOINT" "$PUBLIC_BUCKET" "$PUBLIC_REGION" "$PUBLIC_ACCESS_KEY" "$PUBLIC_SECRET_KEY" "$PUBLIC_FORCE_PATH_STYLE" "$BUNDLE_DIR/storage/public"

cat >"$BUNDLE_DIR/BACKUP_INFO" <<INFO
created_at_utc=${timestamp}
production_commit=${TARGET_SHA}
services=web,api-gateway,auth-service,catalog-service,admin-service,postgres,redis,caddy
contains_production_secrets=true
backup_tooling_commit=${TOOLING_SHA}
private_storage_bucket=${PRIVATE_BUCKET}
public_storage_bucket=${PUBLIC_BUCKET}
INFO

(
  cd "$BUNDLE_DIR"
  find . -type f ! -name SHA256SUMS -print | LC_ALL=C sort | while IFS= read -r file; do
    sha256sum "$file"
  done >SHA256SUMS
)

tar -C "$MIRAN_BACKUP_DIR" -czf "$ARCHIVE_PATH" "$BUNDLE_NAME"
chmod 600 "$ARCHIVE_PATH"
(
  cd "$MIRAN_BACKUP_DIR"
  sha256sum "$(basename "$ARCHIVE_PATH")" >"$(basename "$ARCHIVE_PATH").sha256"
)
chmod 600 "${ARCHIVE_PATH}.sha256"

if [[ -n "${MIRAN_BACKUP_RESULT_FILE:-}" ]]; then
  mkdir -p "$(dirname "$MIRAN_BACKUP_RESULT_FILE")"
  printf '%s\n' "$ARCHIVE_PATH" >"$MIRAN_BACKUP_RESULT_FILE"
  chmod 600 "$MIRAN_BACKUP_RESULT_FILE"
fi

if [[ "${MIRAN_BACKUP_KEEP_DIRECTORY:-false}" != "true" ]]; then
  rm -rf "$BUNDLE_DIR"
fi

printf 'Full live backup created:\n%s\n' "$ARCHIVE_PATH"
printf 'Archive checksum:\n%s\n' "${ARCHIVE_PATH}.sha256"
printf 'Production commit:\n%s\n' "$TARGET_SHA"
printf 'Backup tooling commit:\n%s\n' "$TOOLING_SHA"
printf 'WARNING: The archive contains production secrets. Transfer/store it only through encrypted, access-controlled storage.\n'
