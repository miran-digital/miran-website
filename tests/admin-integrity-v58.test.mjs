import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createD1Database } from "./helpers/d1.mjs";
import {
  listPaymentProviderAdminConfigs,
  removePaymentProviderConfiguration,
  savePaymentProviderConfiguration,
} from "../lib/payment-provider-config.ts";
import { paymentProviderCatalog } from "../lib/payments/provider-catalog.ts";
import {
  countCategoryAttributeDefinitions,
  readStorefrontState,
  writeStorefrontState,
} from "../db/admin-repository.ts";
import {
  DUPLICATE_SIBLING_CATEGORY_MESSAGE,
  findSiblingCategoryNameConflict,
  hasUniqueSiblingCategoryNames,
  inspectCategoryReferences,
  introducesSiblingCategoryNameConflict,
  normalizeCategoryComparisonName,
} from "../lib/category-integrity.ts";

const KEY = Buffer.alloc(32, 58).toString("base64");
const MERCHANT = "11111111-1111-1111-1111-111111114821";
const OWNER = "owner@example.test";
const readSource = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

async function database(t) {
  const d1 = await createD1Database();
  t.after(() => d1.close());
  return d1;
}

async function addDisabledZarinpal(db) {
  return savePaymentProviderConfiguration({
    provider: "zarinpal",
    actorEmail: OWNER,
    mode: "add",
    enabled: false,
    credentials: { merchantId: MERCHANT },
  }, db, KEY);
}

test("V58 owner removes one unused disabled provider config without removing its catalog definition", async (t) => {
  const { database: db, sqlite } = await database(t);
  await addDisabledZarinpal(db);
  const result = await removePaymentProviderConfiguration("zarinpal", OWNER, db);
  assert.deepEqual(result, { provider: "zarinpal", removed: true });
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM payment_provider_configs").get().count, 0);
  assert.ok(paymentProviderCatalog.some((provider) => provider.id === "zarinpal"));
  const listed = await listPaymentProviderAdminConfigs(db, KEY);
  assert.equal(listed.find((provider) => provider.provider === "zarinpal").added, false);
});

test("V58 provider removal preserves every pending and historical payment attempt", async (t) => {
  const { database: db, sqlite } = await database(t);
  await addDisabledZarinpal(db);
  sqlite.prepare("INSERT INTO payment_attempts (id, order_id, provider, status, amount_minor) VALUES ('pending-v58', 'order-v58', 'zarinpal', 'pending', 1000)").run();
  await assert.rejects(
    removePaymentProviderConfiguration("zarinpal", OWNER, db),
    /PAYMENT_PROVIDER_HAS_HISTORY/,
  );
  sqlite.prepare("UPDATE payment_attempts SET status = 'paid' WHERE id = 'pending-v58'").run();
  await assert.rejects(
    removePaymentProviderConfiguration("zarinpal", OWNER, db),
    /PAYMENT_PROVIDER_HAS_HISTORY/,
  );
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM payment_provider_configs").get().count, 1);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM payment_attempts").get().count, 1);
});

test("V58 provider removal requires an existing disabled configuration", async (t) => {
  const { database: db } = await database(t);
  await assert.rejects(removePaymentProviderConfiguration("unknown", OWNER, db), /PAYMENT_PROVIDER_INVALID/);
  await assert.rejects(removePaymentProviderConfiguration("irankish", OWNER, db), /PAYMENT_PROVIDER_NOT_FOUND/);
  await savePaymentProviderConfiguration({
    provider: "zarinpal",
    actorEmail: OWNER,
    mode: "add",
    enabled: true,
    credentials: { merchantId: MERCHANT },
  }, db, KEY);
  await assert.rejects(removePaymentProviderConfiguration("zarinpal", OWNER, db), /PAYMENT_PROVIDER_ACTIVE/);
});

