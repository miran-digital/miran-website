# Miran Shop production runbook

This runbook is intentionally fail-closed. Do not expose the production storefront until every gate below is green.

## 1. Required external resources

- Linux host or managed container platform capable of running the eight-service Docker Compose topology.
- PostgreSQL 17+ persistent storage and automated backups.
- Redis persistent storage; Redis remains private to the Docker network and requires authentication.
- Private S3-compatible bucket for seller documents. Public read access must be disabled.
- Public S3-compatible bucket/origin for product and banner media plus an HTTPS media base URL/CDN.
- DNS control for `almiran.ir` and `www.almiran.ir`. Reserve `api.almiran.ir`; keep it private/unpublished unless a future integration explicitly needs it.
- Ports 80/443 available to Caddy for automatic TLS.
- Zarinpal Merchant ID only when staging checkout is proven end to end.

## 2. Exact production runtime

`infra/docker-compose.production.yml` must resolve to exactly these eight services:

- `web`
- `api-gateway`
- `auth-service`
- `catalog-service`
- `admin-service`
- `postgres`
- `redis`
- `caddy`

`marketplace-core` remains a compatibility implementation library and is not a ninth production container.

Expected request flow:

`Internet -> Caddy -> Web BFF -> API Gateway -> Auth/Catalog/Admin -> PostgreSQL`

The API Gateway also uses Redis for shared authentication rate limiting. Backend services, PostgreSQL and Redis must not publish host ports.

## 3. Secret requirements

Keep all secrets in the hosting secret store or an untracked root-owned environment file. Never commit them.

Required for production runtime:

- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- private object-storage endpoint, bucket and credentials
- public media endpoint, bucket and credentials
- `MIRAN_PUBLIC_MEDIA_BASE_URL`
- `MIRAN_BOOTSTRAP_ADMIN_EMAIL` and `MIRAN_BOOTSTRAP_ADMIN_PASSWORD` for one-time initial bootstrap only
- `ZARINPAL_MERCHANT_ID` after sandbox verification

Generate long random database, Redis, admin and storage secrets. Remove bootstrap-admin secrets after the first successful admin creation.

## 4. Pre-deploy gates

1. PR CI is green.
2. PostgreSQL integration tests are green.
3. `Eight Service Stack` CI is green and proves exactly eight running services.
4. Gateway `/health` reports Redis ready and identifies Auth, Catalog and Admin as separate upstreams.
5. Web Docker image builds.
6. Backup/restore verification workflow is green.
7. `main` is backed up/tagged before release.
8. Production database backup exists before every schema migration after launch.
9. Search indexing remains disabled (`SITE_INDEXABLE=false`) until storefront, legal pages, payment, fulfillment and support flow are approved.

## 5. Service boundaries

- `auth-service`: registration, login/logout, current user/session and addresses.
- `catalog-service`: public catalog/storefront plus current commerce compatibility flows: cart, shipping quote, seller onboarding, checkout, orders, payments and maintenance.
- `admin-service`: CMS, seller review, categories, products/media, inventory, shipping management and orders.
- `api-gateway`: internal routing, downstream health aggregation and Redis-backed authentication rate limiting.
- `web`: browser-facing Next.js BFF. The browser never receives raw backend routing details.
- `caddy`: only public edge; TLS and canonical-domain handling.

The broad Phase 1 catalog compatibility boundary is intentional. Later cart/order/payment/seller/shipment services are extracted behind the gateway without rewriting frontend URLs.

## 6. Database migration

Before migration:

1. Create a PostgreSQL backup.
2. Verify its SHA-256 checksum.
3. Confirm sufficient disk space.
4. Run the migration command from the same compatibility code version that the services use:

`pnpm --filter @miran/marketplace-core migrate:postgres`

The migration runner uses a PostgreSQL advisory lock and records applied versions in `schema_migrations`. Multiple extracted services may start concurrently; the advisory lock prevents concurrent migration races.

Do not reset or duplicate production data merely to simulate physical service separation. Data ownership is separated later through reviewed migrations.

## 7. Initial admin

Only when no ADMIN exists, run the one-time bootstrap command with secrets injected by the hosting platform:

`pnpm --filter @miran/marketplace-core bootstrap-admin:postgres`

