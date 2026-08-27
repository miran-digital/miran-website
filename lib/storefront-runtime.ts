const TEST_MOCK_OVERRIDE = Symbol.for("miran.test.allow-mock-storefront");

type MockOverrideGlobal = typeof globalThis & {
  [TEST_MOCK_OVERRIDE]?: boolean;
};

export class StorefrontUnavailableError extends Error {
  constructor(operation: string) {
    super(`STOREFRONT_UNAVAILABLE:${operation}`);
    this.name = "StorefrontUnavailableError";
  }
}

export function isMockStorefrontAllowed() {
  const viteEnvironment = (
    import.meta as ImportMeta & { env?: { PROD?: boolean } }
  ).env;
  const production = viteEnvironment?.PROD === true ||
    process.env.NODE_ENV === "production";
  return !production ||
    (globalThis as MockOverrideGlobal)[TEST_MOCK_OVERRIDE] === true;
}

export function handleStorefrontFailure(operation: string): never | void {
  if (isMockStorefrontAllowed()) return;
  console.error("storefront_data_unavailable", { operation });
  throw new StorefrontUnavailableError(operation);
}