test("V58 removes a legacy unused not-integrated row but never permits a new one", async (t) => {
  const { database: db, sqlite } = await database(t);
  for (const definition of paymentProviderCatalog.filter((provider) => provider.integration === "not-integrated")) {
    await assert.rejects(
      savePaymentProviderConfiguration({ provider: definition.id, actorEmail: OWNER, mode: "add", enabled: false }, db, KEY),
      /PAYMENT_PROVIDER_NOT_INTEGRATED/,
    );
  }
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM payment_provider_configs").get().count, 0);
  sqlite.prepare("INSERT INTO payment_provider_configs (provider, enabled, sandbox, credentials_ciphertext, credentials_iv, updated_by) VALUES ('irankish', 0, 0, 'legacy-metadata', 'legacy-iv', ?)").run(OWNER);
  assert.deepEqual(await removePaymentProviderConfiguration("irankish", OWNER, db), {
    provider: "irankish",
    removed: true,
  });
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM payment_provider_configs WHERE provider = 'irankish'").get().count, 0);
  assert.ok(paymentProviderCatalog.some((provider) => provider.id === "irankish"));
});

test("V58 provider-removal audit is atomic and contains no credential material", async (t) => {
  const d1 = await database(t);
  await addDisabledZarinpal(d1.database);
  const result = await removePaymentProviderConfiguration("zarinpal", OWNER, d1.database);
  const audit = d1.sqlite
    .prepare("SELECT actor_email, action, subject_id FROM admin_audit_log WHERE action = 'payment-provider.removed'")
    .all()
    .map(({ actor_email, action, subject_id }) => ({ actor_email, action, subject_id }));
  assert.deepEqual(audit, [{ actor_email: OWNER, action: "payment-provider.removed", subject_id: "zarinpal" }]);
  assert.doesNotMatch(JSON.stringify({ result, audit }), new RegExp(MERCHANT + "|" + KEY));

  await addDisabledZarinpal(d1.database);
  d1.failNext(/INSERT INTO admin_audit_log/);
  await assert.rejects(removePaymentProviderConfiguration("zarinpal", OWNER, d1.database), /D1_TEST_FAILURE/);
  assert.equal(d1.sqlite.prepare("SELECT count(*) AS count FROM payment_provider_configs WHERE provider = 'zarinpal'").get().count, 1);
});

