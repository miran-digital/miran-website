const boundaries = [
  {
    name: "catalog",
    exactPaths: ["/v1/storefront", "/v1/catalog/categories", "/v1/catalog/products"],
    prefixes: ["/v1/catalog/"],
    extractionTarget: "catalog-service",
  },
  {
    name: "cart",
    exactPaths: ["/v1/cart"],
    prefixes: ["/v1/cart/"],
    extractionTarget: "cart-service",
  },
  {
    name: "inventory",
    exactPaths: [],
    prefixes: [],
    extractionTarget: "inventory-service",
  },
  {
    name: "pricing",
    exactPaths: [],
    prefixes: [],
    extractionTarget: "pricing-service",
  },
  {
    name: "promotion",
    exactPaths: [],
    prefixes: [],
    extractionTarget: "promotion-service",
  },
  {
    name: "shipping",
    exactPaths: ["/v1/shipping/methods"],
    prefixes: [],
    extractionTarget: "shipment-service",
  },
  {
    name: "checkout",
    exactPaths: [],
    prefixes: ["/v1/checkout/"],
    extractionTarget: "checkout-service",
  },
  {
    name: "order",
    exactPaths: ["/v1/orders"],
    prefixes: ["/v1/orders/"],
    extractionTarget: "order-service",
  },
  {
    name: "payment",
    exactPaths: [],
    prefixes: ["/v1/payments/"],
    extractionTarget: "payment-service",
  },
  {
    name: "seller",
    exactPaths: ["/v1/sellers", "/v1/sellers/me"],
    prefixes: ["/v1/sellers/"],
    extractionTarget: "seller-service",
  },
];

function routeMatches(pathname, boundary) {
  return (
    boundary.exactPaths.includes(pathname) ||
    boundary.prefixes.some((prefix) => pathname.startsWith(prefix))
  );
}

function overlaps(left, right) {
  for (const path of left.exactPaths) {
    if (right.exactPaths.includes(path)) return path;
    if (right.prefixes.some((prefix) => path.startsWith(prefix))) return path;
  }

  for (const prefix of left.prefixes) {
    if (right.exactPaths.some((path) => path.startsWith(prefix))) return prefix;
    if (
      right.prefixes.some(
        (otherPrefix) => prefix.startsWith(otherPrefix) || otherPrefix.startsWith(prefix),
      )
    ) {
      return prefix;
    }
  }

  return null;
}

export function assertCatalogDomainBoundaries(domainBoundaries = boundaries) {
  const names = new Set();

  for (const boundary of domainBoundaries) {
    if (!boundary.name) throw new Error("Catalog domain boundary name is required");
    if (names.has(boundary.name)) {
      throw new Error(`Duplicate catalog domain boundary: ${boundary.name}`);
    }
    names.add(boundary.name);
  }

  for (let leftIndex = 0; leftIndex < domainBoundaries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < domainBoundaries.length; rightIndex += 1) {
      const left = domainBoundaries[leftIndex];
      const right = domainBoundaries[rightIndex];
      const overlap = overlaps(left, right) || overlaps(right, left);
      if (overlap) {
        throw new Error(
          `Catalog domain route overlap: ${left.name} and ${right.name} both match ${overlap}`,
        );
      }
    }
  }

  return true;
}

export function resolveCatalogDomain(pathname) {
  const matches = boundaries.filter((boundary) => routeMatches(pathname, boundary));
  if (matches.length > 1) {
    throw new Error(
      `Catalog domain route overlap at runtime: ${pathname} matched ${matches.map(({ name }) => name).join(", ")}`,
    );
  }
  return matches[0]?.name || null;
}

assertCatalogDomainBoundaries(boundaries);

export const catalogDomainBoundaries = Object.freeze(
  boundaries.map((boundary) =>
    Object.freeze({
      ...boundary,
      exactPaths: Object.freeze([...boundary.exactPaths]),
      prefixes: Object.freeze([...boundary.prefixes]),
    }),
  ),
);
