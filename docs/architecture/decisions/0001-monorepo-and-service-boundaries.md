# ADR 0001: Monorepo and service boundaries

Status: Accepted for Phase 1

## Context

Miran Shop needs a small initial implementation but a repository structure capable of supporting a large marketplace service map later.

## Decision

Use a pnpm workspace monorepo with four top-level concerns:

- `apps/*` for user-facing deployable applications
- `services/*` for independently deployable backend processes
- `packages/*` for narrowly scoped technical libraries and contracts
- `infra/*` for infrastructure configuration

A standard service template is maintained under `tooling/service-template`.

## Constraints

- A roadmap service is not created until there is a real requirement.
- Deployability does not imply that every service must be deployed separately in early environments.
- Service boundaries must not depend on directory imports into another service's internal code.
- A service may expose a versioned contract; consumers depend on the contract, not its persistence implementation.
- The public API Gateway is an edge boundary, not a mandatory hop for all internal service-to-service traffic.

## Consequences

New services can be introduced consistently without reorganizing the repository, while Phase 1 remains operationally simple.
