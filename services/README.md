# Services

Deployable backend runtime boundaries live in this directory.

Phase 1 production runtime is intentionally limited to these application services:

- `api-gateway` — the single internal application entrypoint used by the web BFF. It routes requests to the appropriate service and uses Redis for shared authentication rate limiting.
- `auth-service` — registration, login/logout, current-user identity, roles/session authentication, and address-book endpoints.
- `catalog-service` — public storefront/catalog plus the existing commerce compatibility boundary for cart, seller onboarding, shipping quotes, checkout, orders, payments and reservation/session maintenance until those roadmap domains are split into their own services.
- `admin-service` — administrator CMS, seller review, category, product/media, inventory, shipping and order-management endpoints.

`marketplace-core` remains in the repository as a tested compatibility implementation library during the extraction. It is **not** a ninth production container in the Phase 1 Compose stack.

Infrastructure runtime services are `postgres`, `redis`, and `caddy`; `web` remains the Next.js storefront/admin application. Together the production Compose stack contains exactly eight services: `web`, `api-gateway`, `auth-service`, `catalog-service`, `admin-service`, `postgres`, `redis`, and `caddy`.

Future services must follow the architectural rules in `docs/architecture/` and the standard in `tooling/service-template/`. A future service must not be added simply because it exists on the roadmap; it needs a justified business, security, ownership, or scaling boundary.
