#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  printf 'PREFLIGHT_FAIL: %s\n' "$*" >&2
  exit 1
}

pass() {
  printf 'PREFLIGHT_OK: %s\n' "$*"
}

warn() {
  printf 'PREFLIGHT_WARN: %s\n' "$*" >&2
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command is missing: $1"
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
  [[ -n "$value" ]] || fail "required production environment value is missing: $key"
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

aws_s3_head_bucket() {
  local label="$1" endpoint="$2" bucket="$3" region="$4" access_key="$5" secret_key="$6" force_path_style="$7"
  local config_file
  [[ "$endpoint" == https://* ]] || fail "$label storage endpoint must use HTTPS"
  config_file="$WORK_DIR/aws-${label}.config"
  aws_config_for "$region" "$force_path_style" "$config_file"
  AWS_CONFIG_FILE="$config_file" \
  AWS_ACCESS_KEY_ID="$access_key" \
  AWS_SECRET_ACCESS_KEY="$secret_key" \
  AWS_EC2_METADATA_DISABLED=true \
    aws --no-cli-pager --endpoint-url "$endpoint" s3api head-bucket --bucket "$bucket" >/dev/null
  pass "$label object storage is reachable"
}

require_command git
require_command docker
require_command grep
require_command awk
require_command curl
require_command aws
require_command stat
require_command mktemp
require_command tr

REPO_ROOT="${MIRAN_PRODUCTION_REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"
[[ -n "$REPO_ROOT" && -d "$REPO_ROOT/.git" ]] || fail "production repository checkout is not available"
cd "$REPO_ROOT"

MIRAN_ENV_FILE="${MIRAN_ENV_FILE:-/etc/miran/production.env}"
[[ -f "$MIRAN_ENV_FILE" ]] || fail "production environment file is missing"
case "$(stat -c '%a' "$MIRAN_ENV_FILE")" in
  400|600) pass "production environment file permissions are restricted" ;;
  *) fail "production environment file permissions must be 400 or 600" ;;
esac

WORK_DIR="$(mktemp -d)"
chmod 700 "$WORK_DIR"
trap 'rm -rf "$WORK_DIR"' EXIT

[[ -f infra/docker-compose.production.yml ]] || fail "production compose file is missing from checkout"
[[ -f infra/caddy/Caddyfile ]] || fail "Caddy configuration is missing from checkout"

DEPLOY_IDENTITY_OK=true
CURRENT_SHA="$(git rev-parse HEAD)"
DEPLOYED_SHA="$CURRENT_SHA"
if [[ ! -s .miran-deployed-sha ]]; then
  DEPLOY_IDENTITY_OK=false
  warn ".miran-deployed-sha is missing; exact deployed commit cannot yet be proven"
else
  DEPLOYED_SHA="$(tr -d '[:space:]' < .miran-deployed-sha)"
  if ! git cat-file -e "${DEPLOYED_SHA}^{commit}" 2>/dev/null; then
    DEPLOY_IDENTITY_OK=false
    warn ".miran-deployed-sha does not reference a local commit"
  elif [[ "$CURRENT_SHA" != "$DEPLOYED_SHA" ]]; then
    DEPLOY_IDENTITY_OK=false
    warn "checkout HEAD does not match .miran-deployed-sha"
  else
    pass "deployed source commit is internally consistent: ${DEPLOYED_SHA}"
  fi
fi

COMPOSE=(docker compose --env-file "$MIRAN_ENV_FILE" -f infra/docker-compose.production.yml)
EXPECTED_SERVICES=(web api-gateway auth-service catalog-service admin-service postgres redis caddy)
mapfile -t EXPECTED_SORTED < <(printf '%s\n' "${EXPECTED_SERVICES[@]}" | LC_ALL=C sort)
mapfile -t CONFIGURED_SERVICES < <("${COMPOSE[@]}" config --services | LC_ALL=C sort)
[[ "${CONFIGURED_SERVICES[*]}" == "${EXPECTED_SORTED[*]}" ]] || fail "production compose is not exactly the approved eight-service topology"
pass "production compose contains exactly eight approved services"

mapfile -t RUNNING_SERVICES < <("${COMPOSE[@]}" ps --services --status running | LC_ALL=C sort)
[[ "${RUNNING_SERVICES[*]}" == "${EXPECTED_SORTED[*]}" ]] || fail "not all eight approved production services are running"
pass "all eight approved production services are running"

for service in web api-gateway auth-service catalog-service admin-service postgres redis; do
  container_id="$("${COMPOSE[@]}" ps -q "$service")"
  [[ -n "$container_id" ]] || fail "$service container is missing"
  [[ -z "$(docker port "$container_id" 2>/dev/null || true)" ]] || fail "$service unexpectedly publishes a host port"
done
pass "internal web/backend/PostgreSQL/Redis services have no published host ports"

HTTP_PORT="$(read_env_value HTTP_PORT || printf '80')"
HTTPS_PORT="$(read_env_value HTTPS_PORT || printf '443')"
CADDY_ID="$("${COMPOSE[@]}" ps -q caddy)"
[[ -n "$CADDY_ID" ]] || fail "caddy container is missing"
CADDY_PORTS="$(docker inspect -f '{{json .HostConfig.PortBindings}}' "$CADDY_ID")"
grep -F '"80/tcp"' <<<"$CADDY_PORTS" >/dev/null || fail "caddy does not publish container port 80"
grep -F "\"HostPort\":\"${HTTP_PORT}\"" <<<"$CADDY_PORTS" >/dev/null || fail "caddy HTTP host port does not match production env"
grep -F '"443/tcp"' <<<"$CADDY_PORTS" >/dev/null || fail "caddy does not publish container port 443"
grep -F "\"HostPort\":\"${HTTPS_PORT}\"" <<<"$CADDY_PORTS" >/dev/null || fail "caddy HTTPS host port does not match production env"
"${COMPOSE[@]}" exec -T caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null
pass "caddy is the public edge and its configuration validates"

"${COMPOSE[@]}" exec -T postgres sh -ec 'pg_isready --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' >/dev/null
CORE_TABLE_COUNT="$(
  "${COMPOSE[@]}" exec -T postgres sh -ec 'exec psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --tuples-only --no-align' <<'SQL' | tr -d '[:space:]'
SELECT count(*)
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users','sessions','addresses','sellers','seller_documents','categories',
    'products','product_media','inventory','orders','payments','audit_log'
  );
