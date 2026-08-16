# Private object storage for seller evidence

Seller identity and business documents are sensitive evidence and must never be stored in the public storefront, browser localStorage, Git history, or a permanently public URL.

## Runtime flow

1. An authenticated seller selects a PDF/JPEG/PNG/WebP file up to 10 MB.
2. The browser calculates SHA-256 locally and requests an upload ticket from Miran.
3. Marketplace Core validates the seller/application state and returns a short-lived SigV4 PUT URL scoped to `private/sellers/<seller-id>/...`.
4. The browser uploads directly to the private S3-compatible bucket using the exact signed headers.
5. The seller calls the completion endpoint.
6. Marketplace Core performs a signed HEAD request and verifies object size, content type, and `x-amz-meta-sha256` before inserting document metadata into the database.
7. Admin review never receives a permanent object URL. An authenticated ADMIN requests a short-lived signed GET URL when the file must be viewed.

## Required bucket policy

- Block all anonymous/public object access.
- Do not expose a public bucket website.
- Credentials used by Marketplace Core should be limited to the configured bucket/prefix and the minimum required object operations.
- Production endpoints must use HTTPS.
- Rotate access credentials through the deployment secret manager, never Git.

## Browser CORS

Direct seller uploads require bucket CORS. In production, allow only controlled storefront origins such as `https://almiran.ir` (and an explicit staging origin when one exists). Do not use `*` for production origins.

Required upload method: `PUT`.
Required request headers: `Content-Type`, `x-amz-meta-sha256`.
Admin signed downloads are normal browser navigations and must still remain private/short-lived.

## Environment variables

- `MIRAN_OBJECT_STORAGE_ENDPOINT`
- `MIRAN_OBJECT_STORAGE_BUCKET`
- `MIRAN_OBJECT_STORAGE_REGION`
- `MIRAN_OBJECT_STORAGE_ACCESS_KEY_ID`
- `MIRAN_OBJECT_STORAGE_SECRET_ACCESS_KEY`
- `MIRAN_OBJECT_STORAGE_FORCE_PATH_STYLE`
- `MIRAN_OBJECT_STORAGE_UPLOAD_EXPIRES_SECONDS`
- `MIRAN_OBJECT_STORAGE_DOWNLOAD_EXPIRES_SECONDS`

The repository contains names/placeholders only. Real values belong in the production deployment secret store.

## Operational notes

Objects uploaded successfully but never completed in the application can become orphans. Production operations should periodically remove old unreferenced objects under the private prefix after a conservative retention period. Database rows must not be deleted merely because an object cleanup job encounters a temporary storage error.
