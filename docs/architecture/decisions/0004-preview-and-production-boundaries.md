# ADR 0004: Preview and production boundaries

Status: Accepted for Phase 1

## Context

The Phase 1 storefront needs realistic interaction and administrative review before Identity, Catalog, CMS, Media, Seller, Logistics, Payment, and Order services exist.

## Decision

- Guest cart, wishlist, seller applications, and Admin Preview settings may use validated browser storage for local demonstration only.
- Checkout keeps personal information in component memory and does not persist or transmit it.
- Payment remains disabled until a server-owned Order and Payment flow exists.
- Admin Preview is unlinked and excluded from indexing, but it is not considered an authentication boundary.
- Production admin access requires server-validated sessions, an administrator role, authorization on every mutation, audit logging, CSRF protection where applicable, and rate limiting.
- Product images in Preview are restricted to small raster files. Production media must use Media Service upload validation and durable object storage.
- Mock storefront data remains behind application-facing gateway functions so real service clients can replace it without rewriting routes.

## Consequences

The user experience can be reviewed safely without presenting local demo behavior as production security, persistence, payment, or fulfilment.
