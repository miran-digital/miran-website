import {
  createDefaultAdminState,
  isAdminState,
  MAX_PRODUCT_IMAGES,
  normalizeAdminState,
  type AdminProduct,
  type AdminProductAttributeValue,
  type AdminBrand,
  type AdminProductVariant,
  type AdminVariantAttributeValue,
  type AdminSellerOffer,
  type AdminState,
  normalizeAdminPermissions,
  normalizeProductCategorySlug,
  stableBrandSlug,
} from "../features/admin/admin-types.ts";
import type {
  SellerApplication,
  SellerAdminUpdate,
  SellerStoredDocument,
} from "../features/seller/seller-types.ts";
import { canApproveSeller } from "../features/seller/seller-types.ts";
import { getRuntimeEnv } from "../lib/runtime-env.ts";
import {
  IRAN_CURRENCY,
  normalizeLegacyPriceToRial,
} from "../lib/money.ts";
import {
  introducesSiblingCategoryNameConflict,
  type CategoryNameIdentity,
} from "../lib/category-integrity.ts";

type SystemCategoryNameIdentity = CategoryNameIdentity & { slug: string };
type StorefrontWriteOptions = {
  allowCategoryDeletionIds?: readonly string[];
  systemCategoriesForNameValidation?: readonly SystemCategoryNameIdentity[];
};

type SettingsRow = { data: string };
type RevisionRow = {
  id: string;
  data: string;
  actor_email: string;
  created_at: string;
};
type ProductRow = {
  id: string;
  created_at: string;
  slug: string;
  title: string;
  english_title: string | null;
  brand: string;
  category: string;
  sku: string;
  short_description: string | null;
  description: string;
  content_sections_json: string;
  placement: AdminProduct["placement"];
  currency: string;
  price_minor: number;
  compare_at_price_minor: number;
  discount_type: AdminProduct["discountType"];
  discount_value: number;
  stock_quantity: number;
  reserved_quantity: number;
  image_url: string;
  video_url: string;
  amazing_enabled: number;
  amazing_starts_at: string;
  amazing_ends_at: string;
  visible: number;
};
type SellerRow = {
  id: string;
  created_at: string;
  store_name: string;
  contact_name: string;
  email: string;
  phone: string;
  category: string;
  legal_type: SellerApplication["legalType"];
  registration_number: string;
  address: string;
  notes: string;
  guarantee_type: SellerApplication["guaranteeType"];
  guarantee_amount_minor: number;
  documents_json: string;
  document_status: SellerApplication["documentStatus"];
  guarantee_status: SellerApplication["guaranteeStatus"];
  agreement_status: SellerApplication["agreementStatus"];
  admin_notes: string;
  status: SellerApplication["status"];
};
type VariantRow = {
  id: string;
  product_id: string;
  title: string;
  sku: string;
  price_minor: number;
  compare_at_price_minor: number;
  stock_quantity: number;
  reserved_quantity: number;
  visible: number;
};
type OfferRow = {
  id: string;
  product_id: string;
  seller_application_id: string;
  seller_name: string;
  price_minor: number;
  stock_quantity: number;
  reserved_quantity: number;
  guarantee_label: string;
  delivery_label: string;
  visible: number;
};
type ProductAttributeRow = {
  id: string;
  product_id: string;
  definition_id: string;
  category_slug: string;
  code: string;
  label: string;
  data_type: AdminProductAttributeValue["dataType"];
  unit: string | null;
  filterable: number;
  searchable: number;
  comparable: number;
  value_text: string | null;
  value_number: number | null;
  value_boolean: number | null;
  key_feature: number;
  group_title: string;
  sort_order: number;
};
type VariantAttributeRow = Omit<ProductAttributeRow, "product_id" | "key_feature" | "group_title" | "sort_order"> & {
  variant_id: string;
};

