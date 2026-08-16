# Miran Shop production boundary

- Canonical production storefront domain: `https://almiran.ir`
- Planned API origin: `https://api.almiran.ir`
- `main` remains protected from unverified backend changes.
- Marketplace Core changes must pass CI before merge.
- Production database credentials, payment credentials, and session secrets must be supplied only through the deployment secret store; they must never be committed.
- SQLite in `services/marketplace-core` is a CI/development adapter only. Production persistence is planned for PostgreSQL behind the same domain contracts.
- Search indexing must remain disabled until the production domain, legal pages, API connectivity, authentication, checkout and payment verification are explicitly validated.
