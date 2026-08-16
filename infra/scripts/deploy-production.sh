#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  printf 'DEPLOY_FAIL: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command is missing: $1"
}

read_env_value() {
  local key="$1" line value
  line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$ENV_FILE" | tail -n 1 || true)"
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
  [[ -n "$value" ]] || fail "required production environment value is missing: $key"
  printf '%s' "$value"
}

TARGET_SHA_INPUT="${1:?target commit SHA is required}"
ENV_FILE="${MIRAN_ENV_FILE:-/etc/miran/production.env}"
BACKUP_DIR="${MIRAN_BACKUP_DIR:-/var/backups/miran}"
ALLOW_INITIAL_EMPTY_HOST="${MIRAN_ALLOW_INITIAL_EMPTY_HOST:-false}"
COMPOSE_FILE="infra/docker-compose.production.yml"
EXPECTED_SERVICES=(admin-service api-gateway auth-service caddy catalog-service postgres redis web)

require_command git
require_command docker
require_command grep
require_command awk
require_command sha256sum
require_command mktemp
require_command stat
require_command tr

[[ -f "$ENV_FILE" ]] || fail "production env file not found: $ENV_FILE"
[[ -f "$COMPOSE_FILE" ]] || fail "run this script from the Miran repository root"
case "$TARGET_SHA_INPUT" in
  *[!0-9a-fA-F]*|'') fail "target must be a hexadecimal git commit SHA" ;;
