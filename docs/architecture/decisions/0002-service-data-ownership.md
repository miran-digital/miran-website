# ADR 0002: Service data ownership

Status: Accepted for Phase 1

## Context

Phase 1 uses one PostgreSQL instance for operational simplicity, but Miran Shop must avoid a shared-database monolith that prevents future service extraction.

## Decision

Each domain service owns its schema, migrations, and persistence access.

Initial examples:

- `auth-service` owns authentication and authorization persistence.
- `catalog-service` owns product, category, brand, attribute, and variant catalog persistence.
- `api-gateway` owns no business tables.
- `admin-service` orchestrates administrative operations through service contracts rather than directly modifying another service's tables.

## Rules

1. No cross-service direct table reads or writes by default.
2. Database credentials should be scoped to a service's owned schema when implementation begins.
3. A shared PostgreSQL instance is a deployment choice, not shared ownership.
4. Redis keys must be namespaced by owning capability/service.
5. Data required from another service is obtained through an explicit contract or, when justified later, asynchronous integration events.
6. Pricing, inventory, reviews, search indexing, seller offers, and other future domains must not be permanently embedded in catalog ownership merely because those services do not exist yet.

## Consequences

A service can later move to a separate database or deployment unit without forcing consumers to rewrite around its storage model.
