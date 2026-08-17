import { startScopedPostgresService } from "../../service-runtime/scoped-postgres-service.js";
import { catalogDomainBoundaries } from "./domain-boundaries.js";

await startScopedPostgresService({
  serviceName: "catalog-service",
  domains: catalogDomainBoundaries,
  runMaintenance: true,
});
