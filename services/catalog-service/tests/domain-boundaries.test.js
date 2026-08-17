import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCatalogDomainBoundaries,
  catalogDomainBoundaries,
  resolveCatalogDomain,
} from "../src/domain-boundaries.js";

const expectedDomains = [
  "catalog",
  "cart",
  "inventory",
  "pricing",
  "promotion",
  "shipping",
  "checkout",
  "order",
  "payment",
  "seller",
];

test("catalog compatibility boundary declares the planned extraction domains", () => {
  assert.deepEqual(
    catalogDomainBoundaries.map(({ name }) => name),
    expectedDomains,
  );
  assert.equal(assertCatalogDomainBoundaries(catalogDomainBoundaries), true);
});

test("existing public and customer routes resolve to one stable domain owner", () => {
  const cases = [
    ["/v1/storefront", "catalog"],
    ["/v1/catalog/categories", "catalog"],
    ["/v1/catalog/products/example", "catalog"],
    ["/v1/cart", "cart"],
    ["/v1/cart/items", "cart"],
    ["/v1/shipping/methods", "shipping"],
    ["/v1/checkout/quote", "checkout"],
    ["/v1/orders", "order"],
    ["/v1/orders/order-1", "order"],
    ["/v1/payments/zarinpal/verify", "payment"],
    ["/v1/sellers", "seller"],
    ["/v1/sellers/documents/upload-ticket", "seller"],
  ];

  for (const [pathname, expectedDomain] of cases) {
    assert.equal(resolveCatalogDomain(pathname), expectedDomain, pathname);
  }
});

test("auth and admin routes remain outside the catalog compatibility boundary", () => {
  assert.equal(resolveCatalogDomain("/v1/auth/login"), null);
  assert.equal(resolveCatalogDomain("/v1/me"), null);
  assert.equal(resolveCatalogDomain("/v1/admin/categories"), null);
});

test("future inventory pricing and promotion extraction targets do not claim new public routes yet", () => {
  assert.equal(resolveCatalogDomain("/v1/inventory"), null);
  assert.equal(resolveCatalogDomain("/v1/pricing"), null);
  assert.equal(resolveCatalogDomain("/v1/promotions"), null);
});

test("overlapping route ownership is rejected", () => {
  assert.throws(
    () =>
      assertCatalogDomainBoundaries([
        { name: "one", exactPaths: [], prefixes: ["/v1/cart/"] },
        { name: "two", exactPaths: ["/v1/cart/items"], prefixes: [] },
      ]),
    /route overlap/,
  );
});
