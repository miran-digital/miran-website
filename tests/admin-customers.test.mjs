import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createD1Database } from "./helpers/d1.mjs";
import { queryAdminCustomerDirectory, readAdminCustomerProfile } from "../db/admin-customer-directory-repository.ts";
import { loadAdminCustomerDirectoryPage, parseCustomerDirectoryOptions } from "../lib/admin-customer-directory.ts";
import { adminOrderHref, customerProfileHref } from "../lib/admin-navigation.ts";
import { createOrderRecord } from "../db/order-repository.ts";
import { getAdminOrders } from "../features/orders/admin-orders.ts";

const options = { query: "", sort: "newest", page: 1, pageSize: 25 };
const source = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

function account(sqlite, id, email, name = id, created = "2026-08-01T00:00:00Z") {
  sqlite.prepare("INSERT INTO customer_accounts (auth_user_id, email, full_name, provider, created_at, last_seen_at) VALUES (?, ?, ?, 'supabase', ?, ?)").run(id, email, name, created, created);
}

function order(sqlite, id, email, { currency = "IRR", paid = false, amount = 1000, created = "2026-08-01T00:00:00Z" } = {}) {
  sqlite.prepare(`INSERT INTO orders (id, order_number, idempotency_key, status, payment_status, customer_name, customer_email, customer_phone,
    address_line, city, postcode, delivery_method, currency, subtotal_minor, delivery_minor, total_minor, created_at)
    VALUES (?, ?, ?, 'new', ?, 'خریدار', ?, '09120000000', 'نشانی', 'تهران', '', 'standard', ?, ?, 0, ?, ?)`)
    .run(id, "MS-" + id, "key-" + id, paid ? "paid" : "pending", email, currency, amount, amount, created);
}

test("V56 removes decorative admin headers and retains accessible section labels", async () => {
  const [page, report, care, directory, css] = await Promise.all([
    source("features/admin/admin-page.tsx"), source("features/admin/admin-reports-panel.tsx"), source("features/admin/customer-care-panel.tsx"),
    source("features/admin/customer-directory-panel.tsx"), source("features/admin/admin.module.css"),
  ]);
  assert.doesNotMatch(page, /<Heading|kicker=|Storefront CMS|kicker="Catalog"/);
  assert.match(page, /<h1 className=\{styles\.visuallyHidden\} id=\{id\}/);
  assert.match(css, /\.visuallyHidden\s*\{[^}]*position: absolute/);
  assert.match(report, /aria-label="گزارش فروش و سلامت عملیات"/);
  assert.doesNotMatch(report + care, /Reporting & Operations|Customer Care/);
  assert.match(care, /aria-label="پشتیبانی و دیدگاه مشتریان"/);
  assert.match(directory, /visuallyHidden.*customer-directory-title/);
  assert.match(page, /محصولات هر دسته/);
  assert.match(page, /styles\.messageCenter/);
  assert.match(css, /\.adminBody\s*\{\s*padding-block-start: var\(--miran-space-3\)/);
});

test("V56 keeps one full-height product row, independent bodies and natural mobile scrolling", async () => {
  const [page, css] = await Promise.all([source("features/admin/admin-page.tsx"), source("features/admin/admin.module.css")]);
  const desktop = css.slice(css.indexOf("@media (min-width: 64rem)"));
  assert.match(desktop, /\.productSection\s*\{[^}]*grid-template-rows: minmax\(0, 1fr\)/);
  assert.match(desktop, /\.productList\s*\{[^}]*grid-template-rows: auto minmax\(0, 1fr\);[^}]*overflow-y: hidden/);
  assert.match(desktop, /\.productListBody\s*\{[^}]*overflow-y: auto/);
  assert.match(desktop, /\.productForm\s*\{[^}]*overflow-y: auto/);
  assert.match(css.slice(0, css.indexOf("@media (min-width: 64rem)")), /\.productForm,\s*\.productList\s*\{[^}]*max-height: none;[^}]*overflow: visible/);
  assert.match(page, /styles\.productListHeader[\s\S]*styles\.productListBody/);
  assert.match(page, /scrollIntoView\(\{ behavior: "smooth", block: "center", inline: "nearest" \}\)/);
  assert.match(page, /focus\(\{ preventScroll: true \}\)/);
});