SQL
)"
[[ "$CORE_TABLE_COUNT" == "12" ]] || fail "PostgreSQL core marketplace schema is incomplete"
pass "PostgreSQL is ready and core marketplace tables exist"

REDIS_PING="$("${COMPOSE[@]}" exec -T redis sh -ec 'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" PING')"
[[ "$REDIS_PING" == "PONG" ]] || fail "Redis authentication/PING failed"
pass "Redis is authenticated and reachable internally"

"${COMPOSE[@]}" exec -T api-gateway node <<'NODE'
const health = await fetch('http://127.0.0.1:3001/health');
if (!health.ok) process.exit(1);
const body = await health.json();
if (!body.ok || body.redis !== 'ready') process.exit(1);
if (body.downstream?.auth !== 'auth-service') process.exit(1);
if (body.downstream?.catalog !== 'catalog-service') process.exit(1);
if (body.downstream?.admin !== 'admin-service') process.exit(1);

const checks = [
  ['/v1/me', 'auth-service', 401],
  ['/v1/catalog/categories', 'catalog-service', 200],
  ['/v1/admin/categories', 'admin-service', 401],
];

for (const [path, upstream, status] of checks) {
  const response = await fetch(`http://127.0.0.1:3001${path}`);
  if (response.status !== status || response.headers.get('x-miran-upstream') !== upstream) {
    process.exit(1);
  }
}
NODE
pass "API Gateway health and route ownership are correct"

