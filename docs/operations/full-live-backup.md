# Miran Shop Full Live Backup and New-Host Restore

This runbook defines the portable production backup required for a host migration. A GitHub source archive alone is not a full live backup.

## Scope

A successful bundle contains:

- exact deployed production commit marker and source archive
- PostgreSQL custom-format dump plus dedicated checksum
- private seller-document bucket contents
- public product/media/banner bucket contents
- per-object content type and `x-amz-meta-sha256` metadata used by Miran upload verification
- protected production environment file
- exact production Compose, Caddy, PostgreSQL, migration, and deployment/configuration files from the deployed commit
- Redis RDB snapshot for emergency/reference purposes
- internal SHA-256 manifest for every bundled file
- outer archive SHA-256 checksum
- restore and verification tooling

Redis currently holds transient/rate-limit state. Its RDB snapshot is retained in the bundle, but the automated restore intentionally does not restore that state to a new host.

## Security rules

The backup archive contains production secrets and private seller documents. It must never be committed to GitHub, attached to a PR, stored in a public bucket, or copied through an unencrypted channel. Keep it mode `0600`, use encrypted storage/transport, and restrict access to production operators only.

The restore script is fail-closed. It requires both `MIRAN_RESTORE_APPLY=true` and `MIRAN_RESTORE_TARGET=NEW_HOST`, refuses to run while application/edge services are live, refuses a non-empty target database by default, and refuses non-empty target object-storage buckets by default.

## Production host prerequisites

Required host tools:

- Bash
- Git
- Docker with Docker Compose v2
- AWS CLI v2 compatible with the configured S3-compatible provider
- `tar` and `sha256sum`

The production checkout must contain the deployed commit locally and `.miran-deployed-sha` should be present from the production deploy script. The running Compose file must still match the deployed commit exactly.

The object-storage credentials need list/get/head access for backup. The target-host credentials need head/list/put access for restore.

## Create the live backup

Run from the Miran Shop repository on the real production host:

```bash
sudo MIRAN_ENV_FILE=/etc/miran/production.env \
  MIRAN_BACKUP_DIR=/var/backups/miran/live \
  bash infra/backup/create-full-live-backup.sh
```

The script refuses to continue unless the Compose topology is exactly the approved eight services and all eight are running. It does not stop or restart the storefront, backend services, PostgreSQL, Caddy, or Redis. Redis receives a synchronous `SAVE`; PostgreSQL is dumped with `pg_dump`; both S3-compatible buckets are downloaded and verified.

Two portable files are produced:

```text
miran-live-<utc>-<sha>.tar.gz
miran-live-<utc>-<sha>.tar.gz.sha256
```

Do not delete the previous known-good backup until the new archive has passed verification and has been copied to a separate protected location.

## Verify before migration

```bash
MIRAN_BACKUP_ARCHIVE=/var/backups/miran/live/miran-live-<utc>-<sha>.tar.gz \
  bash infra/backup/verify-full-live-backup.sh
```

Verification checks the outer archive checksum, extracts into a mode-restricted temporary directory, validates every file against `SHA256SUMS`, confirms the PostgreSQL dump and both object inventories exist, reports the exact production commit and object counts, then removes the temporary verification directory.

## Prepare the isolated new host

Do not change DNS yet.

1. Install Docker/Compose, Git, Bash, AWS CLI v2, `tar`, and `sha256sum`.
2. Provision PostgreSQL/Redis through the same approved eight-service Compose topology.
3. Provision the private seller-document bucket and public media bucket. Keep the private bucket non-public.
4. Copy the backup archive and checksum through an encrypted channel.
5. Verify the archive before extracting it.
6. Extract the outer archive into a protected directory.
7. Extract `source/miran-source-<production-commit>.tar.gz` into the target Miran application directory. This archive is the exact source tree of the backed-up production commit.

Example:

```bash
mkdir -p /srv/miran /srv/miran-restore
tar -C /srv/miran-restore -xzf /secure-transfer/miran-live-<utc>-<sha>.tar.gz
BUNDLE_DIR="$(find /srv/miran-restore -mindepth 1 -maxdepth 1 -type d -name 'miran-live-*' -print -quit)"
SOURCE_ARCHIVE="$(find "$BUNDLE_DIR/source" -maxdepth 1 -name 'miran-source-*.tar.gz' -print -quit)"
tar -C /srv/miran -xzf "$SOURCE_ARCHIVE"
```

## Restore database and object storage

The backed-up production environment can be installed only when explicitly requested. On a new host:

```bash
MIRAN_BACKUP_DIR="$BUNDLE_DIR" \
MIRAN_RESTORE_REPO_ROOT=/srv/miran \
MIRAN_ENV_FILE=/etc/miran/production.env \
MIRAN_RESTORE_INSTALL_ENV=true \
MIRAN_RESTORE_APPLY=true \
MIRAN_RESTORE_TARGET=NEW_HOST \
bash "$BUNDLE_DIR/tools/restore-full-live-backup.sh"
```

The restore tool starts only PostgreSQL and Redis, verifies the database is empty, restores the PostgreSQL dump in one transaction, verifies the target S3-compatible buckets are empty, uploads every private/public object, restores its content type and SHA-256 metadata, and verifies uploaded size/metadata.

For an intentionally non-empty disaster-recovery target, the operator must separately opt in with `MIRAN_RESTORE_ALLOW_NONEMPTY_DATABASE=true` and/or `MIRAN_RESTORE_ALLOW_NONEMPTY_OBJECT_STORAGE=true`. Those overrides must never be used for a routine new-host migration.

## Bring up the eight-service runtime

After data restore, from `/srv/miran`:

```bash
docker compose --env-file /etc/miran/production.env \
  -f infra/docker-compose.production.yml \
  up -d --build --remove-orphans
```

Confirm that exactly these eight services are running:

```text
web
api-gateway
auth-service
catalog-service
admin-service
postgres
redis
caddy
```

`marketplace-core` remains code/internal compatibility logic and must not become a ninth production container.

Do not mark the migration complete until health checks, HTTPS, `www` redirect, security headers, authentication, admin, catalog/product media, seller flow, cart, shipping, checkout, orders, and Zarinpal sandbox callback verification are tested on the new host.

## DNS cutover

Only after the new host passes production verification:

1. take one final fresh live backup on the old production host
2. stop writes or use a controlled maintenance window for the final delta/cutover
3. repeat restore if the final backup changed business data
4. verify the new host again
5. update DNS
6. verify `https://almiran.ir` and the permanent `www.almiran.ir` redirect externally
7. keep the old host and latest verified backup available for rollback until the cutover is accepted

## Rollback

If verification fails before DNS cutover, do not cut over; fix the new host while the old production remains authoritative.

If failure occurs after DNS cutover:

1. point DNS/load routing back to the previous known-good host
2. do not write the new host database back over the old host automatically
3. preserve logs and the failed-host data for reconciliation
4. restore only from a verified bundle and only after deciding which side contains the authoritative post-cutover orders/payments
5. keep Zarinpal production disabled until sandbox and callback/replay-protection checks pass again

A database restore is destructive by definition. Never run the restore tool against the existing live production host as a shortcut.
