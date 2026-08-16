import { startScopedPostgresService } from "../../service-runtime/scoped-postgres-service.js";

await startScopedPostgresService({
  serviceName: "admin-service",
  exactPaths: ["/v1/products", "/v1/manage/products"],
  prefixes: ["/v1/admin/", "/v1/products/", "/v1/manage/"],
});