SITE_HOST="$(read_env_value MIRAN_SITE_ADDRESS || printf 'almiran.ir')"
WWW_HOST="$(read_env_value MIRAN_WWW_SITE_ADDRESS || printf 'www.almiran.ir')"
[[ "$SITE_HOST" == "almiran.ir" ]] || fail "MIRAN_SITE_ADDRESS must be almiran.ir for this production"
[[ "$WWW_HOST" == "www.almiran.ir" ]] || fail "MIRAN_WWW_SITE_ADDRESS must be www.almiran.ir for this production"

EDGE_HEADERS="$WORK_DIR/edge.headers"
curl --fail --silent --show-error --resolve "${SITE_HOST}:${HTTPS_PORT}:127.0.0.1" \
  --dump-header "$EDGE_HEADERS" --output /dev/null "https://${SITE_HOST}:${HTTPS_PORT}/"
grep -qi '^strict-transport-security:' "$EDGE_HEADERS" || fail "HSTS header is missing at Caddy edge"
grep -qi '^x-content-type-options:[[:space:]]*nosniff' "$EDGE_HEADERS" || fail "X-Content-Type-Options header is missing"
grep -qi '^x-frame-options:' "$EDGE_HEADERS" || fail "X-Frame-Options header is missing"
grep -qi '^referrer-policy:' "$EDGE_HEADERS" || fail "Referrer-Policy header is missing"
pass "almiran.ir HTTPS edge and security headers are valid locally"

WWW_HEADERS="$WORK_DIR/www.headers"
curl --silent --show-error --resolve "${WWW_HOST}:${HTTPS_PORT}:127.0.0.1" \
  --head "https://${WWW_HOST}:${HTTPS_PORT}/" >"$WWW_HEADERS"
grep -Eq '^HTTP/[^ ]+ 30[178]' "$WWW_HEADERS" || fail "www endpoint does not return a permanent redirect"
grep -qi '^location:[[:space:]]*https://almiran\.ir/?' "$WWW_HEADERS" || fail "www redirect target is not almiran.ir"
pass "www.almiran.ir permanently redirects to almiran.ir"

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
PUBLIC_BASE_URL="$(require_env_value MIRAN_PUBLIC_MEDIA_BASE_URL)"
[[ "$PUBLIC_BASE_URL" == https://* ]] || fail "public media base URL must use HTTPS"

aws_s3_head_bucket private "$PRIVATE_ENDPOINT" "$PRIVATE_BUCKET" "$PRIVATE_REGION" "$PRIVATE_ACCESS_KEY" "$PRIVATE_SECRET_KEY" "$PRIVATE_FORCE_PATH_STYLE"
aws_s3_head_bucket public "$PUBLIC_ENDPOINT" "$PUBLIC_BUCKET" "$PUBLIC_REGION" "$PUBLIC_ACCESS_KEY" "$PUBLIC_SECRET_KEY" "$PUBLIC_FORCE_PATH_STYLE"

ZARINPAL_SANDBOX="$(require_env_value ZARINPAL_SANDBOX)"
if [[ "${ZARINPAL_SANDBOX,,}" != "true" && "${MIRAN_ALLOW_ZARINPAL_PRODUCTION:-false}" != "true" ]]; then
  fail "Zarinpal production mode is blocked until sandbox verification is explicitly signed off"
fi
if [[ "${ZARINPAL_SANDBOX,,}" == "true" ]]; then
  pass "Zarinpal remains in sandbox mode"
else
  pass "Zarinpal production mode was explicitly allowed by operator override"
fi

if [[ "$DEPLOY_IDENTITY_OK" != "true" ]]; then
  fail "runtime checks passed, but exact deployed commit identity is not proven"
fi

pass "production read-only preflight passed for commit ${DEPLOYED_SHA}"
