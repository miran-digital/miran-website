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
- AWS CLI v2 on the production host for S3-compatible backup and restore verification.

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

The protected production environment file must be mode `0400` or `0600`. `SITE_INDEXABLE=false` and `ZARINPAL_SANDBOX=true` remain mandatory during rollout and live verification.

## 4. Pre-deploy gates

1. PR CI is green.
2. PostgreSQL integration tests are green.
3. `Eight Service Stack` CI is green and proves exactly eight running services.
4. Gateway `/health` reports Redis ready and identifies Auth, Catalog and Admin as separate upstreams.
5. Web Docker image builds.
6. Backup/restore verification workflows are green.
7. `Production Deploy Safety` is green and proves the deploy path runs preflight and a verified full live backup before checkout/deploy.
8. On an existing eight-service production host, `Production Read-only Preflight` must pass before any deployment. It verifies runtime, internal ports, PostgreSQL, Redis, Gateway ownership, Caddy/TLS/security headers, storage reachability and sandbox payment mode without changing business data.
9. Before changing an existing live runtime, create and verify a **Full Live Backup** containing the exact deployed source commit, PostgreSQL, private/public object storage, protected production configuration, Redis snapshot, checksums, restore tooling and rollback instructions. A GitHub ZIP or PostgreSQL-only dump is not sufficient.
10. Search indexing remains disabled (`SITE_INDEXABLE=false`) until storefront, legal pages, payment, fulfillment and support flow are approved.
11. Zarinpal remains sandboxed (`ZARINPAL_SANDBOX=true`) until the sandbox callback/replay/reservation tests have been explicitly signed off.

The deployment workflow enforces items 8 and 9 automatically when it detects an existing eight-service runtime. It executes the reviewed deploy script from the exact GitHub workflow commit over pinned SSH instead of trusting an older host-side copy.

### Initial empty-host exception

A truly new isolated target host has no existing Miran runtime to back up. The deployment workflow is fail-closed and requires the operator to explicitly set `allow_initial_empty_host=true`. This exception is accepted only when:

- zero Miran services are running;
- no stopped Miran Compose containers exist;
- no Miran PostgreSQL, Redis or Caddy persistent Compose volumes exist on the target host.

This exception authorizes bringing up an **empty isolated target host only**. It does not authorize DNS cutover and it does not replace the requirement to preserve/verify the old live site's data before migration.

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

1. Create a Full Live Backup when changing an existing production runtime.
2. Verify its outer and internal SHA-256 manifests.
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

## 13. Production deployment and cutover

### Existing eight-service live host

Use `.github/workflows/deploy-production.yml`. On an existing runtime, the workflow and deploy script enforce this order:

1. Fetch and resolve the exact GitHub workflow commit.
2. Run `inspect-production.sh` read-only against the current live runtime.
3. Require all eight approved services and exact `.miran-deployed-sha` identity.
4. Create a Full Live Backup of the **current deployed commit and live data**.
5. Verify the full backup archive checksum and every internal manifest entry.
6. Only after successful verification, check out the target commit.
7. Require the target Compose topology to remain exactly eight services.
8. Build/start with `--remove-orphans`.
9. Require Gateway, Web and Caddy smoke checks.
10. Require all eight services to be running.
11. Write `.miran-deployed-sha` only after the new runtime is healthy.

The workflow streams `infra/scripts/deploy-production.sh` from the exact reviewed GitHub commit over pinned SSH. It must never invoke an older deploy script stored on the server checkout.

### New isolated host

For a brand-new empty host, leave `allow_initial_empty_host=false` until the target has been independently confirmed empty. Set it to true only for the first isolated bring-up. The workflow refuses the exception if any Miran container or persistent Compose volume already exists.

Do not update DNS merely because the new host starts successfully. Before cutover, preserve the old authoritative live data with the full migration backup procedure and verify the restored data on the new host.

### After deployment

1. Re-run `Production Read-only Preflight` against the deployed host.
2. Keep `SITE_INDEXABLE=false` during smoke testing.
3. Test register/login/logout, addresses, catalog, admin access, seller flow, product creation/media, cart, shipping, checkout, order history and payment sandbox.
4. Confirm `almiran.ir` and canonical `www` redirect over valid TLS from outside the host.
5. Confirm private seller documents are not public and public product/banner media resolves correctly.
6. Confirm the exact deployed commit matches `main`/the approved release commit.
7. Enable indexing only after final operational/legal/payment approval.
8. Do not enable Zarinpal production mode until all sandbox acceptance checks are complete.

## 14. Rollback

Application rollback:

- preserve the verified pre-deploy Full Live Backup;
- redeploy the previous known-good commit only after checking migration compatibility;
- do not downgrade the database blindly if newer migrations are backward compatible;
- if a database/data restore is truly required, stop writes first and use the guarded new-host/restore procedure.

Database/data restore:

1. Stop application writes.
2. Verify the outer archive checksum and internal `SHA256SUMS` manifest.
3. Restore into an isolated target or temporary database first.
4. Restore/verify private and public object storage using the guarded restore tool.
5. Run integrity and smoke checks.
6. Reconcile any post-cutover orders/payments before deciding which data set is authoritative.
7. Only then perform an approved production restore/cutover.

Never restore a stale backup over newer paid orders automatically.

## 15. Ongoing operations

- automated daily PostgreSQL backups plus off-host retention;
- scheduled Full Live Backups for migration/disaster-recovery points;
- object-storage backup/versioning for private and public media;
- periodic restore drill, not backup-only monitoring;
- PostgreSQL/Redis/storage capacity alerts;
- eight-service health monitoring;
- TLS expiration/renewal monitoring;
- payment provider failure alerts;
- failed login/rate-limit/security-event monitoring;
- audit-log retention and admin review;
- dependency and container security updates through reviewed PRs.
