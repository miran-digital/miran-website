import assert from "node:assert/strict";
import test from "node:test";
import { startPostgresServer } from "../postgres/server.js";

const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;

function baseUrl(server) {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unexpected server address");
  return `http://127.0.0.1:${address.port}`;
}

async function json(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

test(
  "PostgreSQL production HTTP runtime supports health, auth, session and address book",
  { skip: !databaseUrl },
  async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = databaseUrl;
    const runtime = await startPostgresServer({ port: 0, host: "127.0.0.1" });
    const origin = baseUrl(runtime.server);
    const suffix = Date.now().toString(36);
    try {
      const health = await fetch(`${origin}/health`);
      assert.equal(health.status, 200);
      assert.deepEqual(await json(health), {
        ok: true,
        service: "marketplace-core",
        database: "postgresql",
      });

      const email = `http-${suffix}@example.com`;
      const register = await fetch(`${origin}/v1/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: "very-secure-pass-123" }),
      });
      assert.equal(register.status, 201);
      const registered = await json(register);
      assert.equal(registered.email, email);
      assert.equal(registered.role, "CUSTOMER");

      const login = await fetch(`${origin}/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: "very-secure-pass-123" }),
      });
      assert.equal(login.status, 200);
      const loggedIn = await json(login);
      assert.ok(loggedIn.token);

      const unauthorized = await fetch(`${origin}/v1/addresses`);
      assert.equal(unauthorized.status, 401);

      const authorization = { authorization: `Bearer ${loggedIn.token}` };
      const me = await fetch(`${origin}/v1/me`, { headers: authorization });
      assert.equal(me.status, 200);
      assert.equal((await json(me)).email, email);

      const addressResponse = await fetch(`${origin}/v1/addresses`, {
        method: "POST",
        headers: {
          ...authorization,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          fullName: "HTTP Buyer",
          phone: "09120000000",
          province: "Tehran",
          city: "Tehran",
          addressLine: "HTTP street",
          postalCode: "1234567890",
          isDefault: true,
        }),
      });
      assert.equal(addressResponse.status, 201);
      const address = await json(addressResponse);
      assert.equal(address.isDefault, true);

      const list = await fetch(`${origin}/v1/addresses`, { headers: authorization });
      assert.equal(list.status, 200);
      const addresses = await json(list);
      assert.ok(addresses.some((item) => item.id === address.id));

      const logout = await fetch(`${origin}/v1/auth/logout`, {
        method: "POST",
        headers: authorization,
      });
      assert.equal(logout.status, 204);
      const expired = await fetch(`${origin}/v1/me`, { headers: authorization });
      assert.equal(expired.status, 401);
      const expiredBody = await json(expired);
      assert.equal(expiredBody.error, "UNAUTHORIZED");
    } finally {
      await runtime.close();
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  },
);