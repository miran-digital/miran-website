# Phase 1: Eight-Service Runtime

Miran Shop keeps the 30-domain-service roadmap while deploying only the boundaries that are justified today.

## Exact production service set

The Phase 1 production Compose topology contains exactly eight runtime services:

1. `web` — Next.js storefront, account, seller and admin UI/BFF.
2. `api-gateway` — single internal application gateway used by `web`; owns routing, upstream health aggregation and Redis-backed authentication rate limiting.
3. `auth-service` — registration, login/logout, current-user/session and address-book API boundary.
4. `catalog-service` — public catalog/storefront plus the current commerce compatibility boundary for cart, shipping quote, seller onboarding, checkout, orders, payments and maintenance until those roadmap domains justify extraction.
5. `admin-service` — protected CMS, seller review, category, product/media, inventory, shipping and order-management API boundary.
6. `postgres` — persistent PostgreSQL 17 data store.
7. `redis` — persistent internal Redis used by the gateway for shared rate limiting; it is password-protected and has no published host port.
8. `caddy` — only public edge container; terminates TLS, applies edge security headers, redirects the optional `www` host and proxies only to `web`.

`marketplace-core` remains source code used as a compatibility implementation library during extraction. It is not a ninth production container.

## Request flow

```text
Internet
  -> Caddy
    -> Web / Next.js BFF
      -> API Gateway
        -> Auth Service
        -> Catalog Service
        -> Admin Service
           -> PostgreSQL
      -> Redis (gateway rate-limit state)
```

Backend services, PostgreSQL and Redis are attached only to the internal Docker network and are not published directly to the host.

## Data ownership migration rule

The long-term 30-service architecture requires domain data ownership. Phase 1 deliberately does **not** copy or reset production data merely to create artificial physical database separation. The three extracted application services currently reuse the tested PostgreSQL compatibility implementation and migrations through `marketplace-core` while their HTTP/deployment boundaries are made independent first.

During later domain extraction:

- no new feature may add arbitrary cross-domain SQL coupling;
- a domain gets its own schema/database only with a reviewed migration and rollback plan;
- API Gateway routes stay stable so `web` does not need a rewrite;
- existing production data is migrated, never silently discarded or regenerated;
- `marketplace-core` compatibility code is retired incrementally only after equivalent service tests pass.

## 30-service roadmap compatibility

The existing roadmap remains unchanged: admin, analytics, audit, auth, cart, catalog, CMS, commission, email-template, fraud, inventory, media, notification, order, payment, pricing, promotion, recommendation, reporting, review, search, seller, SEO, shipment, support, tax, user, vendor-payout, warehouse and wishlist.

The Phase 1 `catalog-service` compatibility boundary is intentionally broad so cart/order/payment/seller/shipment domains can later be moved behind the gateway one by one without changing public URLs or the frontend contract.

## Release gates

A change to this topology is not production-ready unless CI proves all of the following:

- Compose resolves to exactly the eight expected service names;
- all eight containers are running;
- PostgreSQL and Redis health checks pass;
- Redis authentication and gateway rate limiting work;
- gateway health identifies Auth, Catalog and Admin as separate upstream services;
- route ownership is verified by the gateway response headers;
- registration and session lookup work through Caddy -> Web BFF -> Gateway -> Auth -> PostgreSQL;
- Catalog is reachable through its routed boundary;
- Admin boundary rejects an unauthenticated request;
- no legacy backend/API port is published to the host.
