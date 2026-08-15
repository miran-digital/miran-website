#!/bin/sh
set -eu

TARGET_SHA="${1:?target commit SHA is required}"
ENV_FILE="${MIRAN_ENV_FILE:-/etc/miran/production.env}"
BACKUP_DIR="${MIRAN_BACKUP_DIR:-/var/backups/miran}"
COMPOSE_FILE="infra/docker-compose.production.yml"

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

# Re-evaluate the target compose file after checkout.
if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Target commit does not contain the production compose file." >&2
  git checkout --detach "$current_sha" || true
  exit 1
fi

compose up -d --build --remove-orphans

ready=0
attempt=1
while [ "$attempt" -le 60 ]; do
  web_binding="$(compose port web 3000 2>/dev/null | head -n 1 || true)"
  if [ -n "$web_binding" ] && curl -fsS --max-time 5 "http://${web_binding}/" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
  attempt=$((attempt + 1))
done

if [ "$ready" -ne 1 ]; then
  echo "Production smoke check failed. Current containers:" >&2
  compose ps >&2 || true
  compose logs --no-color --tail=200 web marketplace-core >&2 || true
  echo "Application rollback can use previous commit: $current_sha" >&2
  if [ -s "$backup_file" ]; then
    echo "Pre-deploy DB backup: $backup_file" >&2
  fi
  exit 1
fi

api_health="$(compose exec -T marketplace-core node -e "fetch('http://127.0.0.1:3001/health').then(async r=>{if(!r.ok)process.exit(1);process.stdout.write(await r.text())}).catch(()=>process.exit(1))")"
printf '%s' "$api_health" | grep -q '"database":"postgresql"'

printf '%s\n' "$TARGET_SHA" > .miran-deployed-sha
chmod 600 .miran-deployed-sha

echo "Miran deployment healthy at commit $TARGET_SHA"