esac
[[ ${#TARGET_SHA_INPUT} -ge 7 && ${#TARGET_SHA_INPUT} -le 40 ]] || fail "target git SHA length is invalid"
case "$(stat -c '%a' "$ENV_FILE")" in
  400|600) ;;
  *) fail "production env file permissions must be 400 or 600" ;;
esac

POSTGRES_PASSWORD="$(require_env_value POSTGRES_PASSWORD)"
REDIS_PASSWORD="$(require_env_value REDIS_PASSWORD)"
MIRAN_PUBLIC_URL="$(require_env_value MIRAN_PUBLIC_URL)"
MIRAN_SITE_ADDRESS="$(require_env_value MIRAN_SITE_ADDRESS)"
MIRAN_WWW_SITE_ADDRESS="$(require_env_value MIRAN_WWW_SITE_ADDRESS)"
MIRAN_CANONICAL_URL="$(require_env_value MIRAN_CANONICAL_URL)"
SITE_INDEXABLE="$(require_env_value SITE_INDEXABLE)"
ZARINPAL_SANDBOX="$(require_env_value ZARINPAL_SANDBOX)"
PRIVATE_ENDPOINT="$(require_env_value MIRAN_OBJECT_STORAGE_ENDPOINT)"
PRIVATE_BUCKET="$(require_env_value MIRAN_OBJECT_STORAGE_BUCKET)"
PRIVATE_ACCESS_KEY="$(require_env_value MIRAN_OBJECT_STORAGE_ACCESS_KEY_ID)"
PRIVATE_SECRET_KEY="$(require_env_value MIRAN_OBJECT_STORAGE_SECRET_ACCESS_KEY)"
PUBLIC_ENDPOINT="$(require_env_value MIRAN_PUBLIC_MEDIA_ENDPOINT)"
PUBLIC_BUCKET="$(require_env_value MIRAN_PUBLIC_MEDIA_BUCKET)"
PUBLIC_ACCESS_KEY="$(require_env_value MIRAN_PUBLIC_MEDIA_ACCESS_KEY_ID)"
PUBLIC_SECRET_KEY="$(require_env_value MIRAN_PUBLIC_MEDIA_SECRET_ACCESS_KEY)"
PUBLIC_BASE_URL="$(require_env_value MIRAN_PUBLIC_MEDIA_BASE_URL)"

[[ "$MIRAN_PUBLIC_URL" == "https://almiran.ir" ]] || fail "MIRAN_PUBLIC_URL must be https://almiran.ir"
[[ "$MIRAN_SITE_ADDRESS" == "almiran.ir" ]] || fail "MIRAN_SITE_ADDRESS must be almiran.ir"
[[ "$MIRAN_WWW_SITE_ADDRESS" == "www.almiran.ir" ]] || fail "MIRAN_WWW_SITE_ADDRESS must be www.almiran.ir"
[[ "$MIRAN_CANONICAL_URL" == "https://almiran.ir" ]] || fail "MIRAN_CANONICAL_URL must be https://almiran.ir"
[[ "${SITE_INDEXABLE,,}" == "false" ]] || fail "SITE_INDEXABLE must remain false until live verification is complete"
[[ "${ZARINPAL_SANDBOX,,}" == "true" ]] || fail "ZARINPAL_SANDBOX must remain true during production rollout"
[[ "$PRIVATE_ENDPOINT" == https://* ]] || fail "private object storage endpoint must use HTTPS"
[[ "$PUBLIC_ENDPOINT" == https://* ]] || fail "public media storage endpoint must use HTTPS"
[[ "$PUBLIC_BASE_URL" == https://* ]] || fail "public media base URL must use HTTPS"
# Required values above are intentionally assigned but never printed.
: "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" "$PRIVATE_BUCKET" "$PRIVATE_ACCESS_KEY" "$PRIVATE_SECRET_KEY" "$PUBLIC_BUCKET" "$PUBLIC_ACCESS_KEY" "$PUBLIC_SECRET_KEY"

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  fail "remote deployment checkout has local modifications"
fi

git fetch --prune origin main
FETCHED_MAIN_SHA="$(git rev-parse FETCH_HEAD)"
TARGET_SHA="$(git rev-parse "${TARGET_SHA_INPUT}^{commit}")"
git cat-file -e "${TARGET_SHA}^{commit}" 2>/dev/null || fail "target commit is not available after fetch: $TARGET_SHA_INPUT"
[[ "$TARGET_SHA" == "$FETCHED_MAIN_SHA" ]] || fail "target commit must equal the freshly fetched origin main commit"

for required_path in \
  infra/docker-compose.production.yml \
  infra/scripts/inspect-production.sh \
  infra/backup/create-full-live-backup.sh \
  infra/backup/verify-full-live-backup.sh; do
  git cat-file -e "${TARGET_SHA}:${required_path}" 2>/dev/null || fail "target commit is missing required production tooling: $required_path"
done

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

mapfile -t EXPECTED_SORTED < <(printf '%s\n' "${EXPECTED_SERVICES[@]}" | LC_ALL=C sort)
mapfile -t CURRENT_CONFIGURED < <(compose config --services | awk 'NF' | LC_ALL=C sort)
[[ "${CURRENT_CONFIGURED[*]}" == "${EXPECTED_SORTED[*]}" ]] || fail "current production checkout does not contain exactly the approved eight services"

current_sha="$(git rev-parse HEAD)"
mapfile -t RUNNING_SERVICES < <(compose ps --services --status running | awk 'NF' | LC_ALL=C sort)
mapfile -t EXISTING_CONTAINERS < <(compose ps -a -q | awk 'NF')
running_count="${#RUNNING_SERVICES[@]}"
existing_count="${#EXISTING_CONTAINERS[@]}"

TMP_DIR="$(mktemp -d)"
chmod 700 "$TMP_DIR"
trap 'rm -rf "$TMP_DIR"' EXIT
FULL_BACKUP_ARCHIVE=""

if [[ "$running_count" -eq 8 ]]; then
  [[ "${RUNNING_SERVICES[*]}" == "${EXPECTED_SORTED[*]}" ]] || fail "running service set is not exactly the approved eight services"

  git show "${TARGET_SHA}:infra/scripts/inspect-production.sh" >"$TMP_DIR/inspect-production.sh"
  chmod 700 "$TMP_DIR/inspect-production.sh"
  printf 'Running read-only production preflight before backup/deploy...\n'
  MIRAN_ENV_FILE="$ENV_FILE" \
  MIRAN_PRODUCTION_REPO_ROOT="$PWD" \
  MIRAN_ALLOW_ZARINPAL_PRODUCTION=false \
    bash "$TMP_DIR/inspect-production.sh"

  git show "${TARGET_SHA}:infra/backup/create-full-live-backup.sh" >"$TMP_DIR/create-full-live-backup.sh"
  git show "${TARGET_SHA}:infra/backup/verify-full-live-backup.sh" >"$TMP_DIR/verify-full-live-backup.sh"
  chmod 700 "$TMP_DIR/create-full-live-backup.sh" "$TMP_DIR/verify-full-live-backup.sh"

  printf 'Creating mandatory full live backup before production change...\n'
  MIRAN_ENV_FILE="$ENV_FILE" \
  MIRAN_BACKUP_DIR="${BACKUP_DIR%/}/live" \
  MIRAN_BACKUP_TOOLING_SHA="$TARGET_SHA" \
  MIRAN_BACKUP_RESULT_FILE="$TMP_DIR/full-backup-path" \
    bash "$TMP_DIR/create-full-live-backup.sh"

  [[ -s "$TMP_DIR/full-backup-path" ]] || fail "full live backup did not publish its archive path"
  FULL_BACKUP_ARCHIVE="$(tr -d '\r\n' <"$TMP_DIR/full-backup-path")"
  [[ -f "$FULL_BACKUP_ARCHIVE" ]] || fail "full live backup archive is missing after creation"
  [[ -f "${FULL_BACKUP_ARCHIVE}.sha256" ]] || fail "full live backup archive checksum is missing"

  MIRAN_BACKUP_ARCHIVE="$FULL_BACKUP_ARCHIVE" bash "$TMP_DIR/verify-full-live-backup.sh"
  printf 'Mandatory full live backup verified: %s\n' "$FULL_BACKUP_ARCHIVE"
elif [[ "$running_count" -eq 0 ]]; then
  [[ "$existing_count" -eq 0 ]] || fail "no services are running but stopped production containers exist; refusing to treat host as initial/empty"

  for logical_volume in miran_postgres_data miran_redis_data miran_caddy_data miran_caddy_config; do
    if [[ -n "$(docker volume ls --filter "label=com.docker.compose.volume=${logical_volume}" -q)" ]]; then
      fail "existing Miran Docker volume detected (${logical_volume}); full backup is required before deployment"
    fi
  done

  [[ "${ALLOW_INITIAL_EMPTY_HOST,,}" == "true" ]] || fail "no current runtime detected; initial empty-host deployment requires MIRAN_ALLOW_INITIAL_EMPTY_HOST=true"
  printf 'Initial empty-host deployment explicitly allowed. No existing Miran containers/volumes are present on this target host.\n'
else
  fail "partial production runtime detected (${running_count}/8 services running); repair or inspect it before deployment"
fi

git checkout --detach "$TARGET_SHA"

[[ -f "$COMPOSE_FILE" ]] || fail "target commit does not contain the production compose file"
mapfile -t TARGET_SERVICES < <(compose config --services | awk 'NF' | LC_ALL=C sort)
[[ "${TARGET_SERVICES[*]}" == "${EXPECTED_SORTED[*]}" ]] || fail "target production compose does not contain exactly the approved eight services"

compose up -d --build --remove-orphans

ready=0
for _ in {1..90}; do
  if compose exec -T api-gateway node -e \
    "fetch('http://127.0.0.1:3001/health').then(async r=>{if(!r.ok)process.exit(1);const j=await r.json();if(!j.ok||j.redis!=='ready')process.exit(1)}).catch(()=>process.exit(1))" \
    >/dev/null 2>&1 \
    && compose exec -T web node -e \
    "fetch('http://127.0.0.1:3000/').then(r=>{if(r.status>=500)process.exit(1)}).catch(()=>process.exit(1))" \
    >/dev/null 2>&1 \
    && compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done

if [[ "$ready" -ne 1 ]]; then
  printf 'Eight-service production smoke check failed. Current containers:\n' >&2
  compose ps >&2 || true
  compose logs --no-color --tail=200 \
    caddy web api-gateway auth-service catalog-service admin-service redis postgres >&2 || true
  printf 'Application rollback can use previous commit: %s\n' "$current_sha" >&2
  if [[ -n "$FULL_BACKUP_ARCHIVE" ]]; then
    printf 'Verified pre-deploy full live backup: %s\n' "$FULL_BACKUP_ARCHIVE" >&2
  fi
  exit 1
fi

mapfile -t FINAL_RUNNING < <(compose ps --status running --services | awk 'NF' | LC_ALL=C sort)
[[ "${FINAL_RUNNING[*]}" == "${EXPECTED_SORTED[*]}" ]] || fail "final running service set is not exactly the approved eight services"

api_health="$(compose exec -T api-gateway node -e "fetch('http://127.0.0.1:3001/health').then(async r=>{if(!r.ok)process.exit(1);process.stdout.write(await r.text())}).catch(()=>process.exit(1))")"
printf '%s' "$api_health" | grep -q '"service":"api-gateway"'
printf '%s' "$api_health" | grep -q '"redis":"ready"'
printf '%s' "$api_health" | grep -q '"auth":"auth-service"'
printf '%s' "$api_health" | grep -q '"catalog":"catalog-service"'
printf '%s' "$api_health" | grep -q '"admin":"admin-service"'

printf '%s\n' "$TARGET_SHA" >.miran-deployed-sha
chmod 600 .miran-deployed-sha

printf 'Miran eight-service deployment healthy at commit %s\n' "$TARGET_SHA"
if [[ -n "$FULL_BACKUP_ARCHIVE" ]]; then
  printf 'Pre-deploy full live backup retained at: %s\n' "$FULL_BACKUP_ARCHIVE"
fi
