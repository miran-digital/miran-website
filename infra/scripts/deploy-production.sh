#!/bin/sh
set -eu

TARGET_SHA="${1:?target commit SHA is required}"
ENV_FILE="${MIRAN_ENV_FILE:-/etc/miran/production.env}"
BACKUP_DIR="${MIRAN_BACKUP_DIR:-/var/backups/miran}"
COMPOSE_FILE="infra/docker-compose.production.yml"
EXPECTED_SERVICES="admin-service api-gateway auth-service caddy catalog-service postgres redis web"

if [ ! -f "$ENV_FILE" ]; then
  echo "Production env file not found: $ENV_FILE" >&2
  exit 1
fi
if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Run this script from the Miran repository root." >&2
  exit 1
fi
case "$TARGET_SHA" in
  *[!0-9a-fA-F]*|'')
    echo "Target must be a hexadecimal git commit SHA." >&2
    exit 1
    ;;
esac
if [ "${#TARGET_SHA}" -lt 7 ] || [ "${#TARGET_SHA}" -gt 40 ]; then
  echo "Target git SHA length is invalid." >&2
  exit 1
fi

umask 077
mkdir -p "$BACKUP_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Remote deployment checkout has local modifications; refusing deployment." >&2
  exit 1
fi

git fetch --prune origin main
if ! git cat-file -e "${TARGET_SHA}^{commit}" 2>/dev/null; then
  echo "Target commit is not available after fetch: $TARGET_SHA" >&2
  exit 1
fi

current_sha="$(git rev-parse HEAD)"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${BACKUP_DIR%/}/miran-predeploy-${timestamp}-${current_sha}.dump"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

if [ -n "$(compose ps -q postgres 2>/dev/null || true)" ]; then
  echo "Creating pre-deploy PostgreSQL backup..."
  compose exec -T postgres sh -ec \
    'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=6 --no-owner --no-acl' \
    > "$backup_file"
  test -s "$backup_file"
  sha256sum "$backup_file" > "${backup_file}.sha256"
  chmod 600 "$backup_file" "${backup_file}.sha256"
  echo "Backup created: $backup_file"
else
  echo "No running PostgreSQL container found; this appears to be the initial deployment."
fi

git checkout --detach "$TARGET_SHA"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Target commit does not contain the production compose file." >&2
  git checkout --detach "$current_sha" || true
  exit 1
fi

actual_services="$(compose config --services | sort | tr '\n' ' ' | sed 's/ $//')"
if [ "$actual_services" != "$EXPECTED_SERVICES" ]; then
  echo "Production compose service set is invalid." >&2
  echo "Expected: $EXPECTED_SERVICES" >&2
  echo "Actual:   $actual_services" >&2
  exit 1
fi

compose up -d --build --remove-orphans

ready=0
attempt=1
while [ "$attempt" -le 90 ]; do
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
  attempt=$((attempt + 1))
done

if [ "$ready" -ne 1 ]; then
  echo "Eight-service production smoke check failed. Current containers:" >&2
  compose ps >&2 || true
  compose logs --no-color --tail=200 \
    caddy web api-gateway auth-service catalog-service admin-service redis postgres >&2 || true
  echo "Application rollback can use previous commit: $current_sha" >&2
  if [ -s "$backup_file" ]; then
    echo "Pre-deploy DB backup: $backup_file" >&2
  fi
  exit 1
fi

running_count="$(compose ps --status running --services | wc -l | tr -d ' ')"
if [ "$running_count" -ne 8 ]; then
  echo "Expected 8 running production services, found $running_count" >&2
  compose ps >&2
  exit 1
fi

api_health="$(compose exec -T api-gateway node -e "fetch('http://127.0.0.1:3001/health').then(async r=>{if(!r.ok)process.exit(1);process.stdout.write(await r.text())}).catch(()=>process.exit(1))")"
printf '%s' "$api_health" | grep -q '"service":"api-gateway"'
printf '%s' "$api_health" | grep -q '"redis":"ready"'
printf '%s' "$api_health" | grep -q '"auth":"auth-service"'
printf '%s' "$api_health" | grep -q '"catalog":"catalog-service"'
printf '%s' "$api_health" | grep -q '"admin":"admin-service"'

printf '%s\n' "$TARGET_SHA" > .miran-deployed-sha
chmod 600 .miran-deployed-sha

echo "Miran eight-service deployment healthy at commit $TARGET_SHA"
