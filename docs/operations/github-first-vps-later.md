# Miran Shop delivery order

Current project delivery policy:

1. Finish and harden all eight production services in GitHub CI first.
2. Resolve application, integration, container, security, data-safety, RTL/mobile, and smoke-test defects before purchasing or configuring a VPS.
3. Keep production deployment manual and dormant until the GitHub phase is signed off.
4. Do not require Production SSH secrets during the GitHub-only phase.
5. After GitHub sign-off, select and prepare a VPS, create a real full backup/migration plan, configure Cloudflare DNS and Caddy, and then deploy the exact approved commit.
6. Do not report production deployment or live verification before the VPS phase actually happens.

The required runtime architecture remains exactly eight services: web, api-gateway, auth-service, catalog-service, admin-service, postgres, redis, and caddy.
