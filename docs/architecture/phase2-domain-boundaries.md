# Phase 2: Domain Boundaries Before Service Extraction

Miran Shop keeps the signed-off eight-container Phase 1 topology while preparing the broad `catalog-service` compatibility boundary for safe extraction into future domain services.

## Rule

Do not create a new runtime container merely to create a service name. A domain may be physically extracted only after its route ownership, application boundary, data ownership and tests are explicit.

## Current compatibility domains

The current `catalog-service` owns these logical domains while they remain inside the eight-service runtime:

| Logical domain | Current route ownership | Future extraction target |
| --- | --- | --- |
| Catalog | `/v1/storefront`, `/v1/catalog/**` | `catalog-service` |
| Cart | `/v1/cart`, `/v1/cart/**` | `cart-service` |
| Inventory | internal compatibility logic; no new public route claimed | `inventory-service` |
| Pricing | internal compatibility logic; no new public route claimed | `pricing-service` |
| Promotion | internal compatibility logic; no new public route claimed | `promotion-service` |
| Shipping | `/v1/shipping/methods` | `shipment-service` |
| Checkout | `/v1/checkout/**` | `checkout-service` |
| Order | `/v1/orders`, `/v1/orders/**` | `order-service` |
| Payment | `/v1/payments/**` | `payment-service` |
| Seller | `/v1/sellers`, `/v1/sellers/**` | `seller-service` |

The machine-readable source of truth is `services/catalog-service/src/domain-boundaries.js`. CI rejects overlapping route ownership.

## Existing implementation seams

The PostgreSQL compatibility implementation already contains useful internal seams such as `cart-service.js`, `checkout-service.js`, `logistics-service.js`, `order-query-service.js`, `payment-service.js`, catalog management code and seller verification code. Phase 2 must reduce coupling around those seams instead of duplicating them into new containers.

## Extraction sequence

The default extraction sequence is:

1. Catalog
2. Inventory
3. Cart
4. Pricing and Promotion
5. Shipping
6. Checkout
7. Order
8. Payment
9. Seller

Each extraction requires all of the following before a new container is approved:

- stable API ownership behind API Gateway;
- no route ownership overlap;
- explicit data ownership and migration plan;
- no direct browser access to the new service;
- backward-safe migrations only;
- integration and end-to-end tests passing;
- rollback path documented;
- the existing eight-service production runtime remains unchanged until the extraction is explicitly approved for deployment.

## Data rule

PostgreSQL may remain physically shared during this phase. Logical ownership must be established before physical database separation. No table is copied, dropped, reset or moved just to make a service appear independent.

## Phase 2.1 exit criteria

Phase 2.1 is complete when the broad Catalog compatibility boundary has explicit machine-tested ownership for its domains and subsequent refactoring can move one domain at a time without changing browser-facing URLs.