export async function readStorefrontState(databaseOverride?: D1Database): Promise<AdminState> {
  const database = databaseOverride ?? await requireDatabase();
  const [
    settings,
    productResult,
    variantResult,
    offerResult,
    productAttributeResult,
    variantAttributeResult,
  ] = await Promise.all([
    database
      .prepare("SELECT data FROM storefront_settings WHERE id = ? LIMIT 1")
      .bind("primary")
      .first<SettingsRow>(),
    database
      .prepare(
        `SELECT id, created_at, slug, title, english_title, brand, category, sku,
                short_description, description, content_sections_json, placement, currency,
                price_minor, compare_at_price_minor, discount_type,
                discount_value, stock_quantity,
                reserved_quantity, image_url, video_url, amazing_enabled,
                amazing_starts_at, amazing_ends_at, visible
          FROM products
          WHERE archived_at = ''
          ORDER BY updated_at DESC, id DESC`,
      )
      .all<ProductRow>(),
    database
      .prepare(
        `SELECT id, product_id, title, sku, price_minor, compare_at_price_minor,
                stock_quantity, reserved_quantity, visible
           FROM product_variants
          ORDER BY rowid ASC`,
      )
      .all<VariantRow>(),
    database
      .prepare(
        `SELECT id, product_id, seller_application_id, seller_name, price_minor,
                stock_quantity, reserved_quantity, guarantee_label,
                delivery_label, visible
           FROM seller_offers
          ORDER BY price_minor ASC, rowid ASC`,
      )
      .all<OfferRow>(),
    database
      .prepare(
        `SELECT value.id, value.product_id, value.attribute_id AS definition_id,
                definition.category_slug, definition.code, definition.label,
                definition.data_type, definition.unit, definition.filterable,
                definition.searchable, definition.comparable, value.value_text,
                value.value_number, value.value_boolean, value.key_feature,
                value.group_title, value.sort_order
           FROM product_attribute_values AS value
           JOIN catalog_attribute_definitions AS definition
             ON definition.id = value.attribute_id
          WHERE value.visible = 1 AND definition.active = 1
          ORDER BY value.product_id, value.sort_order, value.rowid`,
      )
      .all<ProductAttributeRow>(),
    database
      .prepare(
        `SELECT value.id, value.variant_id, value.attribute_id AS definition_id,
                definition.category_slug, definition.code, definition.label,
                definition.data_type, definition.unit, definition.filterable,
                definition.searchable, definition.comparable, value.value_text,
                value.value_number, value.value_boolean
           FROM product_variant_attribute_values AS value
           JOIN catalog_attribute_definitions AS definition
             ON definition.id = value.attribute_id
          WHERE value.visible = 1 AND definition.active = 1
          ORDER BY value.variant_id, value.rowid`,
      )
      .all<VariantAttributeRow>(),
  ]);

  const variantsByProduct = groupByProduct(variantResult.results);
  const offersByProduct = groupByProduct(offerResult.results);
  const attributesByProduct = groupRowsBy(productAttributeResult.results, "product_id");
  const attributesByVariant = groupRowsBy(variantAttributeResult.results, "variant_id");
  const products = productResult.results.map((row) =>
    mapProduct(
      row,
      (variantsByProduct.get(row.id) ?? []).map((variant) =>
        mapVariant(
          variant,
          (attributesByVariant.get(variant.id) ?? []).map(mapVariantAttribute),
        ),
      ),
      (offersByProduct.get(row.id) ?? []).map(mapOffer),
      (attributesByProduct.get(row.id) ?? []).map(mapProductAttribute),
    ),
  );
  if (!settings) {
    return {
      ...createDefaultAdminState(),
      brands: mergeStoredBrands([], products),
      products,
    };
  }

  try {
    const defaults = createDefaultAdminState();
    const stored = JSON.parse(settings.data) as Record<string, unknown>;
    const candidate = {
      ...defaults,
      ...stored,
      version: 3,
      commerce: {
        ...defaults.commerce,
        ...(typeof stored.commerce === "object" && stored.commerce !== null
          ? stored.commerce
          : {}),
        deliveryFees: {
          ...defaults.commerce.deliveryFees,
          ...(typeof stored.commerce === "object" &&
          stored.commerce !== null &&
          "deliveryFees" in stored.commerce &&
          typeof stored.commerce.deliveryFees === "object" &&
          stored.commerce.deliveryFees !== null
            ? stored.commerce.deliveryFees
            : {}),
        },
      },
      adminUsers: normalizeStoredAdminUsers(stored.adminUsers),
      branding: {
        ...defaults.branding,
        ...(typeof stored.branding === "object" && stored.branding !== null
          ? stored.branding
          : {}),
      },
      amazingSection: {
        ...defaults.amazingSection,
        ...(typeof stored.amazingSection === "object" &&
        stored.amazingSection !== null
          ? stored.amazingSection
          : {}),
      },
      customCategories: Array.isArray(stored.customCategories)
        ? stored.customCategories.map((category) => ({
            ...(typeof category === "object" && category !== null ? category : {}),
            imageUrl:
              typeof category === "object" && category !== null && "imageUrl" in category
                ? category.imageUrl
                : "",
            imageHidden:
              typeof category === "object" && category !== null && "imageHidden" in category
                ? category.imageHidden
                : false,
            system:
              typeof category === "object" && category !== null && "system" in category
                ? category.system
                : false,
          }))
        : [],
      categoryOrder: Array.isArray(stored.categoryOrder)
        ? stored.categoryOrder
        : defaults.categoryOrder,
      brands: mergeStoredBrands(stored.brands, products),
      headerMessages: Array.isArray(stored.headerMessages)
        ? stored.headerMessages.map((message) => ({
            ...(typeof message === "object" && message !== null ? message : {}),
            backgroundColor:
              typeof message === "object" &&
              message !== null &&
              "backgroundColor" in message
                ? message.backgroundColor
                : "#4f46e5",
            textColor:
              typeof message === "object" &&
              message !== null &&
              "textColor" in message
                ? message.textColor
                : "#ffffff",
          }))
        : defaults.headerMessages,
      banners: Array.isArray(stored.banners)
        ? stored.banners.map((banner) => ({
            ...(typeof banner === "object" && banner !== null ? banner : {}),
            altText:
              typeof banner === "object" &&
              banner !== null &&
              "altText" in banner
                ? banner.altText
                : typeof banner === "object" &&
                    banner !== null &&
                    "title" in banner
                  ? banner.title
                  : "بنر تبلیغاتی",
            desktopImageUrl:
              typeof banner === "object" &&
              banner !== null &&
              "desktopImageUrl" in banner
                ? banner.desktopImageUrl
                : "",
            mobileImageUrl:
              typeof banner === "object" &&
              banner !== null &&
              "mobileImageUrl" in banner
                ? banner.mobileImageUrl
                : "",
            placement:
              typeof banner === "object" &&
              banner !== null &&
              "placement" in banner
                ? banner.placement
                : "half",
            scope:
              typeof banner === "object" &&
              banner !== null &&
              "scope" in banner &&
              banner.scope === "category"
                ? "category"
                : "home",
            categorySlug:
              typeof banner === "object" &&
              banner !== null &&
              "categorySlug" in banner &&
              typeof banner.categorySlug === "string"
                ? banner.categorySlug
                : "",
            startsAt:
              typeof banner === "object" &&
              banner !== null &&
              "startsAt" in banner
                ? banner.startsAt
                : "",
            endsAt:
              typeof banner === "object" &&
              banner !== null &&
              "endsAt" in banner
                ? banner.endsAt
                : "",
          }))
        : defaults.banners,
      products,
    };
    return isAdminState(candidate)
      ? normalizeAdminState(candidate)
      : { ...createDefaultAdminState(), products };
  } catch {
    return { ...createDefaultAdminState(), products };
  }
}

function mergeStoredBrands(value: unknown, products: AdminProduct[]): AdminBrand[] {
  const brands: AdminBrand[] = Array.isArray(value)
    ? value.flatMap((item) => {
        if (typeof item !== "object" || item === null) return [];
        const brand = item as Record<string, unknown>;
        if (
          typeof brand.id !== "string" ||
          typeof brand.name !== "string" ||
          typeof brand.categorySlug !== "string"
        ) return [];
        return [{
          id: brand.id,
          slug:
            typeof brand.slug === "string" && brand.slug
              ? brand.slug
              : stableBrandSlug(brand.name),
          name: brand.name,
          categorySlug: brand.categorySlug,
        }];
      })
    : [];
  const knownNames = new Set(brands.map((brand) => brand.name.trim().toLocaleLowerCase("fa")));
  const usedSlugs = new Set(brands.map((brand) => brand.slug));
  for (const product of products) {
    const name = product.brand.trim();
    const key = name.toLocaleLowerCase("fa");
    if (!name || knownNames.has(key)) continue;
    const baseSlug = stableBrandSlug(name);
    const slug = usedSlugs.has(baseSlug)
      ? stableBrandSlug(`${name}-${product.category}`)
      : baseSlug;
    brands.push({
      id: `brand-${slug}`,
      slug,
      name,
      categorySlug: product.category,
    });
    knownNames.add(key);
    usedSlugs.add(slug);
  }
  return brands;
}