The command must refuse to run once an ADMIN exists. Remove bootstrap password/email secrets immediately after success.

## 8. Controlled preview migration

Do not delete browser LocalStorage before migration review.

From the real Admin panel:

1. Import header messages/banners/home-section visibility. Import is idempotent.
2. For each legacy product, enter a reviewed real Toman price.
3. Import the product as DRAFT with zero stock.
4. Review category, description, discount and stock.
5. Migrate the old preview image through verified media storage if desired.
6. Publish only after manual review.

Never convert old GBP/mock prices automatically.

## 9. Object storage verification

Private seller documents:

- bucket is not publicly readable;
- upload/download uses short-lived signed URLs;
- backend verifies content length, MIME type and SHA-256;
- admin download is short lived;
- storage credentials are server-only.

Public product/banner media:

- upload uses signed PUT;
- backend verifies the object before persistence;
- final public URL uses the configured HTTPS media base URL;
- image/video size and MIME allowlists remain enforced.

## 10. Redis verification

- `REDIS_PASSWORD` is present only in the production env/secret store.
- Redis has no host port mapping.
- `redis-cli -a "$REDIS_PASSWORD" ping` returns `PONG` from inside the Redis container.
- API Gateway `/health` reports `redis: ready`.
- repeated auth requests hit the Redis-backed rate limit across gateway instances.

## 11. Caddy / TLS verification

- Caddy is the only service publishing ports 80 and 443.
- `MIRAN_SITE_ADDRESS=almiran.ir`.
- `MIRAN_WWW_SITE_ADDRESS=www.almiran.ir`.
- `MIRAN_CANONICAL_URL=https://almiran.ir`.
- HTTP redirects to HTTPS through Caddy automatic HTTPS.
- `www` redirects permanently to canonical `almiran.ir`.
- security headers are present.
- Caddy data/config volumes are persistent so certificates survive container replacement.

## 12. Zarinpal staging gate

Keep `ZARINPAL_SANDBOX=true` initially.

Verify:

1. checkout creates `PENDING_PAYMENT` and inventory reservation;
2. payment start creates/reuses one active provider payment;
3. redirect reaches sandbox;
4. callback verifies authority server-side;
5. successful verification changes order to `PAID` exactly once and consumes reserved stock exactly once;
6. cancelled/failed flow releases reservations;
7. callback replay does not double-consume inventory;
8. expired reservations cannot be revived into a paid order.

Only after these pass should the real Merchant ID and production provider mode be enabled.

## 13. Production cutover

1. Take a fresh PostgreSQL and object-storage backup.
2. Deploy the exact tested commit using `.github/workflows/deploy-production.yml` or the same backup-first script manually.
3. Require `docker compose config --services` to equal the eight-service list.
4. Start the stack and require all eight containers running.
5. Require API Gateway `/health` to pass Redis/Auth/Catalog/Admin checks.
6. Require Web health and Caddy config validation.
7. Keep `SITE_INDEXABLE=false` during smoke testing.
8. Test register/login/logout, addresses, catalog, admin access, seller flow, product creation/media, cart, shipping, checkout, order history and payment sandbox.
9. Confirm `almiran.ir` and canonical `www` redirect over valid TLS.
10. Enable indexing only after final operational/legal/payment approval.

## 14. Rollback

Application rollback:

- redeploy the previous known-good commit;
- keep the previous PostgreSQL backup and checksum;
- do not downgrade the database blindly if newer migrations are backward compatible;
- if a database restore is truly required, stop writes first and follow the restore drill below.

Database restore:

1. Stop application writes.
2. Verify backup checksum.
3. Restore into a separate temporary database first.
4. Run integrity/smoke checks.
5. Only then perform the approved production restore/cutover.

## 15. Ongoing operations

- automated daily PostgreSQL backups plus off-host retention;
- object-storage backup/versioning for private and public media;
- periodic restore drill, not backup-only monitoring;
- PostgreSQL/Redis/storage capacity alerts;
- eight-service health monitoring;
- TLS expiration/renewal monitoring;
- payment provider failure alerts;
- failed login/rate-limit/security-event monitoring;
- audit-log retention and admin review;
- dependency and container security updates through reviewed PRs.