test("V58 DELETE API is owner-only, cross-site protected, rate-limited, strict and secret-free", async () => {
  const source = await readSource("app/api/admin/payment-providers/route.ts");
  assert.match(source, /export async function DELETE\(request: Request\)/);
  assert.match(source, /getAdminAccess\("security\.write"\)/);
  assert.match(source, /access\.role !== "owner"/);
  assert.match(source, /rejectCrossSiteMutation\(request\)/);
  assert.match(source, /rejectRateLimited\(request/);
  assert.match(source, /readPaymentRequestJson\(request, 256\)/);
  assert.match(source, /Object\.keys\(value\)\.length !== 1/);
  assert.match(source, /PAYMENT_PROVIDER_HAS_HISTORY/);
  assert.match(source, new RegExp("این درگاه سابقه پرداخت دارد"));
  assert.doesNotMatch(source, /credentials_ciphertext|credentials_iv/);
});

test("V58 provider UI removes without reload and keeps not-integrated catalog options disabled", async () => {
  const source = await readSource("features/admin/payment-gateway-settings.tsx");
  assert.match(source, /حذف از فهرست/);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /درگاه از فهرست تنظیمات حذف شد/);
  assert.match(source, /setProviders\(\(current\) => current\.map/);
  assert.doesNotMatch(source, /location\.reload|window\.location/);
  assert.match(source, /disabled=\{item\.integration === "not-integrated"\}/);
  assert.match(source, /اتصال هنوز آماده نیست/);
  assert.match(source, /این عملیات اتصال خود Provider را از سیستم MIRAN حذف نمی‌کند/);
});

test("V58 category comparison normalizes whitespace, Persian forms, Unicode, half-space and English case", () => {
  const equivalent = [
    "  تنباکو  ",
    "تنباکو",
    "تنباکو\u200c",
    "تنباکو\u200b",
  ].map(normalizeCategoryComparisonName);
  assert.equal(new Set(equivalent).size, 1);
  assert.equal(normalizeCategoryComparisonName("ي ك"), "ی ک");
  assert.equal(normalizeCategoryComparisonName("لوازم\u200cجانبی"), normalizeCategoryComparisonName("لوازم جانبی"));
  assert.equal(normalizeCategoryComparisonName("ＡCCESSORIES"), "accessories");
  assert.equal(normalizeCategoryComparisonName("Accessories"), normalizeCategoryComparisonName("accessories"));
});

test("V58 sibling category names are unique across system and custom categories but independent across parents", () => {
  const system = { id: "system-hookah", name: "تنباکو", parentSlug: "tobacco" };
  const custom = { id: "custom-hookah", name: " تنباكو ", parentSlug: "tobacco" };
  assert.equal(hasUniqueSiblingCategoryNames([system, custom]), false);
  assert.equal(hasUniqueSiblingCategoryNames([system, { ...custom, parentSlug: "grocery" }]), true);
  assert.equal(findSiblingCategoryNameConflict([system], custom)?.id, system.id);
  assert.equal(findSiblingCategoryNameConflict([system], system), null, "Editing the same category excludes itself");
  assert.equal(DUPLICATE_SIBLING_CATEGORY_MESSAGE, "دسته‌ای با این نام در این دسته مادر از قبل وجود دارد.");
});

test("V58 legacy duplicate does not block unrelated edits but no new collision can be introduced", () => {
  const legacy = [
    { id: "system-hookah", name: "تنباکو", parentSlug: "tobacco" },
    { id: "custom-hookah", name: "تنباکو", parentSlug: "tobacco" },
    { id: "cigarette", name: "سیگار", parentSlug: "tobacco" },
  ];
  assert.equal(introducesSiblingCategoryNameConflict(legacy, legacy.map((item) => ({ ...item }))), false);
  assert.equal(introducesSiblingCategoryNameConflict(legacy, [...legacy, { id: "third", name: "تنباکو", parentSlug: "tobacco" }]), true);
  assert.equal(introducesSiblingCategoryNameConflict(legacy, [...legacy, { id: "other", name: "سیگار", parentSlug: "tobacco" }]), true);
  assert.equal(introducesSiblingCategoryNameConflict(legacy, legacy.filter((item) => item.id !== "system-hookah")), false);
});

test("V58 persistence rejects a sibling-name collision introduced by a stale concurrent state", async (t) => {
  const { database: db } = await database(t);
  const stale = await readStorefrontState(db);
  const category = (id, slug, name) => ({
    id,
    slug,
    name,
    description: "",
    parentSlug: "tobacco",
    imageUrl: "",
    imageHidden: false,
    system: false,
    visible: true,
  });
  await writeStorefrontState({
    ...stale,
    customCategories: [...stale.customCategories, category("category-a", "a", "تنباکو ویژه")],
  }, OWNER, db);
  await assert.rejects(
    writeStorefrontState({
      ...stale,
      customCategories: [...stale.customCategories, category("category-b", "b", "  تنباكو ویژه  ")],
    }, OWNER, db, { systemCategoriesForNameValidation: [] }),
    /DUPLICATE_SIBLING_CATEGORY_NAME/,
  );
});

test("V58 category reference inspection identifies the kept and empty tobacco categories without mutation", () => {
  const products = Array.from({ length: 4 }, (_, index) => ({ id: `product-${index}`, category: "tobacco-1" }));
  const categories = [
    { id: "system-hookah-tobacco", parentSlug: "tobacco" },
    { id: "category-main", parentSlug: "tobacco" },
  ];
  const before = JSON.stringify({ products, categories });
  assert.deepEqual(inspectCategoryReferences({ products, categories, brands: [], banners: [] }, "tobacco-1"), {
    productCount: 4,
    childCategoryCount: 0,
    brandReferenceCount: 0,
    bannerReferenceCount: 0,
    hasBusinessReferences: true,
  });
  assert.deepEqual(inspectCategoryReferences({ products, categories, brands: [], banners: [] }, "hookah-tobacco"), {
    productCount: 0,
    childCategoryCount: 0,
    brandReferenceCount: 0,
    bannerReferenceCount: 0,
    hasBusinessReferences: false,
  });
  assert.equal(JSON.stringify({ products, categories }), before);
});

test("V58 an explicitly approved empty custom-category deletion preserves every product", async (t) => {
  const { database: db, sqlite } = await database(t);
  const initial = await readStorefrontState(db);
  const emptyCategory = {
    id: "category-empty-v58",
    slug: "empty-v58",
    name: "دسته خالی آزمون",
    description: "",
    parentSlug: "tobacco",
    imageUrl: "",
    imageHidden: false,
    system: false,
    visible: true,
  };
  const withCategory = await writeStorefrontState({
    ...initial,
    customCategories: [...initial.customCategories, emptyCategory],
  }, OWNER, db);
  const productSnapshot = withCategory.products.map(({ id, slug, sku, category }) => ({ id, slug, sku, category }));
  const staleWrite = await writeStorefrontState({
    ...withCategory,
    customCategories: withCategory.customCategories.filter((category) => category.id !== emptyCategory.id),
  }, OWNER, db);
  assert.equal(staleWrite.customCategories.some((category) => category.id === emptyCategory.id), true);
  sqlite.prepare("INSERT INTO catalog_attribute_definitions (id, category_slug, code, label) VALUES ('definition-v58', ?, 'v58', 'V58')").run(emptyCategory.slug);
  assert.equal(await countCategoryAttributeDefinitions(emptyCategory.slug, db), 1);
  sqlite.prepare("DELETE FROM catalog_attribute_definitions WHERE id = 'definition-v58'").run();
  const after = await writeStorefrontState({
    ...staleWrite,
    customCategories: staleWrite.customCategories.filter((category) => category.id !== emptyCategory.id),
  }, OWNER, db, { allowCategoryDeletionIds: [emptyCategory.id] });
  assert.equal(after.customCategories.some((category) => category.id === emptyCategory.id), false);
  assert.deepEqual(after.products.map(({ id, slug, sku, category }) => ({ id, slug, sku, category })), productSnapshot);
});

test("V58 category validation is enforced in both API and accessible Admin UI", async () => {
  const [api, page, css] = await Promise.all([
    readSource("app/api/admin/state/route.ts"),
    readSource("features/admin/admin-page.tsx"),
    readSource("features/admin/admin.module.css"),
  ]);
  assert.match(api, /introducesSiblingCategoryNameConflict/);
  assert.match(api, /DUPLICATE_SIBLING_CATEGORY_MESSAGE/);
  assert.match(api, /field: "name"/);
  assert.match(api, /countCategoryAttributeDefinitions/);
  assert.match(api, /deleteCategoryId/);
  assert.match(page, /findSiblingCategoryNameConflict/);
  assert.match(page, /aria-invalid=\{categoryNameInvalid \? true : undefined\}/);
  assert.match(page, /form\.elements\.namedItem\("name"\)/);
  assert.match(page, /focus\(\{ preventScroll: true \}\)/);
  assert.match(page, /scrollIntoView\(\{ block: "center", behavior: "smooth" \}\)/);
  assert.match(css, /categoryForm input\[aria-invalid="true"\]/);
});

test("V58 preserves V54/V57 product scrolling and payment-commerce boundaries", async () => {
  const [page, css, paymentService, callback] = await Promise.all([
    readSource("features/admin/admin-page.tsx"),
    readSource("features/admin/admin.module.css"),
    readSource("lib/payments/payment-service.ts"),
    readSource("lib/payments/payment-callback.ts"),
  ]);
  assert.match(page, /className=\{styles\.productListHeader\}/);
  assert.match(page, /className=\{styles\.productListBody\}/);
  const desktopRules = css.slice(css.indexOf("@media (min-width: 64rem)"));
  const naturalScrollRules = css.slice(0, css.indexOf("@media (min-width: 64rem)"));
  assert.match(desktopRules, /\.productListBody\s*\{[^}]*overflow-y:\s*auto/s);
  assert.doesNotMatch(naturalScrollRules, /\.productListBody\s*\{[^}]*overflow(?:-[xy])?:/s);
  assert.match(paymentService, /readPaymentProviderRuntimeConfig/);
  assert.match(callback, /readPaymentProviderRuntimeConfig/);
});
