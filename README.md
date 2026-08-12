# Miran Shop

Phase 1 storefront and local Admin Preview for the Miran marketplace platform.

## Run locally

Requirements: Node.js 24 and pnpm 11.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev:web
```

Open `http://localhost:3000` for the storefront. The local Admin Preview is at `http://localhost:3000/admin`.

Admin Preview is deliberately not linked from the public storefront and is not production authentication. The security and persistence boundaries are documented in [ADR 0004](docs/architecture/decisions/0004-preview-and-production-boundaries.md).

## Verify

```bash
pnpm typecheck
pnpm build
```

Search indexing is disabled by default. Set `SITE_INDEXABLE=true` only after the production domain, legal copy, service integrations, and launch review are complete.
