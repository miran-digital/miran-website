# Miran Shop

Miran Shop is a long-term marketplace platform designed to grow without requiring a platform rewrite as new business capabilities are introduced.

## Architecture direction

- Monorepo managed with pnpm workspaces
- TypeScript-first applications and services
- Next.js storefront in `apps/web`
- Backend services in `services/*`
- Shared technical packages in `packages/*`
- Infrastructure configuration in `infra/*`
- Service scaffolding rules in `tooling/service-template`
- PostgreSQL and Redis are shared infrastructure initially, while service data ownership remains explicit
- External client traffic enters through Caddy and the API Gateway
- Internal service-to-service communication is not required to traverse the public API Gateway

## Current implementation scope

Only these runtime components are approved for Phase 1:

1. `web`
2. `api-gateway`
3. `auth-service`
4. `catalog-service`
5. `admin-service`
6. PostgreSQL
7. Redis
8. Caddy

The wider marketplace service map is documented as future architecture. Unneeded services must not be implemented early.

## Core rule

The foundation must be capable of supporting the future service map, while complexity is introduced only when a real requirement justifies it.

See `docs/architecture/` for architectural decisions and constraints.