test("V56 compact customer rows have search, sorting, bounded pagination and no destructive controls", async () => {
  const [list, css, detail, page, route] = await Promise.all([
    source("features/admin/customer-directory-panel.tsx"), source("features/admin/customer-directory-panel.module.css"),
    source("features/admin/customer-detail-panel.tsx"), source("features/admin/admin-page.tsx"), source("app/api/admin/customers/[customerId]/route.ts"),
  ]);
  assert.match(list, /<table[\s\S]*<thead>[\s\S]*<tbody>/);
  assert.match(list, /customerProfileHref\(customer.customerId\)/);
  assert.match(list, /type="search"/);
  assert.match(list, /value=\{25\}[\s\S]*value=\{50\}/);
  assert.match(list, /AbortController[\s\S]*controller.abort/);
  assert.doesNotMatch(list + detail, /method: "(?:POST|PATCH|DELETE)"|حذف کامل|پاک‌سازی اطلاعات|ابتدا سفارش.*حذف/);
  assert.match(css, /@media \(min-width: 64rem\)[\s\S]*overflow-y: auto[\s\S]*position: sticky; top: 0/);
  assert.match(css, /@media \(max-width: 63\.99rem\)[\s\S]*max-height: none; overflow: visible/);
  assert.match(page, /!selectedCustomerId && \(can\("support.write"\)/);
  assert.match(detail, /adminOrderHref\(order.id\)/);
  assert.match(route, /getAdminAccess\("customers.read"\)/);
  assert.match(route, /cache-control": "private, no-store"/);
  assert.doesNotMatch(route, /export async function (?:POST|PATCH|DELETE)/);
});

test("V56 validates list parameters without allowing SQL fragments", () => {
  assert.deepEqual(parseCustomerDirectoryOptions(new URLSearchParams("sort=DROP%20TABLE&page=-1&pageSize=100")), options);
  assert.deepEqual(parseCustomerDirectoryOptions(new URLSearchParams("q=Alice&sort=orders&page=2&pageSize=50")), { query: "Alice", sort: "orders", page: 2, pageSize: 50 });
});

test("V56 customer search, every sort and 25/50 pagination use complete server data", async () => {
  const d1 = await createD1Database();
  try {
    for (let n = 1; n <= 60; n++) account(d1.sqlite, "a" + n, "person" + n + "@example.com", n === 1 ? "علی کاظمی" : "Name " + String(n).padStart(2, "0"), new Date(Date.UTC(2026, 0, n)).toISOString());
    order(d1.sqlite, "one", "person1@example.com");
    order(d1.sqlite, "two", "person1@example.com");
    const first = await queryAdminCustomerDirectory(options, [], d1.database);
    assert.equal(first.total, 60); assert.equal(first.customers.length, 25); assert.equal(first.totalPages, 3);
    assert.equal(first.customers[0].authUserId, "a60");
    const last = await queryAdminCustomerDirectory({ ...options, page: 3 }, [], d1.database);
    assert.equal(last.customers.length, 10);
    assert.equal((await queryAdminCustomerDirectory({ ...options, pageSize: 50 }, [], d1.database)).customers.length, 50);
    assert.equal((await queryAdminCustomerDirectory({ ...options, sort: "oldest" }, [], d1.database)).customers[0].authUserId, "a1");
    assert.equal((await queryAdminCustomerDirectory({ ...options, sort: "name" }, [], d1.database)).customers[0].fullName, "Name 02");
    assert.equal((await queryAdminCustomerDirectory({ ...options, sort: "orders" }, [], d1.database)).customers[0].orderCount, 2);
    assert.equal((await queryAdminCustomerDirectory({ ...options, sort: "activity" }, [], d1.database)).customers[0].authUserId, "a1");
    assert.equal((await queryAdminCustomerDirectory({ ...options, query: "علي كاظمي" }, [], d1.database)).total, 1);
    assert.equal((await queryAdminCustomerDirectory({ ...options, query: "PERSON60@EXAMPLE.COM" }, [], d1.database)).total, 1);
    assert.equal((await queryAdminCustomerDirectory({ ...options, query: "' OR 1=1 --" }, [], d1.database)).total, 0);
  } finally { d1.close(); }
});

test("V56 does not silently cap store customers at 1000", async () => {
  const d1 = await createD1Database();
  try {
    d1.sqlite.exec("BEGIN");
    for (let n = 0; n < 1003; n++) account(d1.sqlite, "many-" + n, "many" + n + "@example.com");
    d1.sqlite.exec("COMMIT");
    const page = await queryAdminCustomerDirectory({ ...options, page: 41 }, [], d1.database);
    assert.equal(page.total, 1003); assert.equal(page.customers.length, 3);
  } finally { d1.close(); }
});

test("V56 merges auth identities without duplicate customers or fabricated last activity", async () => {
  const d1 = await createD1Database();
  try {
    account(d1.sqlite, "account-a", "alice@example.com", "نام قبلی");
    const auth = [{ id: "account-a", email: "alice@example.com", fullName: "نام تأییدشده", emailConfirmedAt: "2026-08-02", createdAt: "2026-08-01" },
      { id: "auth-only", email: "new@example.com", fullName: "جدید", emailConfirmedAt: "", createdAt: "2026-08-03" }];
    const list = await queryAdminCustomerDirectory(options, auth, d1.database);
    assert.equal(list.total, 2);
    const alice = list.customers.find((item) => item.email === "alice@example.com");
    assert.equal(alice.fullName, "نام تأییدشده"); assert.equal(alice.emailConfirmedAt, "2026-08-02");
    const profile = await readAdminCustomerProfile("auth:auth-only", {}, auth, d1.database);
    assert.equal(profile.customer.lastSeenAt, ""); assert.equal(profile.customer.email, "new@example.com");
  } finally { d1.close(); }
});

test("V56 profiles isolate orders, addresses, support, reviews and safe payment references without writes", async () => {
  const d1 = await createD1Database();
  try {
    account(d1.sqlite, "alice", "alice@example.com", "Alice"); account(d1.sqlite, "bob", "bob@example.com", "Bob");
    order(d1.sqlite, "alice-order", "alice@example.com", { paid: true, amount: 5000 });
    order(d1.sqlite, "alice-legacy", "alice@example.com", { paid: true, amount: 100, currency: "GBP" });
    order(d1.sqlite, "bob-order", "bob@example.com", { paid: true, amount: 999999 });
    d1.sqlite.prepare("INSERT INTO customer_addresses (id, owner_email, recipient_name, phone, address_line, city, province) VALUES ('alice-address', 'alice@example.com', 'Alice', '09123333333', 'Alice private address', 'تهران', 'تهران')").run();
    d1.sqlite.prepare("INSERT INTO support_tickets (id, ticket_number, customer_email, customer_name, subject) VALUES ('ticket-a', 'T-A', 'alice@example.com', 'Alice', 'Alice ticket')").run();
    d1.sqlite.prepare("INSERT INTO product_reviews (id, product_id, customer_email, customer_name, order_id, rating, body) VALUES ('review-a', 'missing-product', 'alice@example.com', 'Alice', 'alice-order', 4, 'Alice review')").run();
    d1.sqlite.prepare("INSERT INTO order_items (id, order_id, product_id, slug, sku, title, quantity, unit_price_minor, line_total_minor) VALUES ('item-a', 'alice-order', 'p', 'p', 'SKU-A', 'Alice product', 1, 5000, 5000)").run();
    d1.sqlite.prepare("INSERT INTO payment_attempts (id, order_id, provider, authority, status, amount_minor, provider_reference) VALUES ('pa', 'alice-order', 'zarinpal', 'PRIVATE-AUTHORITY', 'paid', 5000, '123456')").run();
    const changes = d1.sqlite.prepare("SELECT total_changes() count").get().count;
    const alice = await readAdminCustomerProfile("auth:alice", {}, [], d1.database);
    assert.deepEqual(alice.orders.map((o) => o.id).sort(), ["alice-legacy", "alice-order"]);
    assert.equal(alice.addresses.length, 1); assert.equal(alice.tickets[0].id, "ticket-a"); assert.equal(alice.reviews[0].id, "review-a");
    assert.equal(alice.paidTotalRial, 5000); assert.equal(alice.legacyPaidOrderCount, 1);
    assert.equal(alice.orders.find((o) => o.id === "alice-order").items[0].sku, "SKU-A");
    assert.equal(alice.orders.find((o) => o.id === "alice-order").payments[0].reference, "123456");
    assert.doesNotMatch(JSON.stringify(alice), /PRIVATE-AUTHORITY|bob@example/);
    const bob = await readAdminCustomerProfile("auth:bob", {}, [], d1.database);
    assert.equal(bob.orders.length, 1); assert.equal(bob.addresses.length, 0); assert.equal(bob.reviews.length, 0);
    assert.equal(await readAdminCustomerProfile("alice@example.com", {}, [], d1.database), null);
    assert.equal(await readAdminCustomerProfile("unknown:alice", {}, [], d1.database), null);
    assert.equal(d1.sqlite.prepare("SELECT total_changes() count").get().count, changes);
  } finally { d1.close(); }
});

test("V56 legacy identities use existing keys and all customer order pages remain reachable", async () => {
  const d1 = await createD1Database();
  try {
    for (let n = 0; n < 27; n++) order(d1.sqlite, "legacy-" + n, "legacy@example.com", { created: new Date(Date.UTC(2026, 0, n + 1)).toISOString() });
    const list = await queryAdminCustomerDirectory(options, [], d1.database);
    const id = list.customers[0].customerId;
    assert.equal(id, "order:legacy-0");
    assert.doesNotMatch(customerProfileHref(id), /legacy@example|%40/);
    const first = await readAdminCustomerProfile(id, {}, [], d1.database);
    const second = await readAdminCustomerProfile(id, { ordersPage: 2 }, [], d1.database);
    assert.equal(first.orders.length, 25); assert.equal(second.orders.length, 2);
    assert.equal(new Set([...first.orders, ...second.orders].map((o) => o.id)).size, 27);
    assert.equal(adminOrderHref(second.orders[0].id), "/admin?tab=orders&order=" + second.orders[0].id);
  } finally { d1.close(); }
});

test("V56 list failures stay explicit instead of returning fake zero customers", async () => {
  const logs = [];
  const dependencies = {
    queryCustomers: async () => ({ customers: [], total: 0, page: 1, pageSize: 25, totalPages: 1 }),
    listAuthUsers: async () => { throw new Error("SUPABASE_ADMIN_UNAVAILABLE private-user@example.com"); },
    logFailure: (...args) => logs.push(args),
  };
  const fallback = await loadAdminCustomerDirectoryPage(dependencies);
  assert.equal(fallback.ok, true); assert.equal(fallback.payload.supabaseAdminReady, false); assert.ok(fallback.payload.warning);
  const failed = await loadAdminCustomerDirectoryPage({ ...dependencies, queryCustomers: async () => { throw new Error("D1_UNAVAILABLE private-user@example.com"); } });
  assert.deepEqual(failed, { ok: false }); assert.doesNotMatch(JSON.stringify(logs), /private-user/);
});

test("V56 an older customer order opens exactly that order, never the first recent order", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requests.push(url);
    return Response.json(url === "/api/admin/orders"
      ? { orders: [{ id: "recent-order" }] }
      : { order: { id: "older-order" } });
  });
  const orders = await getAdminOrders("older-order");
  assert.deepEqual(orders.map((item) => item.id), ["older-order", "recent-order"]);
  assert.deepEqual(requests, ["/api/admin/orders", "/api/admin/orders?id=older-order"]);
  await assert.rejects(getAdminOrders("missing-order"), /پیدا نشد/);
});

