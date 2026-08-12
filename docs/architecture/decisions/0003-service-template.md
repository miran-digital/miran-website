# ADR 0003: Standard service template

Status: Accepted for Phase 1

## Context

Miran Shop may grow to dozens of services. Creating each service with a different folder structure, health model, configuration style, error format, logging approach, or test strategy would create operational debt.

## Decision

Every new backend service starts from the standard documented in `tooling/service-template`.

The template separates:

- domain rules
- application use-cases
- infrastructure adapters
- external interfaces
- configuration
- migrations
- tests

The template is deliberately framework-light. Shared standards will be introduced as reusable technical packages only after at least one real consumer exists.

## Mandatory future service capabilities

When a service becomes executable, it must have a consistent approach for:

- typed configuration validation
- structured logging
- request/correlation IDs
- liveness and readiness endpoints
- API versioning and OpenAPI where applicable
- input/output validation
- graceful shutdown
- database migrations if it owns persistence
- unit/integration tests appropriate to its boundary

## Consequences

The platform gains repeatable service creation without pre-building thirty empty deployables or prematurely introducing distributed-systems infrastructure.
