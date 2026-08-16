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
  [[ -n "$value" ]] || fail "Required target environment value is missing: $key"
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

assert_bucket_empty() {
  local config_file="$1" endpoint="$2" access_key="$3" secret_key="$4" bucket="$5" first_key
  first_key="$(aws_s3 "$config_file" "$endpoint" "$access_key" "$secret_key" s3api list-objects-v2 \
    --bucket "$bucket" --max-keys 1 --query 'Contents[0].Key' --output text)"
  if [[ -n "$first_key" && "$first_key" != "None" && "${MIRAN_RESTORE_ALLOW_NONEMPTY_OBJECT_STORAGE:-false}" != "true" ]]; then
    fail "Target bucket is not empty: $bucket. Refusing to overwrite existing objects."
  fi
}

restore_bucket() {
  local label="$1" source_dir="$2" endpoint="$3" bucket="$4" region="$5" access_key="$6" secret_key="$7" force_path_style="$8"
  local config_file key object_rel expected_object_rel content_type metadata_sha object_path actual_sha uploaded_length uploaded_meta expected_size
  local -a put_args

  [[ "$endpoint" == https://* ]] || fail "$label object storage endpoint must use HTTPS"
  [[ -f "$source_dir/objects.tsv" ]] || fail "Missing $label object inventory"

  config_file="$WORK_DIR/aws-${label}.config"
  aws_config_for "$region" "$force_path_style" "$config_file"
  aws_s3 "$config_file" "$endpoint" "$access_key" "$secret_key" s3api head-bucket --bucket "$bucket" >/dev/null
  assert_bucket_empty "$config_file" "$endpoint" "$access_key" "$secret_key" "$bucket"

  while IFS=$'\t' read -r key object_rel content_type metadata_sha; do
    [[ -n "$key" ]] || continue
    expected_object_rel="objects/$(printf '%s' "$key" | sha256sum | awk '{print $1}')"
    [[ "$object_rel" == "$expected_object_rel" ]] || fail "$label object payload mapping is invalid for key: $key"
    object_path="$source_dir/$object_rel"
    [[ -f "$object_path" ]] || fail "Missing object payload for key: $key"
    actual_sha="$(sha256sum "$object_path" | awk '{print $1}')"
    if [[ "$metadata_sha" != "None" && -n "$metadata_sha" && "$metadata_sha" != "$actual_sha" ]]; then
      fail "$label object SHA-256 metadata mismatch before restore: $key"
    fi

    put_args=(s3api put-object --bucket "$bucket" --key "$key" --body "$object_path" --content-type "$content_type")
    if [[ "$metadata_sha" != "None" && -n "$metadata_sha" ]]; then
      put_args+=(--metadata "sha256=$metadata_sha")
    fi
    aws_s3 "$config_file" "$endpoint" "$access_key" "$secret_key" "${put_args[@]}" >/dev/null

    expected_size="$(wc -c <"$object_path" | tr -d '[:space:]')"
    uploaded_length="$(aws_s3 "$config_file" "$endpoint" "$access_key" "$secret_key" s3api head-object \
      --bucket "$bucket" --key "$key" --query 'ContentLength' --output text)"
    [[ "$uploaded_length" == "$expected_size" ]] || fail "$label restored object size mismatch: $key"
    if [[ "$metadata_sha" != "None" && -n "$metadata_sha" ]]; then
      uploaded_meta="$(aws_s3 "$config_file" "$endpoint" "$access_key" "$secret_key" s3api head-object \
        --bucket "$bucket" --key "$key" --query 'Metadata.sha256' --output text)"
      [[ "$uploaded_meta" == "$metadata_sha" ]] || fail "$label restored object metadata mismatch: $key"
    fi
  done <"$source_dir/objects.tsv"
}

[[ "${MIRAN_RESTORE_APPLY:-false}" == "true" ]] || fail "Restore is disabled by default. Set MIRAN_RESTORE_APPLY=true on the isolated target host."
[[ "${MIRAN_RESTORE_TARGET:-}" == "NEW_HOST" ]] || fail "Set MIRAN_RESTORE_TARGET=NEW_HOST. This restore must not run against the current production host."

require_command docker
require_command sha256sum
require_command awk
require_command grep
require_command aws
require_command cmp

BACKUP_DIR="${MIRAN_BACKUP_DIR:?Set MIRAN_BACKUP_DIR to the extracted full live backup directory}"
[[ -d "$BACKUP_DIR" ]] || fail "Backup directory not found: $BACKUP_DIR"
[[ -f "$BACKUP_DIR/SHA256SUMS" ]] || fail "Backup manifest is missing"
[[ -f "$BACKUP_DIR/source/PRODUCTION_COMMIT" ]] || fail "Production commit marker is missing"
[[ -f "$BACKUP_DIR/database/postgres.dump" ]] || fail "PostgreSQL dump is missing"
[[ -f "$BACKUP_DIR/secrets/production.env" ]] || fail "Production environment backup is missing"

(
  cd "$BACKUP_DIR"
  sha256sum -c SHA256SUMS
)

MIRAN_RESTORE_REPO_ROOT="${MIRAN_RESTORE_REPO_ROOT:-$PWD}"
[[ -f "$MIRAN_RESTORE_REPO_ROOT/infra/docker-compose.production.yml" ]] || fail "Target source tree is missing production compose"
cmp -s "$BACKUP_DIR/config/docker-compose.production.yml" "$MIRAN_RESTORE_REPO_ROOT/infra/docker-compose.production.yml" || \
  fail "Target production compose does not match the backed-up production commit"

MIRAN_ENV_FILE="${MIRAN_ENV_FILE:-/etc/miran/production.env}"
if [[ "${MIRAN_RESTORE_INSTALL_ENV:-false}" == "true" ]]; then
  if [[ -e "$MIRAN_ENV_FILE" && "${MIRAN_RESTORE_OVERWRITE_ENV:-false}" != "true" ]]; then
    fail "Target env file already exists. Refusing to overwrite: $MIRAN_ENV_FILE"
  fi
  mkdir -p "$(dirname "$MIRAN_ENV_FILE")"
  if [[ -e "$MIRAN_ENV_FILE" ]]; then
    cp "$MIRAN_ENV_FILE" "${MIRAN_ENV_FILE}.pre-restore-$(date -u +%Y%m%dT%H%M%SZ)"
  fi
  cp "$BACKUP_DIR/secrets/production.env" "$MIRAN_ENV_FILE"
  chmod 600 "$MIRAN_ENV_FILE"
fi
[[ -f "$MIRAN_ENV_FILE" ]] || fail "Target production env file is missing. Install it explicitly before restore."

cd "$MIRAN_RESTORE_REPO_ROOT"
COMPOSE=(docker compose --env-file "$MIRAN_ENV_FILE" -f infra/docker-compose.production.yml)
EXPECTED_SERVICES=(web api-gateway auth-service catalog-service admin-service postgres redis caddy)
mapfile -t ACTUAL_SERVICES < <("${COMPOSE[@]}" config --services | LC_ALL=C sort)
mapfile -t EXPECTED_SORTED < <(printf '%s\n' "${EXPECTED_SERVICES[@]}" | LC_ALL=C sort)
[[ "${ACTUAL_SERVICES[*]}" == "${EXPECTED_SORTED[*]}" ]] || fail "Target compose does not contain exactly the approved eight services"

if "${COMPOSE[@]}" ps --services --status running | grep -Eq '^(web|api-gateway|auth-service|catalog-service|admin-service|caddy)$'; then
  fail "Application/edge services are already running. Restore must occur on an isolated new host before cutover."
fi

"${COMPOSE[@]}" up -d postgres redis

POSTGRES_READY=false
for _ in {1..60}; do
  if "${COMPOSE[@]}" exec -T postgres sh -ec 'pg_isready --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' >/dev/null 2>&1; then
    POSTGRES_READY=true
    break
  fi
  sleep 1
done
[[ "$POSTGRES_READY" == "true" ]] || fail "PostgreSQL did not become ready on the isolated restore host"

TABLE_COUNT="$("${COMPOSE[@]}" exec -T postgres sh -ec \
  'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --tuples-only --no-align -c "SELECT count(*) FROM pg_tables WHERE schemaname = '\''public'\'';"' \
  | tr -d '[:space:]')"
if [[ "$TABLE_COUNT" != "0" && "${MIRAN_RESTORE_ALLOW_NONEMPTY_DATABASE:-false}" != "true" ]]; then
  fail "Target database is not empty (${TABLE_COUNT} public tables). Refusing destructive restore."
fi

cat "$BACKUP_DIR/database/postgres.dump" | "${COMPOSE[@]}" exec -T postgres sh -ec \
  'exec pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error --single-transaction --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" -'

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

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
restore_bucket private "$BACKUP_DIR/storage/private" "$PRIVATE_ENDPOINT" "$PRIVATE_BUCKET" "$PRIVATE_REGION" "$PRIVATE_ACCESS_KEY" "$PRIVATE_SECRET_KEY" "$PRIVATE_FORCE_PATH_STYLE"
restore_bucket public "$BACKUP_DIR/storage/public" "$PUBLIC_ENDPOINT" "$PUBLIC_BUCKET" "$PUBLIC_REGION" "$PUBLIC_ACCESS_KEY" "$PUBLIC_SECRET_KEY" "$PUBLIC_FORCE_PATH_STYLE"

printf 'Database and object storage restore completed on the isolated new host.\n'
printf 'Production commit to deploy: %s\n' "$(tr -d '[:space:]' <"$BACKUP_DIR/source/PRODUCTION_COMMIT")"
printf 'Redis RDB snapshot is preserved in the backup but is intentionally not restored: current Redis state is rate-limit/transient data.\n'
printf 'Do not point DNS at this host until deployment, health checks, payment sandbox, and live verification pass.\n'
