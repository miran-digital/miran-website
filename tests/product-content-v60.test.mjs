import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("V60 product content architecture persists sections and attribute groups", async () => {
  const migration = await readFile(new URL("../drizzle/0017_product_content_architecture.sql", import.meta.url), "utf8");
  assert.match(migration, /products ADD COLUMN content_sections_json TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(migration, /product_attribute_values ADD COLUMN group_title TEXT NOT NULL DEFAULT ''/);

  const repository = await readFile(new URL("../db/admin-repository.ts", import.meta.url), "utf8");
  assert.match(repository, /content_sections_json/);
  assert.match(repository, /group_title/);
  assert.match(repository, /parseProductContentSections/);
});

test("V60 admin supports reusable product content sections and grouped specifications", async () => {
  const admin = await readFile(new URL("../features/admin/admin-page.tsx", import.meta.url), "utf8");
  assert.match(admin, /بخش‌های محتوای محصول/);
  assert.match(admin, /افزودن بخش محتوایی/);
  assert.match(admin, /عنوان گروه مشخصات/);
  assert.match(admin, /contentSectionVisible-/);
  assert.match(admin, /attributeGroup-/);
});

test("V60 storefront renders manager-authored sections only and hides public stock counts", async () => {
  const detail = await readFile(new URL("../features/catalog/product-detail.tsx", import.meta.url), "utf8");
  const data = await readFile(new URL("../features/catalog/catalog-data.ts", import.meta.url), "utf8");
  assert.doesNotMatch(detail, />معرفی محصول</);
  assert.doesNotMatch(detail, />جزئیات و مشخصات</);
  assert.doesNotMatch(data, /موجودی قابل سفارش/);
  assert.match(detail, /section\.title \? <h2>/);
  assert.match(detail, /specificationGroups/);
  assert.match(detail, /structuredContent/);
});

test("V60 gallery lightbox includes keyboard navigation and focus containment", async () => {
  const gallery = await readFile(new URL("../features/catalog/product-gallery.tsx", import.meta.url), "utf8");
  assert.match(gallery, /ArrowLeft/);
  assert.match(gallery, /ArrowRight/);
  assert.match(gallery, /event\.key !== "Tab"/);
  assert.match(gallery, /lightboxTriggerRef/);
});
