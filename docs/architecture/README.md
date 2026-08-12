# Miran Shop Architecture

## Objective

Build an enterprise-grade marketplace foundation that can support the planned domain-service map without creating thirty unused services on day one.

## Structural principles

1. Service boundaries are defined before scale requires physical separation.
2. Only approved Phase 1 runtime components are implemented now.
3. Each service owns its internal data and migrations.
4. Cross-service database reads and writes are forbidden by default.
5. Browser/client API traffic enters through the API Gateway.
6. Internal service communication may use internal HTTP/RPC contracts or future asynchronous events; forcing all internal traffic through the public gateway is explicitly avoided.
7. Shared packages contain technical primitives and contracts, not a shared business-domain database model.
8. Observability, security, health checks, configuration, errors, testing, and API versioning use repeatable standards.
9. New infrastructure such as Kafka, RabbitMQ, Elasticsearch/OpenSearch, Kubernetes, or separate database instances requires an actual need and explicit approval.
10. The storefront consumes stable application-facing interfaces so mock data can later be replaced by real APIs without page rewrites.

## Planned domain-service map

The architecture must be able to accommodate the following future services without redesigning the repository foundation:

- admin-service
- analytics-service
- audit-service
- auth-service
- cart-service
- catalog-service
- cms-service
- commission-service
- email-template-service
- fraud-service
- inventory-service
- media-service
- notification-service
- order-service
- payment-service
- pricing-service
- promotion-service
- recommendation-service
- reporting-service
- review-service
- search-service
- seller-service
- seo-service
- shipment-service
- support-service
- tax-service
- user-service
- vendor-payout-service
- warehouse-service
- wishlist-service

This list is a roadmap, not an instruction to deploy all services now.