export async function writeStorefrontState(
  state: AdminState,
  actorEmail: string,
  databaseOverride?: D1Database,
  options: StorefrontWriteOptions = {},
) {
  const database = databaseOverride ?? await requireDatabase();
  const previous = await readStorefrontState(database).catch(() => null);
  const requested = normalizeAdminState(state);
  const allowedCategoryDeletions = new Set(
    options.allowCategoryDeletionIds ?? [],
  );
  const merged = previous
    ? {
        ...requested,
        customCategories: [
          ...requested.customCategories,
          ...previous.customCategories.filter(
            (category) =>
              !requested.customCategories.some((item) => item.id === category.id) &&
              !allowedCategoryDeletions.has(category.id),
          ),
        ],
      }
    : requested;
  if (
    options.systemCategoriesForNameValidation &&
    introducesSiblingCategoryNameConflict(
      managedCategoryNames(previous ?? createDefaultAdminState(), options.systemCategoriesForNameValidation),
      managedCategoryNames(merged, options.systemCategoriesForNameValidation),
    )
  ) {
    throw new Error("DUPLICATE_SIBLING_CATEGORY_NAME");
  }
  const normalized = await enforceSellerOfferIntegrity(database, merged);
  const settings = { ...normalized, products: [] };
  const attributeDefinitions = collectAttributeDefinitions(normalized.products);
  const priceHistoryStatements = buildPriceHistoryStatements(
    database,
    previous,
    normalized,
    actorEmail,
  );
  const statements = [
    ...(previous
      ? [
          database
            .prepare(
              `INSERT INTO storefront_revisions (id, data, actor_email, created_at)
               VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            )
            .bind(crypto.randomUUID(), JSON.stringify(previous), actorEmail),
        ]
      : []),
    database
      .prepare(
        `INSERT INTO storefront_settings (id, data, updated_at, updated_by)
         VALUES (?, ?, CURRENT_TIMESTAMP, ?)
         ON CONFLICT(id) DO UPDATE SET
           data = excluded.data,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = excluded.updated_by`,
      )
      .bind("primary", JSON.stringify(settings), actorEmail),
    database.prepare("UPDATE products SET visible = 0, updated_at = CURRENT_TIMESTAMP WHERE archived_at = ''"),
    database.prepare("UPDATE product_variants SET visible = 0, updated_at = CURRENT_TIMESTAMP"),
    database.prepare("UPDATE seller_offers SET visible = 0, updated_at = CURRENT_TIMESTAMP"),
    database.prepare("UPDATE product_attribute_values SET visible = 0, updated_at = CURRENT_TIMESTAMP"),
    database.prepare("UPDATE product_variant_attribute_values SET visible = 0, updated_at = CURRENT_TIMESTAMP"),
    ...priceHistoryStatements,
    ...attributeDefinitions.map((attribute) =>
      database
        .prepare(
          `INSERT INTO catalog_attribute_definitions (
             id, category_slug, code, label, data_type, unit,
             filterable, searchable, comparable, active, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO UPDATE SET
             category_slug = excluded.category_slug,
             code = excluded.code,
             label = excluded.label,
             data_type = excluded.data_type,
             unit = excluded.unit,
             filterable = excluded.filterable,
             searchable = excluded.searchable,
             comparable = excluded.comparable,
             active = 1,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(
          attribute.definitionId,
          attribute.category,
          attribute.code,
          attribute.label,
          attribute.dataType,
          attribute.unit,
          attribute.filterable ? 1 : 0,
          attribute.searchable ? 1 : 0,
          attribute.comparable ? 1 : 0,
        ),
    ),
    ...normalized.products.map((product) =>
      database
        .prepare(
          `INSERT INTO products (
             id, slug, title, english_title, brand, category, sku,
             short_description, description, content_sections_json, placement, currency,
             price_minor, compare_at_price_minor, discount_type, discount_value,
             stock_quantity,
             reserved_quantity, image_url, video_url, amazing_enabled,
             amazing_starts_at, amazing_ends_at, visible, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO UPDATE SET
             slug = excluded.slug,
             title = excluded.title,
             english_title = excluded.english_title,
             brand = excluded.brand,
             category = excluded.category,
             sku = excluded.sku,
             short_description = excluded.short_description,
             description = excluded.description,
             content_sections_json = excluded.content_sections_json,
             placement = excluded.placement,
             currency = excluded.currency,
             price_minor = excluded.price_minor,
             compare_at_price_minor = excluded.compare_at_price_minor,
             discount_type = excluded.discount_type,
             discount_value = excluded.discount_value,
             stock_quantity = MAX(excluded.stock_quantity, products.reserved_quantity),
             image_url = excluded.image_url,
             video_url = excluded.video_url,
             amazing_enabled = excluded.amazing_enabled,
             amazing_starts_at = excluded.amazing_starts_at,
             amazing_ends_at = excluded.amazing_ends_at,
             visible = excluded.visible,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(
          product.id,
          product.slug,
          product.title,
          product.englishTitle,
          product.brand,
          product.category,
          product.sku,
          product.shortDescription,
          product.description,
          JSON.stringify(product.contentSections ?? []),
          product.placement,
          product.currency,
          product.priceMinor,
          product.compareAtPriceMinor,
          product.discountType,
          product.discountValue,
          product.stockQuantity,
          JSON.stringify(product.imageUrls),
          product.videoUrl,
          product.amazingEnabled ? 1 : 0,
          product.amazingStartsAt,
          product.amazingEndsAt,
          product.visible ? 1 : 0,
        ),
    ),
    ...normalized.products.flatMap((product) =>
      product.attributes.map((attribute) => {
        const stored = attributeStorageValue(attribute);
        return database
          .prepare(
            `INSERT INTO product_attribute_values (
               id, product_id, attribute_id, value_text, value_number,
               value_boolean, normalized_value, key_feature, group_title, sort_order,
               visible, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
             ON CONFLICT(id) DO UPDATE SET
               product_id = excluded.product_id,
               attribute_id = excluded.attribute_id,
               value_text = excluded.value_text,
               value_number = excluded.value_number,
               value_boolean = excluded.value_boolean,
               normalized_value = excluded.normalized_value,
               key_feature = excluded.key_feature,
               group_title = excluded.group_title,
               sort_order = excluded.sort_order,
               visible = 1,
               updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(
            attribute.id,
            product.id,
            attribute.definitionId,
            stored.text,
            stored.number,
            stored.boolean,
            stored.normalized,
            attribute.keyFeature ? 1 : 0,
            attribute.groupTitle ?? "",
            attribute.sortOrder,
          );
      }),
    ),
    ...normalized.products.flatMap((product) =>
      product.variants.map((variant) =>
        database
          .prepare(
            `INSERT INTO product_variants (
               id, product_id, title, sku, price_minor, compare_at_price_minor,
               stock_quantity, reserved_quantity, visible, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(id) DO UPDATE SET
               product_id = excluded.product_id,
               title = excluded.title,
               sku = excluded.sku,
               price_minor = excluded.price_minor,
               compare_at_price_minor = excluded.compare_at_price_minor,
               stock_quantity = MAX(excluded.stock_quantity, product_variants.reserved_quantity),
               visible = excluded.visible,
               updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(
            variant.id,
            product.id,
            variant.title,
            variant.sku,
            variant.priceMinor,
            variant.compareAtPriceMinor,
            variant.stockQuantity,
            variant.visible ? 1 : 0,
          ),
      ),
    ),
    ...normalized.products.flatMap((product) =>
      product.variants.flatMap((variant) =>
        variant.attributes.map((attribute) => {
          const stored = attributeStorageValue(attribute);
          return database
            .prepare(
              `INSERT INTO product_variant_attribute_values (
                 id, variant_id, attribute_id, value_text, value_number,
                 value_boolean, normalized_value, visible, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
               ON CONFLICT(id) DO UPDATE SET
                 variant_id = excluded.variant_id,
                 attribute_id = excluded.attribute_id,
                 value_text = excluded.value_text,
                 value_number = excluded.value_number,
                 value_boolean = excluded.value_boolean,
                 normalized_value = excluded.normalized_value,
                 visible = 1,
                 updated_at = CURRENT_TIMESTAMP`,
            )
            .bind(
              attribute.id,
              variant.id,
              attribute.definitionId,
              stored.text,
              stored.number,
              stored.boolean,
              stored.normalized,
            );
        }),
      ),
    ),
    ...normalized.products.flatMap((product) =>
      product.sellerOffers.map((offer) =>
        database
          .prepare(
            `INSERT INTO seller_offers (
               id, product_id, seller_application_id, seller_name, price_minor,
               stock_quantity, reserved_quantity, guarantee_label,
               delivery_label, visible, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(id) DO UPDATE SET
               product_id = excluded.product_id,
               seller_application_id = excluded.seller_application_id,
               seller_name = excluded.seller_name,
               price_minor = excluded.price_minor,
               stock_quantity = MAX(excluded.stock_quantity, seller_offers.reserved_quantity),
               guarantee_label = excluded.guarantee_label,
               delivery_label = excluded.delivery_label,
               visible = excluded.visible,
               updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(
            offer.id,
            product.id,
            offer.sellerId,
            offer.sellerName,
            offer.priceMinor,
            offer.stockQuantity,
            offer.guaranteeLabel,
            offer.deliveryLabel,
            offer.visible ? 1 : 0,
          ),
      ),
    ),
    database
      .prepare(
        `INSERT INTO admin_audit_log (actor_email, action, subject_id)
         VALUES (?, ?, ?)`,
      )
      .bind(actorEmail, "storefront.updated", "primary"),
  ];

  await database.batch(statements);
  await database
    .prepare(
      `DELETE FROM storefront_revisions
        WHERE id NOT IN (
          SELECT id FROM storefront_revisions ORDER BY created_at DESC LIMIT 50
        )`,
    )
    .run();
  return normalized;
}

export async function countCategoryAttributeDefinitions(
  categorySlug: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const row = await database
    .prepare(
      "SELECT COUNT(*) AS count FROM catalog_attribute_definitions WHERE category_slug = ?",
    )
    .bind(categorySlug)
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

function managedCategoryNames(
  state: AdminState,
  systemCategories: readonly SystemCategoryNameIdentity[],
) {
  const system = systemCategories.map((category) =>
    state.customCategories.find(
      (item) => item.system && item.slug === category.slug,
    ) ?? category,
  );
  return [
    ...system,
    ...state.customCategories.filter((category) => !category.system),
  ].map(({ id, name, parentSlug }) => ({ id, name, parentSlug }));
}

type AttributeDefinitionSnapshot = {
  definitionId: string;
  category: string;
  code: string;
  label: string;
  dataType: AdminProductAttributeValue["dataType"];
  unit: string | null;
  filterable: boolean;
  searchable: boolean;
  comparable: boolean;
};

function collectAttributeDefinitions(products: AdminProduct[]) {
  const definitions = new Map<string, AttributeDefinitionSnapshot>();
  for (const product of products) {
    for (const attribute of [
      ...product.attributes,
      ...product.variants.flatMap((variant) => variant.attributes),
    ]) {
      const candidate: AttributeDefinitionSnapshot = {
        definitionId: attribute.definitionId,
        category: product.category,
        code: attribute.code,
        label: attribute.label,
        dataType: attribute.dataType,
        unit: attribute.unit,
        filterable: attribute.filterable,
        searchable: attribute.searchable,
        comparable: attribute.comparable,
      };
      const current = definitions.get(attribute.definitionId);
      if (current && JSON.stringify(current) !== JSON.stringify(candidate)) {
        throw new Error("ATTRIBUTE_DEFINITION_CONFLICT");
      }
      definitions.set(attribute.definitionId, candidate);
    }
  }
  return [...definitions.values()];
}

function attributeStorageValue(
  attribute: AdminProductAttributeValue | AdminVariantAttributeValue,
) {
  const normalized = attribute.value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("fa")
    .replace(/\s+/g, " ");
  if (attribute.dataType === "number") {
    const value = Number(attribute.value);
    if (!Number.isFinite(value)) throw new Error("ATTRIBUTE_NUMBER_INVALID");
    return { text: null, number: value, boolean: null, normalized };
  }
  if (attribute.dataType === "boolean") {
    if (attribute.value !== "true" && attribute.value !== "false") {
      throw new Error("ATTRIBUTE_BOOLEAN_INVALID");
    }
    return {
      text: null,
      number: null,
      boolean: attribute.value === "true" ? 1 : 0,
      normalized,
    };
  }
  return { text: attribute.value, number: null, boolean: null, normalized };
}

function buildPriceHistoryStatements(
  database: D1Database,
  previous: AdminState | null,
  next: AdminState,
  actorEmail: string,
) {
  if (!previous) return [];
  const statements: D1PreparedStatement[] = [];
  const previousProducts = new Map(previous.products.map((product) => [product.id, product]));

  function recordChange(input: {
    productId: string;
    sourceType: "product" | "variant" | "seller_offer";
    sourceId: string;
    previousPrice: number;
    nextPrice: number;
    previousCompareAt?: number;
    nextCompareAt?: number;
  }) {
    const previousCompareAt = input.previousCompareAt ?? 0;
    const nextCompareAt = input.nextCompareAt ?? 0;
    if (
      input.previousPrice === input.nextPrice &&
      previousCompareAt === nextCompareAt
    ) return;
    statements.push(
      database
        .prepare(
          `INSERT INTO product_price_history (
             id, product_id, source_type, source_id,
             previous_price_minor, new_price_minor,
             previous_compare_at_price_minor, new_compare_at_price_minor,
             currency, changed_by, changed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        )
        .bind(
          crypto.randomUUID(),
          input.productId,
          input.sourceType,
          input.sourceId,
          input.previousPrice,
          input.nextPrice,
          previousCompareAt,
          nextCompareAt,
          IRAN_CURRENCY,
          actorEmail,
        ),
    );
  }

  for (const product of next.products) {
    const previousProduct = previousProducts.get(product.id);
    if (!previousProduct) continue;
    recordChange({
      productId: product.id,
      sourceType: "product",
      sourceId: product.id,
      previousPrice: previousProduct.priceMinor,
      nextPrice: product.priceMinor,
      previousCompareAt: previousProduct.compareAtPriceMinor,
      nextCompareAt: product.compareAtPriceMinor,
    });
    const previousVariants = new Map(previousProduct.variants.map((variant) => [variant.id, variant]));
    for (const variant of product.variants) {
      const previousVariant = previousVariants.get(variant.id);
      if (!previousVariant) continue;
      recordChange({
        productId: product.id,
        sourceType: "variant",
        sourceId: variant.id,
        previousPrice: previousVariant.priceMinor,
        nextPrice: variant.priceMinor,
        previousCompareAt: previousVariant.compareAtPriceMinor,
        nextCompareAt: variant.compareAtPriceMinor,
      });
    }
    const previousOffers = new Map(previousProduct.sellerOffers.map((offer) => [offer.id, offer]));
    for (const offer of product.sellerOffers) {
      const previousOffer = previousOffers.get(offer.id);
      if (!previousOffer) continue;
      recordChange({
        productId: product.id,
        sourceType: "seller_offer",
        sourceId: offer.id,
        previousPrice: previousOffer.priceMinor,
        nextPrice: offer.priceMinor,
      });
    }
  }
  return statements;
}

export async function deleteAdminProduct(
  productId: string,
  actorEmail: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const id = productId.trim().slice(0, 120);
  if (!id) throw new Error("PRODUCT_NOT_FOUND");
  const product = await database
    .prepare("SELECT id FROM products WHERE id = ? AND archived_at = '' LIMIT 1")
    .bind(id)
    .first<{ id: string }>();
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  const orderReference = await database
    .prepare("SELECT COUNT(*) AS count FROM order_items WHERE product_id = ?")
    .bind(id)
    .first<{ count: number }>();
  const archived = Number(orderReference?.count ?? 0) > 0;
  const statements = archived
    ? [
        database.prepare("UPDATE products SET visible = 0, archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id),
        database.prepare("UPDATE product_variants SET visible = 0, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?").bind(id),
        database.prepare("UPDATE seller_offers SET visible = 0, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?").bind(id),
      ]
    : [
        database.prepare("DELETE FROM product_variants WHERE product_id = ?").bind(id),
        database.prepare("DELETE FROM seller_offers WHERE product_id = ?").bind(id),
        database.prepare("DELETE FROM product_reviews WHERE product_id = ?").bind(id),
        database.prepare("DELETE FROM products WHERE id = ?").bind(id),
      ];
  await database.batch([
    ...statements,
    database
      .prepare("INSERT INTO admin_audit_log (actor_email, action, subject_id) VALUES (?, ?, ?)")
      .bind(actorEmail, archived ? "product.archived" : "product.deleted", id),
  ]);
  return { mode: archived ? "archived" as const : "deleted" as const };
}

export async function deleteAdminProductVariant(
  productId: string,
  variantId: string,
  actorEmail: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const normalizedProductId = productId.trim().slice(0, 120);
  const normalizedVariantId = variantId.trim().slice(0, 120);
  if (!normalizedProductId || !normalizedVariantId) throw new Error("VARIANT_NOT_FOUND");

  const product = await database
    .prepare("SELECT id FROM products WHERE id = ? AND archived_at = '' LIMIT 1")
    .bind(normalizedProductId)
    .first<{ id: string }>();
  if (!product) throw new Error("PRODUCT_NOT_FOUND");

  const variant = await database
    .prepare(
      "SELECT id, reserved_quantity FROM product_variants WHERE id = ? AND product_id = ? LIMIT 1",
    )
    .bind(normalizedVariantId, normalizedProductId)
    .first<{ id: string; reserved_quantity: number }>();
  if (!variant) throw new Error("VARIANT_NOT_FOUND");
  if (variant.reserved_quantity > 0) throw new Error("VARIANT_RESERVED");

  const results = await database.batch([
    database
      .prepare(
        `DELETE FROM product_variant_attribute_values
          WHERE variant_id = ?
            AND EXISTS (
              SELECT 1 FROM product_variants
               WHERE id = ? AND product_id = ? AND reserved_quantity = 0
            )`,
      )
      .bind(normalizedVariantId, normalizedVariantId, normalizedProductId),
    database
      .prepare(
        "DELETE FROM product_variants WHERE id = ? AND product_id = ? AND reserved_quantity = 0",
      )
      .bind(normalizedVariantId, normalizedProductId),
    database
      .prepare(
        `INSERT INTO admin_audit_log (actor_email, action, subject_id)
         SELECT ?, 'product.variant-deleted', ? WHERE changes() > 0`,
      )
      .bind(actorEmail, normalizedVariantId),
  ]);
  if (Number(results[1]?.meta?.changes ?? 0) !== 1) throw new Error("VARIANT_RESERVED");
  return { deleted: true as const };
}

async function enforceSellerOfferIntegrity(
  _database: D1Database,
  state: AdminState,
) {
  const visibleOffers = state.products.flatMap((product) =>
    product.sellerOffers.filter((offer) => offer.visible),
  );
  if (visibleOffers.length === 0) return state;

  const sellers = await listSellerApplications();
  const sellersById = new Map(sellers.map((seller) => [seller.id, seller]));
  for (const offer of visibleOffers) {
    const seller = sellersById.get(offer.sellerId);
    if (!seller || seller.status !== "approved" || !canApproveSeller(seller)) {
      throw new Error("SELLER_NOT_ELIGIBLE");
    }
  }

  return {
    ...state,
    products: state.products.map((product) => ({
      ...product,
      sellerOffers: product.sellerOffers.map((offer) => ({
        ...offer,
        sellerName: sellersById.get(offer.sellerId)?.storeName ?? offer.sellerName,
      })),
    })),
  };
}

export async function listStorefrontRevisions() {
  const result = await (await requireDatabase())
    .prepare(
      `SELECT id, data, actor_email, created_at
         FROM storefront_revisions
        ORDER BY created_at DESC
        LIMIT 50`,
    )
    .all<RevisionRow>();
  return result.results.map((row) => ({
    id: row.id,
    actorEmail: row.actor_email,
    createdAt: row.created_at,
  }));
}

export async function restoreStorefrontRevision(
  id: string,
  actorEmail: string,
  options: { preserveAdminUsers?: boolean } = {},
) {
  const database = await requireDatabase();
  const revision = await database
    .prepare("SELECT data FROM storefront_revisions WHERE id = ? LIMIT 1")
    .bind(id)
    .first<SettingsRow>();
  if (!revision) throw new Error("REVISION_NOT_FOUND");
  const current = await readStorefrontState();
  const restored = JSON.parse(revision.data) as unknown;
  if (isAdminState(restored)) {
    const normalized = normalizeAdminState(restored);
    return writeStorefrontState(
      options.preserveAdminUsers
        ? { ...normalized, adminUsers: current.adminUsers }
        : normalized,
      actorEmail,
    );
  }
  const restoredSettings = restored as Record<string, unknown>;
  const candidate = {
    ...current,
    ...restoredSettings,
    version: 3,
    products: current.products,
    commerce: {
      ...current.commerce,
      ...(typeof restoredSettings.commerce === "object" && restoredSettings.commerce !== null
        ? restoredSettings.commerce
        : {}),
    },
    adminUsers: options.preserveAdminUsers
      ? current.adminUsers
      : Array.isArray(restoredSettings.adminUsers)
      ? normalizeStoredAdminUsers(restoredSettings.adminUsers)
      : current.adminUsers,
    brands: mergeStoredBrands(restoredSettings.brands, current.products),
    banners: Array.isArray(restoredSettings.banners)
      ? restoredSettings.banners.map((banner) => ({
          ...(typeof banner === "object" && banner !== null ? banner : {}),
          scope:
            typeof banner === "object" &&
            banner !== null &&
            "scope" in banner &&
            banner.scope === "category"
              ? "category"
              : "home",
          categorySlug:
            typeof banner === "object" &&
            banner !== null &&
            "categorySlug" in banner &&
            typeof banner.categorySlug === "string"
              ? banner.categorySlug
              : "",
        }))
      : current.banners,
  };
  if (!isAdminState(candidate)) throw new Error("REVISION_INVALID");
  return writeStorefrontState(candidate, actorEmail);
}

function normalizeStoredAdminUsers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((user) => {
    if (typeof user !== "object" || user === null) return user;
    const item = user as Record<string, unknown>;
    return { ...item, permissions: normalizeAdminPermissions(item.permissions, item.role) };
  });
}

export async function createSellerApplicationRecord(
  input: Pick<
    SellerApplication,
    | "storeName"
    | "contactName"
    | "email"
    | "phone"
    | "category"
    | "legalType"
    | "registrationNumber"
    | "address"
    | "notes"
    | "guaranteeType"
  > & { documents: SellerStoredDocument[] },
) {
  const database = await requireDatabase();
  const application: SellerApplication = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    storeName: input.storeName.trim().slice(0, 120),
    contactName: input.contactName.trim().slice(0, 120),
    email: input.email.trim().toLowerCase().slice(0, 200),
    phone: input.phone.trim().slice(0, 40),
    category: input.category.trim().slice(0, 100),
    legalType: input.legalType,
    registrationNumber: input.registrationNumber.trim().slice(0, 120),
    address: input.address.trim().slice(0, 500),
    notes: input.notes.trim().slice(0, 1000),
    guaranteeType: input.guaranteeType,
    guaranteeAmountMinor: 0,
    documents: input.documents.map((document) => ({
      id: document.id,
      name: document.name,
      contentType: document.contentType,
      size: document.size,
      downloadUrl: "",
    })),
    documentStatus: input.documents.length > 0 ? "submitted" : "missing",
    guaranteeStatus: "not_requested",
    agreementStatus: "not_sent",
    adminNotes: "",
    status: "new",
  };
  await database
    .prepare(
      `INSERT INTO seller_applications (
         id, store_name, contact_name, email, phone, category, legal_type,
         registration_number, address, notes, guarantee_type,
         guarantee_amount_minor, documents_json, document_status,
         guarantee_status, agreement_status, admin_notes, status,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      application.id,
      application.storeName,
      application.contactName,
      application.email,
      application.phone,
      application.category,
      application.legalType,
      application.registrationNumber,
      application.address,
      application.notes,
      application.guaranteeType,
      application.guaranteeAmountMinor,
      JSON.stringify(input.documents),
      application.documentStatus,
      application.guaranteeStatus,
      application.agreementStatus,
      application.adminNotes,
      application.status,
      application.createdAt,
      application.createdAt,
    )
    .run();
  return application;
}

export async function listSellerApplications() {
  const result = await (await requireDatabase())
    .prepare(
      `SELECT id, created_at, store_name, contact_name, email, phone,
              category, legal_type, registration_number, address, notes,
              guarantee_type, guarantee_amount_minor, documents_json,
              document_status, guarantee_status, agreement_status,
              admin_notes, status
         FROM seller_applications
        ORDER BY created_at DESC
        LIMIT 250`,
    )
    .all<SellerRow>();
  return result.results.map(mapSeller);
}

export async function updateSellerApplicationRecord(
  id: string,
  review: SellerAdminUpdate,
  actorEmail: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const results = await database.batch([
    database
      .prepare(
        `UPDATE seller_applications
            SET store_name = ?, contact_name = ?, email = ?, phone = ?,
                category = ?, legal_type = ?, registration_number = ?,
                address = ?, notes = ?, status = ?, document_status = ?, guarantee_status = ?,
                agreement_status = ?, guarantee_type = ?,
                guarantee_amount_minor = ?, admin_notes = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      )
      .bind(
        review.storeName.trim().slice(0, 120),
        review.contactName.trim().slice(0, 120),
        review.email.trim().toLowerCase().slice(0, 200),
        review.phone.trim().slice(0, 40),
        review.category.trim().slice(0, 100),
        review.legalType,
        review.registrationNumber.trim().slice(0, 120),
        review.address.trim().slice(0, 500),
        review.notes.trim().slice(0, 1000),
        review.status,
        review.documentStatus,
        review.guaranteeStatus,
        review.agreementStatus,
        review.guaranteeType,
        review.guaranteeAmountMinor,
        review.adminNotes.trim().slice(0, 2000),
        id,
      ),
    database
      .prepare(
        `INSERT INTO admin_audit_log (actor_email, action, subject_id)
         VALUES (?, ?, ?)`,
      )
      .bind(actorEmail, `seller.${review.status}`, id),
  ]);
  if (Number(results[0]?.meta?.changes ?? 0) !== 1) {
    throw new Error("SELLER_NOT_FOUND");
  }
}

export async function getSellerDocumentStorageKeys(
  id: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const row = await database
    .prepare("SELECT documents_json FROM seller_applications WHERE id = ? LIMIT 1")
    .bind(id)
    .first<{ documents_json: string }>();
  if (!row) throw new Error("SELLER_NOT_FOUND");
  return parseStoredDocuments(row.documents_json).map((document) => document.storageKey);
}

export async function deleteSellerApplicationRecord(
  id: string,
  actorEmail: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const current = await database
    .prepare("SELECT id FROM seller_applications WHERE id = ? LIMIT 1")
    .bind(id)
    .first<{ id: string }>();
  if (!current) throw new Error("SELLER_NOT_FOUND");
  await database.batch([
    database.prepare("DELETE FROM seller_offers WHERE seller_application_id = ?").bind(id),
    database.prepare("DELETE FROM seller_applications WHERE id = ?").bind(id),
    database
      .prepare("INSERT INTO admin_audit_log (actor_email, action, subject_id) VALUES (?, 'seller.deleted', ?)")
      .bind(actorEmail.trim().toLowerCase(), id),
  ]);
  return { deleted: true as const };
}

export async function getSellerDocumentRecord(
  applicationId: string,
  documentId: string,
) {
  const row = await (await requireDatabase())
    .prepare(
      "SELECT documents_json FROM seller_applications WHERE id = ? LIMIT 1",
    )
    .bind(applicationId)
    .first<{ documents_json: string }>();
  return parseStoredDocuments(row?.documents_json ?? "[]").find(
    (document) => document.id === documentId,
  ) ?? null;
}

async function requireDatabase() {
  const bindings = await getRuntimeEnv<{ DB?: D1Database }>();
  if (!bindings.DB) throw new Error("پایگاه‌داده فروشگاه در دسترس نیست.");
  return bindings.DB;
}

function parseProductContentSections(raw: string, productId: string, legacyDescription: string) {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (Array.isArray(parsed)) {
      const sections = parsed.flatMap((value, index) => {
        if (typeof value !== "object" || value === null) return [];
        const section = value as Record<string, unknown>;
        const body = typeof section.body === "string" ? section.body.trim().slice(0, 8000) : "";
        if (!body) return [];
        return [{
          id: typeof section.id === "string" && section.id.trim()
            ? section.id.trim().slice(0, 120)
            : `content-${productId}-${index + 1}`,
          title: typeof section.title === "string" ? section.title.trim().slice(0, 160) : "",
          body,
          sortOrder: typeof section.sortOrder === "number" && Number.isSafeInteger(section.sortOrder)
            ? Math.max(0, Math.min(1000, section.sortOrder))
            : index,
          visible: section.visible !== false,
        }];
      }).sort((left, right) => left.sortOrder - right.sortOrder);
      if (sections.length > 0) return sections.map((section, index) => ({ ...section, sortOrder: index }));
    }
  } catch {
    // Keep the legacy description available when older rows contain no section JSON.
  }
  const body = legacyDescription.trim().slice(0, 8000);
  return body
    ? [{ id: `legacy-content-${productId}`, title: "", body, sortOrder: 0, visible: true }]
    : [];
}

function mapProduct(
  row: ProductRow,
  variants: AdminProductVariant[],
  sellerOffers: AdminSellerOffer[],
  attributes: AdminProductAttributeValue[],
): AdminProduct {
  const sourceCurrency = row.currency || IRAN_CURRENCY;
  return {
    id: row.id,
    createdAt: row.created_at,
    slug: row.slug,
    title: row.title,
    englishTitle: row.english_title || null,
    brand: row.brand,
    category: normalizeProductCategorySlug(row.category),
    sku: row.sku,
    shortDescription: row.short_description || null,
    description: row.description,
    contentSections: parseProductContentSections(row.content_sections_json, row.id, row.description),
    placement: row.placement,
    currency: IRAN_CURRENCY,
    priceMinor: normalizeLegacyPriceToRial(row.price_minor, sourceCurrency),
    compareAtPriceMinor: normalizeLegacyPriceToRial(
      row.compare_at_price_minor,
      sourceCurrency,
    ),
    discountType:
      row.discount_type === "percentage" || row.discount_type === "amount"
        ? row.discount_type
        : row.compare_at_price_minor > row.price_minor
          ? "amount"
          : "none",
    discountValue:
      row.discount_type === "percentage"
        ? Math.max(0, Math.min(100, row.discount_value))
        : row.discount_type === "amount"
          ? normalizeLegacyPriceToRial(row.discount_value, sourceCurrency)
          : row.compare_at_price_minor > row.price_minor
            ? normalizeLegacyPriceToRial(
                row.compare_at_price_minor - row.price_minor,
                sourceCurrency,
              )
            : 0,
    stockQuantity: row.stock_quantity,
    reservedQuantity: row.reserved_quantity,
    imageUrls: parseProductImages(row.image_url),
    videoUrl: row.video_url || "",
    amazingEnabled: row.amazing_enabled === 1,
    amazingStartsAt: row.amazing_starts_at || "",
    amazingEndsAt: row.amazing_ends_at || "",
    attributes,
    variants,
    sellerOffers,
    visible: row.visible === 1,
  };
}

function mapVariant(
  row: VariantRow,
  attributes: AdminVariantAttributeValue[],
): AdminProductVariant {
  return {
    id: row.id,
    title: row.title,
    sku: row.sku,
    priceMinor: row.price_minor,
    compareAtPriceMinor: row.compare_at_price_minor,
    stockQuantity: row.stock_quantity,
    reservedQuantity: row.reserved_quantity,
    attributes,
    visible: row.visible === 1,
  };
}

function mapProductAttribute(row: ProductAttributeRow): AdminProductAttributeValue {
  return {
    ...mapAttributeDefinition(row),
    id: row.id,
    value: attributeRowValue(row),
    ...(row.group_title ? { groupTitle: row.group_title } : {}),
    keyFeature: row.key_feature === 1,
    sortOrder: row.sort_order,
  };
}

function mapVariantAttribute(row: VariantAttributeRow): AdminVariantAttributeValue {
  return {
    ...mapAttributeDefinition(row),
    id: row.id,
    value: attributeRowValue(row),
  };
}

function mapAttributeDefinition(
  row: ProductAttributeRow | VariantAttributeRow,
) {
  return {
    definitionId: row.definition_id,
    code: row.code,
    label: row.label,
    dataType: row.data_type === "number" || row.data_type === "boolean"
      ? row.data_type
      : "text" as const,
    unit: row.unit || null,
    filterable: row.filterable === 1,
    searchable: row.searchable === 1,
    comparable: row.comparable === 1,
  };
}

function attributeRowValue(row: ProductAttributeRow | VariantAttributeRow) {
  if (row.data_type === "number") return String(row.value_number ?? "");
  if (row.data_type === "boolean") return row.value_boolean === 1 ? "true" : "false";
  return row.value_text ?? "";
}

function mapOffer(row: OfferRow): AdminSellerOffer {
  return {
    id: row.id,
    sellerId: row.seller_application_id,
    sellerName: row.seller_name,
    priceMinor: row.price_minor,
    stockQuantity: row.stock_quantity,
    reservedQuantity: row.reserved_quantity,
    guaranteeLabel: row.guarantee_label,
    deliveryLabel: row.delivery_label,
    visible: row.visible === 1,
  };
}

function groupByProduct<T extends { product_id: string }>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const current = grouped.get(row.product_id) ?? [];
    current.push(row);
    grouped.set(row.product_id, current);
  }
  return grouped;
}

function groupRowsBy<T extends Record<K, string>, K extends keyof T>(
  rows: T[],
  key: K,
) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const value = row[key];
    const current = grouped.get(value) ?? [];
    current.push(row);
    grouped.set(value, current);
  }
  return grouped;
}

function parseProductImages(value: string) {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string")
        .slice(0, MAX_PRODUCT_IMAGES);
    }
  } catch {
    // Older product rows contain one plain image URL.
  }
  return value.startsWith("/media/products/") ? [value] : [];
}

function mapSeller(row: SellerRow): SellerApplication {
  return {
    id: row.id,
    createdAt: row.created_at,
    storeName: row.store_name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    category: row.category,
    legalType: row.legal_type,
    registrationNumber: row.registration_number,
    address: row.address,
    notes: row.notes,
    guaranteeType: row.guarantee_type,
    guaranteeAmountMinor: row.guarantee_amount_minor,
    documents: parseStoredDocuments(row.documents_json).map((document) => ({
      id: document.id,
      name: document.name,
      contentType: document.contentType,
      size: document.size,
      downloadUrl: `/api/admin/sellers/documents?applicationId=${encodeURIComponent(row.id)}&documentId=${encodeURIComponent(document.id)}`,
    })),
    documentStatus: row.document_status,
    guaranteeStatus: row.guarantee_status,
    agreementStatus: row.agreement_status,
    adminNotes: row.admin_notes,
    status: row.status,
  };
}

function parseStoredDocuments(value: string): SellerStoredDocument[] {
  try {
    const documents = JSON.parse(value) as unknown;
    if (!Array.isArray(documents)) return [];
    return documents
      .filter((item): item is SellerStoredDocument => {
        if (typeof item !== "object" || item === null) return false;
        const document = item as Record<string, unknown>;
        return (
          typeof document.id === "string" &&
          typeof document.name === "string" &&
          typeof document.contentType === "string" &&
          typeof document.size === "number" &&
          typeof document.storageKey === "string" &&
          /^seller-documents\/[a-f0-9-]+\.(?:jpg|png|webp|pdf)$/.test(
            document.storageKey,
          )
        );
      })
      .slice(0, 4);
  } catch {
    return [];
  }
}
