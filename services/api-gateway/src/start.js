import { createServer, request as httpRequest } from "node:http";
import { connect } from "node:net";

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "0.0.0.0";
const authBase = new URL(process.env.AUTH_SERVICE_URL || "http://auth-service:3001");
const catalogBase = new URL(process.env.CATALOG_SERVICE_URL || "http://catalog-service:3001");
const adminBase = new URL(process.env.ADMIN_SERVICE_URL || "http://admin-service:3001");
const redisUrl = new URL(process.env.REDIS_URL || "redis://redis:6379");
const requestTimeoutMs = Number(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS || 30_000);
const authRateLimit = Number(process.env.GATEWAY_AUTH_RATE_LIMIT_PER_MINUTE || 30);

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(data);
}

function encodeRedisCommand(args) {
  let value = `*${args.length}\r\n`;
  for (const arg of args) {
    const text = String(arg);
    value += `$${Buffer.byteLength(text)}\r\n${text}\r\n`;
  }
  return value;
}

function parseRedisReply(buffer) {
  const text = buffer.toString("utf8");
  const type = text[0];
  const lineEnd = text.indexOf("\r\n");
  if (lineEnd < 0) return null;
  const head = text.slice(1, lineEnd);
  if (type === "+") return { value: head };
  if (type === ":") return { value: Number(head) };
  if (type === "-") throw new Error(`Redis error: ${head}`);
  if (type === "$" && Number(head) === -1) return { value: null };
  if (type === "$") {
    const size = Number(head);
    const start = lineEnd + 2;
    if (buffer.length < start + size + 2) return null;
    return { value: buffer.subarray(start, start + size).toString("utf8") };
  }
  throw new Error("Unsupported Redis response");
}

function redisCommand(args) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: redisUrl.hostname, port: Number(redisUrl.port || 6379) });
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => socket.destroy(new Error("Redis timeout")), 2_000);
    socket.once("connect", () => socket.write(encodeRedisCommand(args)));
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        const parsed = parseRedisReply(buffer);
        if (!parsed) return;
        clearTimeout(timer);
        socket.end();
        resolve(parsed.value);
      } catch (error) {
        clearTimeout(timer);
        socket.destroy();
        reject(error);
      }
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function checkRateLimit(req, pathname) {
  if (req.method !== "POST" || !["/v1/auth/login", "/v1/auth/register"].includes(pathname)) {
    return { allowed: true };
  }
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",", 1)[0].trim();
  const ip = forwarded || req.socket.remoteAddress || "unknown";
  const bucket = Math.floor(Date.now() / 60_000);
  const key = `miran:gateway:auth:${ip}:${bucket}`;
  const count = Number(await redisCommand(["INCR", key]));
  if (count === 1) await redisCommand(["EXPIRE", key, "70"]);
  return { allowed: count <= authRateLimit, count };
}

function targetFor(pathname) {
  if (
    pathname === "/v1/me" ||
    pathname === "/v1/addresses" ||
    pathname.startsWith("/v1/auth/") ||
    pathname.startsWith("/v1/addresses/")
  ) {
    return { name: "auth-service", base: authBase };
  }
  if (
    pathname === "/v1/products" ||
    pathname === "/v1/manage/products" ||
    pathname.startsWith("/v1/admin/") ||
    pathname.startsWith("/v1/products/") ||
    pathname.startsWith("/v1/manage/")
  ) {
    return { name: "admin-service", base: adminBase };
  }
  if (pathname === "/v1/storefront" || pathname.startsWith("/v1/")) {
    return { name: "catalog-service", base: catalogBase };
  }
  return null;
}

function proxy(req, res, target) {
  return new Promise((resolve) => {
    const upstream = httpRequest(
      {
        protocol: target.base.protocol,
        hostname: target.base.hostname,
        port: Number(target.base.port || 80),
        method: req.method,
        path: req.url,
        headers: {
          ...req.headers,
          host: target.base.host,
          "x-forwarded-proto": String(req.headers["x-forwarded-proto"] || "http"),
          "x-miran-gateway": "api-gateway",
        },
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, {
          ...upstreamRes.headers,
          "x-miran-upstream": target.name,
        });
        upstreamRes.pipe(res);
        upstreamRes.once("end", resolve);
      },
    );
    upstream.setTimeout(requestTimeoutMs, () => upstream.destroy(new Error("UPSTREAM_TIMEOUT")));
    upstream.once("error", (error) => {
      console.error("api-gateway upstream failed", { target: target.name, message: error.message });
      if (!res.headersSent) {
        sendJson(res, 502, { error: "UPSTREAM_UNAVAILABLE", service: target.name });
      } else {
        res.destroy(error);
      }
      resolve();
    });
    req.pipe(upstream);
  });
}

async function serviceHealth(name, base) {
  const response = await fetch(new URL("/health", base), { signal: AbortSignal.timeout(4_000) });
  if (!response.ok) throw new Error(`${name} health returned ${response.status}`);
  return response.json();
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") {
      const [redis, auth, catalog, admin] = await Promise.all([
        redisCommand(["PING"]),
        serviceHealth("auth-service", authBase),
        serviceHealth("catalog-service", catalogBase),
        serviceHealth("admin-service", adminBase),
      ]);
      return sendJson(res, 200, {
        ok: redis === "PONG" && auth.ok && catalog.ok && admin.ok,
        service: "api-gateway",
        redis: redis === "PONG" ? "ready" : "unavailable",
        downstream: {
          auth: auth.service,
          catalog: catalog.service,
          admin: admin.service,
        },
      });
    }

    const target = targetFor(url.pathname);
    if (!target) return sendJson(res, 404, { error: "NOT_FOUND" });

    const limit = await checkRateLimit(req, url.pathname);
    if (!limit.allowed) {
      res.setHeader("retry-after", "60");
      return sendJson(res, 429, { error: "RATE_LIMITED" });
    }

    await proxy(req, res, target);
  } catch (error) {
    console.error("api-gateway request failed", {
      method: req.method,
      path: req.url?.split("?", 1)[0],
      message: error?.message,
    });
    if (!res.headersSent) sendJson(res, 503, { error: "GATEWAY_UNAVAILABLE" });
  }
});

server.listen(port, host, () => console.log("api-gateway listening", { host, port }));

function shutdown(signal) {
  console.log(`api-gateway received ${signal}; shutting down`);
  server.close(() => {
    process.exitCode = 0;
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