test("V56 abandoned checkout has no order creation path and validation precedes final creation", async () => {
  const [checkout, route, addressRoute] = await Promise.all([source("features/checkout/checkout-page.tsx"), source("app/api/orders/route.ts"), source("app/api/account/addresses/route.ts")]);
  assert.equal((checkout.match(/fetch\("\/api\/orders"/g) ?? []).length, 1);
  assert.doesNotMatch(checkout.slice(0, checkout.indexOf("async function submitOrder")), /\/api\/orders/);
  assert.doesNotMatch(addressRoute, /createOrderRecord|INSERT INTO orders/);
  const call = route.indexOf("const order = await createOrderRecord");
  for (const guard of ["rejectCrossSiteMutation", "getCustomerUser", "rejectRateLimited", "isUuid(addressId)", "payload.lines.length < 1", "getOwnedCustomerAddress", "getCatalogProduct", "quantity > availableQuantity", "selectedPrice.currency !== IRAN_CURRENCY"]) {
    assert.ok(route.indexOf(guard) >= 0 && route.indexOf(guard) < call, guard);
  }
  assert.match(checkout, /step === "review"[\s\S]*submitOrder/);
});

test("V56 a final valid submission creates one idempotent unpaid order", async () => {
  const d1 = await createD1Database();
  try {
    const input = orderInput(d1.sqlite);
    const first = await createOrderRecord(input, d1.database);
    const retry = await createOrderRecord(input, d1.database);
    assert.equal(first.id, retry.id); assert.equal(first.items.length, 1); assert.equal(first.paymentStatus, "not_collected");
    assert.equal(d1.sqlite.prepare("SELECT COUNT(*) count FROM orders").get().count, 1);
    assert.equal(d1.sqlite.prepare("SELECT reserved_quantity FROM products WHERE id = ?").get(input.lines[0].productId).reserved_quantity, 1);
  } finally { d1.close(); }
});

test("V56 dependency and reservation failures leave no incomplete order or reserved stock", async () => {
  for (const failure of [/INSERT INTO order_items/, /UPDATE products\s+SET reserved_quantity/]) {
    const d1 = await createD1Database();
    try {
      const input = orderInput(d1.sqlite);
      d1.failNext(failure);
      await assert.rejects(createOrderRecord(input, d1.database), /D1_TEST_FAILURE/);
      assert.equal(d1.sqlite.prepare("SELECT COUNT(*) count FROM orders").get().count, 0);
      assert.equal(d1.sqlite.prepare("SELECT COUNT(*) count FROM order_items").get().count, 0);
      assert.equal(d1.sqlite.prepare("SELECT reserved_quantity FROM products WHERE id = ?").get(input.lines[0].productId).reserved_quantity, 0);
    } finally { d1.close(); }
  }
});

function orderInput(sqlite) {
  const product = sqlite.prepare("SELECT id, slug, title FROM products LIMIT 1").get();
  sqlite.prepare("UPDATE products SET visible = 1, stock_quantity = 10, reserved_quantity = 0 WHERE id = ?").run(product.id);
  return { idempotencyKey: crypto.randomUUID(), customerName: "Test", customerEmail: "test@example.com", customerPhone: "09120000000", addressSourceId: "a", addressLabel: "خانه", addressLine: "نشانی", city: "تهران", province: "تهران", postcode: "", latitude: null, longitude: null, deliveryMethod: "standard", currency: "IRR", deliveryMinor: 0, reservationMinutes: 30,
    lines: [{ productId: product.id, variantId: "", sellerOfferId: "", selectionLabel: "", slug: product.slug, sku: "TEST", title: product.title, quantity: 1, unitPriceMinor: 1000 }] };
}
