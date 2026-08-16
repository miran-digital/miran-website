import { startScopedPostgresService } from "../../service-runtime/scoped-postgres-service.js";

await startScopedPostgresService({
  serviceName: "auth-service",
  exactPaths: ["/v1/me", "/v1/addresses"],
  prefixes: ["/v1/auth/", "/v1/addresses/"],
});
