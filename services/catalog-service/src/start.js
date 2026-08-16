import { startScopedPostgresService } from "../../service-runtime/scoped-postgres-service.js";

await startScopedPostgresService({
  serviceName: "catalog-service",
  exactPaths: [
    "/v1/storefront",
    "/v1/catalog/categories",
    "/v1/catalog/products",
    "/v1/cart",
    "/v1/shipping/methods",
    "/v1/sellers",
    "/v1/sellers/me",
    "/v1/orders",
  ],
  prefixes: [
    "/v1/catalog/",
    "/v1/cart/",
    "/v1/sellers/",
    "/v1/orders/",
    "/v1/checkout/",
    "/v1/payments/",
  ],
  runMaintenance: true,
});
