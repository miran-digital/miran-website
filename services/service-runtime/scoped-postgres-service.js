import { createServer, request as httpRequest } from "node:http";
import { spawn } from "node:child_process";
import { startPostgresServer } from "../marketplace-core/postgres/server.js";

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(data);
}

function matchesScope(pathname, exact, prefixes) {
  return exact.includes(pathname) || prefixes.some((prefix) => pathname.startsWith(prefix));
}

function proxyRequest(req, res, targetPort) {
  return new Promise((resolve) => {
    const upstream = httpRequest(
      {
        hostname: "127.0.0.1",
        port: targetPort,
        method: req.method,
        path: req.url,
        headers: {
          ...req.headers,
          host: `127.0.0.1:${targetPort}`,
          "x-miran-scoped-service": req.miranServiceName || "unknown",
        },
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        upstreamRes.pipe(res);
        upstreamRes.once("end", resolve);
      },
    );

    upstream.setTimeout(30_000, () => upstream.destroy(new Error("UPSTREAM_TIMEOUT")));
    upstream.once("error", (error) => {
      if (!res.headersSent) {
        json(res, 502, { error: "UPSTREAM_UNAVAILABLE", message: error.message });
      } else {
        res.destroy(error);
      }
      resolve();
    });
    req.pipe(upstream);
  });
}

export async function startScopedPostgresService({
  serviceName,
  exactPaths = [],
  prefixes = [],
  runMaintenance = false,
  port = Number(process.env.PORT || 3001),
  host = process.env.HOST || "0.0.0.0",
  corePort = Number(process.env.SCOPED_CORE_PORT || 3901),
} = {}) {
  if (!serviceName) throw new Error("serviceName is required");

  const core = await startPostgresServer({ port: corePort, host: "127.0.0.1" });
  let maintenance = null;
  if (runMaintenance) {
    maintenance = spawn(process.execPath, ["services/marketplace-core/postgres/maintenance.js"], {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_APPLICATION_NAME: `${serviceName}-maintenance`,
      },
    });
    maintenance.once("exit", (code, signal) => {
      if (code && code !== 0) {
        console.error(`${serviceName} maintenance exited unexpectedly`, { code, signal });
      }
    });
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/health") {
        const response = await fetch(`http://127.0.0.1:${corePort}/health`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) throw new Error("CORE_HEALTH_FAILED");
        return json(res, 200, {
          ok: true,
          service: serviceName,
          database: "postgresql",
          boundary: "phase1-independent-runtime",
        });
      }

      if (!matchesScope(url.pathname, exactPaths, prefixes)) {
        return json(res, 404, { error: "NOT_FOUND", service: serviceName });
      }

      req.miranServiceName = serviceName;
      await proxyRequest(req, res, corePort);
    } catch (error) {
      console.error(`${serviceName} request failed`, {
        method: req.method,
        path: req.url?.split("?", 1)[0],
        name: error?.name,
        message: error?.message,
      });
      if (!res.headersSent) {
        json(res, 503, { error: "SERVICE_UNAVAILABLE", service: serviceName });
      }
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    await new Promise((resolve) => server.close(resolve));
    if (maintenance && !maintenance.killed) {
      maintenance.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 5_000);
        maintenance.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    await core.close();
  }

  async function shutdown(signal) {
    console.log(`${serviceName} received ${signal}; shutting down`);
    try {
      await close();
      process.exitCode = 0;
    } catch (error) {
      console.error(`${serviceName} shutdown failed`, { message: error?.message });
      process.exitCode = 1;
    }
  }

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));

  console.log(`${serviceName} listening`, { host, port, corePort });
  return { server, core, close };
}
