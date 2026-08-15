# Miran Shop production runbook

This runbook is intentionally fail-closed. Do not expose the production storefront until every gate below is green.

## 1. Required external resources

- Linux host or managed container platform capable of running the web and marketplace-core containers.
- PostgreSQL 17+ with persistent storage and automated backups.
- Private S3-compatible bucket for seller documents. Public read access must be disabled.
- Public S3-compatible bucket/origin for product and banner media plus an HTTPS media base URL/CDN.
- DNS control for `almiran.ir` and `www.almiran.ir`. Reserve `api.almiran.ir`; keep it private/unpublished unless a future integration explicitly needs it.
- TLS certificate for `almiran.ir`/`www.almiran.ir`.
- Zarinpal Merchant ID only when staging checkout is proven end to end.

## 2. Secret requirements

Keep all secrets in the hosting secret store or an untracked root-owned environment file. Never commit them.

Required for production runtime:

- `POSTGRES_PASSWORD` / `DATABASE_URL`
- private object-storage endpoint, bucket and credentials
- public media endpoint, bucket and credentials
- `MIRAN_PUBLIC_MEDIA_BASE_URL`
- `MIRAN_BOOTSTRAP_ADMIN_EMAIL` and `MIRAN_BOOTSTRAP_ADMIN_PASSWORD` for the one-time initial bootstrap only
- `ZARINPAL_MERCHANT_ID` after sandbox verification

Generate long random database/admin/storage secrets. Remove bootstrap-admin secrets after the first successful admin creation.

## 3. Pre-deploy gates

1. PR CI is green.
2. PostgreSQL integration tests are green.
3. Production API Docker image builds and `/health` reports `database: postgresql`.
4. Web Docker image builds.
5. Backup/restore verification workflow is green.
6. `main` is backed up/tagged before merge.
7. Production database backup exists before every schema migration after launch.
8. Search indexing remains disabled (`SITE_INDEXABLE=false`) until the storefront, legal pages, payment, fulfillment and support flow are approved.

## 4. Staging deployment

Use `infra/docker-compose.full-stack.staging.yml` with a secret environment source derived from `infra/staging.env.example`.

Expected private topology:

`Internet -> TLS reverse proxy -> web:3000 -> marketplace-core:3001 -> PostgreSQL`

The browser should not receive the raw marketplace bearer token. Next.js remains the BFF and stores the backend session token in an HttpOnly cookie boundary.

Do not publish the PostgreSQL port or marketplace-core port to the internet.

## 5. Database migration

Before migration:

1. Create a PostgreSQL backup.
2. Verify its SHA-256 checksum.
3. Confirm sufficient disk space.
4. Run the migration command from the same API image/version that will be deployed:

`pnpm --filter @miran/marketplace-core migrate:postgres`

The migration runner uses a PostgreSQL advisory lock and records applied versions in `schema_migrations`.

## 6. Initial admin

Only when no ADMIN exists, run the one-time bootstrap command with secrets injected by the hosting platform:

`pnpm --filter @miran/marketplace-core bootstrap-admin:postgres`

The command must refuse to run once an ADMIN exists. Remove bootstrap password/email secrets immediately after success.

## 7. Controlled preview migration

Do not delete browser LocalStorage before migration review.

From the real Admin panel:

1. Import header messages/banners/home-section visibility. Import is idempotent.
2. For each legacy product, enter a reviewed real Toman price.
3. Import the product as DRAFT with zero stock.
4. Review category, description, discount and stock.
5. Migrate the old preview image through verified media storage if desired.
6. Publish only after manual review.

Never convert the old GBP/mock price automatically.

## 8. Object storage verification

Private seller documents:

- bucket is not publicly readable;
- upload/download uses short-lived signed URLs;
- backend verifies content length, MIME type and SHA-256;
- admin download is short lived;
- storage credentials are server-only.

Public product/banner media:

- upload uses signed PUT;
- backend/server verifies the object before persistence;
- final public URL uses the configured HTTPS media base URL;
- image/video size and MIME allowlists remain enforced.

## 9. Zarinpal staging gate

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

## 10. Production cutover

1. Take a fresh backup.
2. Deploy PostgreSQL-compatible API image.
3. Run migrations.
4. Start API and require healthy `/health`.
5. Start web and run smoke tests through the private API network.
6. Configure TLS reverse proxy for `almiran.ir` and redirect `www` to canonical `almiran.ir`.
7. Keep `SITE_INDEXABLE=false` during smoke testing.
8. Test register/login/logout, address, catalog, admin access, seller flow, product creation/media, cart, checkout, order history and payment sandbox/production mode as appropriate.
9. Enable indexing only after final approval.

## 11. Rollback

Application rollback:

- redeploy the previous known-good web/API image;
- do not downgrade the database blindly if newer migrations are backward compatible;
- if a database restore is truly required, stop writes first and follow the restore drill below.

Database restore:

1. Stop API writes.
2. Verify backup checksum.
3. Restore into a separate temporary database first.
4. Run integrity/smoke checks.
5. Only then perform the approved production restore/cutover.

## 12. Ongoing operations

- automated daily PostgreSQL backups plus off-host retention;
- periodic restore drill, not backup-only monitoring;
- database/storage capacity alerts;
- API/container health monitoring;
- TLS expiration monitoring;
- payment provider failure alerts;
- failed login/rate-limit/security-event monitoring;
- audit-log retention and admin review;
- dependency and container security updates through reviewed PRs.
