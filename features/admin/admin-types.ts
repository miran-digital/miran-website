import { dateTimeTimestamp, type CalendarMode } from "../../lib/jalali.ts";
import {
  defaultDeliveryFees,
  IRAN_CURRENCY,
  normalizeLegacyPriceToRial,
  type DeliveryFeeSettings,
} from "../../lib/money.ts";
import type { ProductDiscountType } from "../../lib/product-discount.ts";
import { filterActiveHeaderMessages } from "../../lib/header-messages.ts";
import {
  isValidIranianCardNumber,
  normalizeCardNumber,
  type BankTransferSettings,
} from "../../lib/bank-transfer.ts";

export type AdminSectionKey =
  | "hero"
  | "categories"
  | "specialOffers"
  | "digitalPicks"
  | "homePicks"
  | "trending"
  | "brands"
  | "trust";

export type AdminProductPlacement =
  | "special-offers"
  | "digital-picks"
  | "home-picks"
  | "trending";

export type AdminProductDiscountType = ProductDiscountType;

export type AdminRole =
  | "owner"
  | "catalog_manager"
  | "content_manager"
  | "order_manager"
  | "seller_manager";

export type AdminPermission =
  | "state.read"
  | "content.write"
  | "content.delete"
  | "catalog.write"
  | "catalog.delete"
  | "orders.write"
  | "orders.delete"
  | "sellers.write"
  | "sellers.delete"
  | "customers.read"
  | "customers.delete"
  | "support.write"
  | "support.delete"
  | "reviews.write"
  | "reviews.delete"
  | "reports.read"
  | "security.write"
  | "backup.read"
  | "restore.write"
  | "admins.write";

export const delegableAdminPermissions = [
  "catalog.write",
  "catalog.delete",
  "content.write",
  "content.delete",
  "orders.write",
  "orders.delete",
  "sellers.write",
  "sellers.delete",
  "customers.read",
  "customers.delete",
  "support.write",
  "support.delete",
  "reviews.write",
  "reviews.delete",
  "reports.read",
  "security.write",
  "backup.read",
  "restore.write",
] as const satisfies readonly AdminPermission[];

export type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  permissions: AdminPermission[];
  active: boolean;
};

export function normalizeAdminPermissions(value: unknown, role?: unknown): AdminPermission[] {
  const defaults: Record<string, readonly AdminPermission[]> = {
    catalog_manager: ["catalog.write"],
    content_manager: ["content.write", "reviews.write"],
    order_manager: ["orders.write", "support.write", "reports.read"],
    seller_manager: ["sellers.write"],
  };
  const requested = Array.isArray(value) ? value : defaults[String(role)] ?? [];
  const allowed = requested.filter(
    (permission): permission is AdminPermission =>
      typeof permission === "string" &&
      (delegableAdminPermissions as readonly string[]).includes(permission),
  );
  const normalized = new Set<AdminPermission>(allowed);
  const dependencies: Partial<Record<AdminPermission, AdminPermission>> = {
    "catalog.delete": "catalog.write",
    "content.delete": "content.write",
    "orders.delete": "orders.write",
    "sellers.delete": "sellers.write",
    "customers.delete": "customers.read",
    "support.delete": "support.write",
    "reviews.delete": "reviews.write",
    "restore.write": "backup.read",
  };
  for (const permission of allowed) {
    const dependency = dependencies[permission];
    if (dependency) normalized.add(dependency);
  }
  return [
    "state.read",
    ...delegableAdminPermissions.filter((permission) => normalized.has(permission)),
  ];
}

export type AdminCommerceSettings = {
  calendarMode: CalendarMode;
  lowStockThreshold: number;
  reservationMinutes: number;
  deliveryFees: DeliveryFeeSettings;
  bankTransfer: BankTransferSettings;
};

export type AdminHeaderMessage = {
  id: string;
  text: string;
  href: string;
  startsAt: string;
  endsAt: string;
  backgroundColor: string;
  textColor: string;
  visible: boolean;
};

export type AdminBannerPlacement = "wide" | "half";

export type AdminBanner = {
  id: string;
  title: string;
  altText: string;
  href: string;
  desktopImageUrl: string;
  mobileImageUrl: string;
  placement: AdminBannerPlacement;
  scope: "home" | "category";
  categorySlug: string;
  startsAt: string;
  endsAt: string;
  visible: boolean;
};

export type AdminBrand = {
  id: string;
  slug: string;
  name: string;
  categorySlug: string;
};

export type AdminBranding = {
  siteName: string;
  logoUrl: string;
  logoAlt: string;
};

export type AdminCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  parentSlug: string;
  imageUrl: string;
  imageHidden: boolean;
  system: boolean;
  visible: boolean;
};

export type AdminProductRow = {
  id: string;
  title: string;
  itemLimit: number;
  visible: boolean;
};

export type AdminAmazingSection = {
  title: string;
  subtitle: string;
  href: string;
  linkLabel: string;
  backgroundColor: string;
  textColor: string;
  selectionMode: "amazing" | "placement" | "discounted";
  itemLimit: number;
  endsAt: string;
  showTimer: boolean;
};

export type AdminProductVariant = {
  id: string;
  title: string;
  sku: string;
  priceMinor: number;
  compareAtPriceMinor: number;
  stockQuantity: number;
  reservedQuantity: number;
  attributes: AdminVariantAttributeValue[];
  visible: boolean;
};

export type AdminAttributeDataType = "text" | "number" | "boolean";

export type AdminProductAttributeValue = {
  id: string;
  definitionId: string;
  code: string;
  label: string;
  dataType: AdminAttributeDataType;
  unit: string | null;
  value: string;
  filterable: boolean;
  searchable: boolean;
  comparable: boolean;
  keyFeature: boolean;
  sortOrder: number;
};

export type AdminVariantAttributeValue = Omit<
  AdminProductAttributeValue,
  "keyFeature" | "sortOrder"
>;

export type AdminSellerOffer = {
  id: string;
  sellerId: string;
  sellerName: string;
  priceMinor: number;
  stockQuantity: number;
  reservedQuantity: number;
  guaranteeLabel: string;
  deliveryLabel: string;
  visible: boolean;
};

export type AdminProduct = {
  id: string;
  createdAt?: string;
  title: string;
  englishTitle: string | null;
  slug: string;
  brand: string;
  category: string;
  sku: string;
  shortDescription: string | null;
  description: string;
  placement: AdminProductPlacement;
  currency: string;
  priceMinor: number;
  compareAtPriceMinor: number;
  discountType: ProductDiscountType;
  /** Percentage points in percentage mode; whole rials in amount mode. */
  discountValue: number;
  stockQuantity: number;
  reservedQuantity: number;
  imageUrls: string[];
  videoUrl: string;
  amazingEnabled: boolean;
  amazingStartsAt: string;
  amazingEndsAt: string;
  attributes: AdminProductAttributeValue[];
  variants: AdminProductVariant[];
  sellerOffers: AdminSellerOffer[];
  visible: boolean;
};

export type AdminState = {
  version: 3;
  commerce: AdminCommerceSettings;
  adminUsers: AdminUser[];
  sections: Record<AdminSectionKey, boolean>;
  hiddenCategoryIds: string[];
  categoryOrder: string[];
  customCategories: AdminCategory[];
  brands: AdminBrand[];
  branding: AdminBranding;
  headerMessages: AdminHeaderMessage[];
  banners: AdminBanner[];
  amazingSection: AdminAmazingSection;
  productRows: AdminProductRow[];
  products: AdminProduct[];
};

const sectionKeys: readonly AdminSectionKey[] = [
  "hero",
  "categories",
  "specialOffers",
  "digitalPicks",
  "homePicks",
  "trending",
  "brands",
  "trust",
];

const placements: readonly AdminProductPlacement[] = [
  "special-offers",
  "digital-picks",
  "home-picks",
  "trending",
];

export const adminSectionLabels: Record<AdminSectionKey, string> = {
  hero: "بنر اصلی",
  categories: "دسته‌بندی‌های خانه",
  specialOffers: "پیشنهاد شگفت‌انگیز",
  digitalPicks: "منتخب دیجیتال",
  homePicks: "برای خانه",
  trending: "محبوب و پربازدید",
  brands: "برندها",
  trust: "اعتماد و خدمات",
};

export function createDefaultAdminState(): AdminState {
  return {
    version: 3,
    commerce: {
      calendarMode: "jalali",
      lowStockThreshold: 5,
      reservationMinutes: 30,
      deliveryFees: { ...defaultDeliveryFees },
      bankTransfer: {
        enabled: false,
        cardNumber: "",
        accountHolder: "",
        bankName: "",
        instructions: "",
        reviewHours: 24,
      },
    },
    adminUsers: [],
    sections: {
      hero: true,
      categories: true,
      specialOffers: true,
      digitalPicks: true,
      homePicks: true,
      trending: true,
      brands: true,
      trust: true,
    },
    hiddenCategoryIds: [],
    categoryOrder: [
      "digital",
      "home-kitchen",
      "fashion",
      "beauty-health",
      "sports-travel",
      "kids-entertainment",
      "automotive-tools",
      "grocery",
      "tobacco",
    ],
    customCategories: [],
    brands: [],
    branding: {
      siteName: "Miran",
      logoUrl: "",
      logoAlt: "لوگوی Miran",
    },
    headerMessages: [
      {
        id: "default-message",
        text: "ارسال سریع، خرید امن و پشتیبانی Miran Shop",
        href: "/help/delivery",
        startsAt: "",
        endsAt: "",
        backgroundColor: "#4f46e5",
        textColor: "#ffffff",
        visible: true,
      },
    ],
    banners: [],
    amazingSection: {
      title: "پیشنهاد شگفت‌انگیز",
      subtitle: "فرصت محدود خرید",
      href: "/offers",
      linkLabel: "مشاهده همه",
      backgroundColor: "#ef3340",
      textColor: "#ffffff",
      selectionMode: "amazing",
      itemLimit: 12,
      endsAt: "",
      showTimer: true,
    },
    productRows: [
      {
        id: "digital-picks",
        title: "منتخب کالای دیجیتال",
        itemLimit: 8,
        visible: true,
      },
      { id: "home-picks", title: "برای خانه", itemLimit: 8, visible: true },
    ],
    products: [],
  };
}

export function isAdminState(value: unknown): value is AdminState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<AdminState>;
  return (
    state.version === 3 &&
    isCommerceSettings(state.commerce) &&
    Array.isArray(state.adminUsers) &&
    state.adminUsers.every(isAdminUser) &&
    typeof state.sections === "object" &&
    state.sections !== null &&
    sectionKeys.every((key) => typeof state.sections?.[key] === "boolean") &&
    Array.isArray(state.hiddenCategoryIds) &&
    state.hiddenCategoryIds.every((id) => isShortString(id, 120)) &&
    Array.isArray(state.categoryOrder) &&
    state.categoryOrder.every((slug) => isShortString(slug, 180)) &&
    Array.isArray(state.customCategories) &&
    state.customCategories.every(isCategory) &&
    Array.isArray(state.brands) &&
    state.brands.every(isBrand) &&
    isBranding(state.branding) &&
    Array.isArray(state.headerMessages) &&
    state.headerMessages.every(isHeaderMessage) &&
    Array.isArray(state.banners) &&
    state.banners.every(isBanner) &&
    isAmazingSection(state.amazingSection) &&
    Array.isArray(state.productRows) &&
    state.productRows.every(isProductRow) &&
    Array.isArray(state.products) &&
    state.products.every(isProduct)
  );
}

export function normalizeAdminState(state: AdminState): AdminState {
  return {
    ...state,
    version: 3,
    commerce: {
      calendarMode:
        state.commerce.calendarMode === "gregorian" ? "gregorian" : "jalali",
      lowStockThreshold: Math.max(
        0,
        Math.min(1000, Math.trunc(state.commerce.lowStockThreshold)),
      ),
      reservationMinutes: Math.max(
        5,
        Math.min(1440, Math.trunc(state.commerce.reservationMinutes)),
      ),
      deliveryFees: {
        standardRial: normalizeDeliveryFee(state.commerce.deliveryFees.standardRial),
        priorityRial: normalizeDeliveryFee(state.commerce.deliveryFees.priorityRial),
      },
      bankTransfer: {
        enabled: state.commerce.bankTransfer.enabled === true,
        cardNumber: normalizeCardNumber(state.commerce.bankTransfer.cardNumber),
        accountHolder: state.commerce.bankTransfer.accountHolder.trim().slice(0, 120),
        bankName: state.commerce.bankTransfer.bankName.trim().slice(0, 80),
        instructions: state.commerce.bankTransfer.instructions.trim().slice(0, 500),
        reviewHours: Math.max(
          1,
          Math.min(72, Math.trunc(state.commerce.bankTransfer.reviewHours)),
        ),
      },
    },
    adminUsers: state.adminUsers
      .map((user) => ({
        ...user,
        email: user.email.trim().toLowerCase().slice(0, 200),
        displayName: user.displayName.trim().slice(0, 120),
        permissions: normalizeAdminPermissions(user.permissions, user.role),
      }))
      .filter(
        (user, index, users) =>
          user.email && users.findIndex((item) => item.email === user.email) === index,
      )
      .slice(0, 50),
    hiddenCategoryIds: [...new Set(state.hiddenCategoryIds)],
    categoryOrder: [
      ...new Set(state.categoryOrder.map(normalizeSlug).filter(Boolean)),
    ],
    customCategories: state.customCategories.map((category) => ({
      ...category,
      slug: normalizeSlug(category.slug),
      name: category.name.trim().slice(0, 120),
      description: category.description.trim().slice(0, 500),
      parentSlug: normalizeSlug(category.parentSlug),
      imageUrl: normalizeCategoryMediaUrl(category.imageUrl ?? ""),
      imageHidden: category.imageHidden === true,
      system: category.system === true,
    })),
    brands: state.brands
      .map((brand) => ({
        ...brand,
        slug: normalizeSlug(brand.slug) || stableBrandSlug(brand.name),
        name: brand.name.trim().slice(0, 100),
        categorySlug: normalizeSlug(brand.categorySlug),
      }))
      .filter(
        (brand, index, brands) =>
          Boolean(brand.name && brand.slug && brand.categorySlug) &&
          brands.findIndex((item) => item.slug === brand.slug) === index,
      )
      .slice(0, 500),
    branding: {
      siteName: state.branding.siteName.trim().slice(0, 80) || "Miran",
      logoUrl: normalizeBrandingMediaUrl(state.branding.logoUrl),
      logoAlt: state.branding.logoAlt.trim().slice(0, 120) || "لوگوی فروشگاه",
    },
    headerMessages: state.headerMessages.map((message) => ({
      ...message,
      text: message.text.trim().slice(0, 160),
      href: normalizeAdminHref(message.href),
      backgroundColor: normalizeHexColor(message.backgroundColor, "#4f46e5"),
      textColor: normalizeHexColor(message.textColor, "#ffffff"),
    })),
    banners: state.banners.map((banner) => ({
      ...banner,
      title: banner.title.trim().slice(0, 160),
      altText: banner.altText.trim().slice(0, 180),
      href: normalizeAdminHref(banner.href),
      desktopImageUrl: normalizeBannerMediaUrl(banner.desktopImageUrl),
      mobileImageUrl: normalizeBannerMediaUrl(banner.mobileImageUrl),
      scope: banner.scope === "category" ? "category" : "home",
      categorySlug:
        banner.scope === "category" ? normalizeSlug(banner.categorySlug) : "",
    })),
    amazingSection: {
      ...state.amazingSection,
      title:
        state.amazingSection.title.trim().slice(0, 120) ||
        "پیشنهاد شگفت‌انگیز",
      subtitle: state.amazingSection.subtitle.trim().slice(0, 180),
      href: normalizeAdminHref(state.amazingSection.href),
      linkLabel:
        state.amazingSection.linkLabel.trim().slice(0, 60) || "مشاهده همه",
      backgroundColor: normalizeHexColor(
        state.amazingSection.backgroundColor,
        "#ef3340",
      ),
      textColor: normalizeHexColor(
        state.amazingSection.textColor,
        "#ffffff",
      ),
      itemLimit: Math.max(
        3,
        Math.min(30, Math.trunc(state.amazingSection.itemLimit)),
      ),
      endsAt: state.amazingSection.endsAt.slice(0, 40),
    },
    productRows: state.productRows.slice(0, 20),
    products: state.products.map((product) => ({
      ...product,
      title: product.title.trim().slice(0, 180),
      englishTitle: normalizeOptionalText(product.englishTitle, 180),
      slug: normalizeSlug(product.slug),
      brand: product.brand.trim().slice(0, 100),
      category: normalizeProductCategorySlug(product.category),
      sku: product.sku.trim().toUpperCase().slice(0, 80),
      shortDescription: normalizeOptionalText(product.shortDescription, 500),
      description: product.description.trim().slice(0, 2000),
      currency: IRAN_CURRENCY,
      priceMinor: normalizeLegacyPriceToRial(
        product.priceMinor,
        product.currency,
      ),
      compareAtPriceMinor: normalizeLegacyPriceToRial(
        product.compareAtPriceMinor,
        product.currency,
      ),
      discountType:
        product.discountType === "percentage" || product.discountType === "amount"
          ? product.discountType
          : "none",
      discountValue:
        product.discountType === "percentage"
          ? Math.max(0, Math.min(100, Math.round(product.discountValue || 0)))
          : product.discountType === "amount"
            ? normalizeLegacyPriceToRial(
                product.discountValue || 0,
                product.currency,
              )
            : 0,
      imageUrls: [...new Set(product.imageUrls.map(normalizeProductMediaUrl).filter(Boolean))].slice(0, 8),
      videoUrl: normalizeProductVideoUrl(product.videoUrl),
      amazingEnabled: product.amazingEnabled === true,
      amazingStartsAt: product.amazingStartsAt.slice(0, 40),
      amazingEndsAt: product.amazingEndsAt.slice(0, 40),
      attributes: (product.attributes ?? [])
        .slice(0, 100)
        .map((attribute, index) => normalizeProductAttribute(attribute, index)),
      variants: product.variants.slice(0, 100).map((variant) => ({
        ...variant,
        title: variant.title.trim().slice(0, 120),
        sku: variant.sku.trim().toUpperCase().slice(0, 80),
        priceMinor: normalizeLegacyPriceToRial(variant.priceMinor, product.currency),
        compareAtPriceMinor: normalizeLegacyPriceToRial(
          variant.compareAtPriceMinor,
          product.currency,
        ),
        attributes: (variant.attributes ?? [])
          .slice(0, 30)
          .map((attribute) => normalizeVariantAttribute(attribute)),
      })),
      sellerOffers: product.sellerOffers.slice(0, 100).map((offer) => ({
        ...offer,
        sellerName: offer.sellerName.trim().slice(0, 120),
        guaranteeLabel: offer.guaranteeLabel.trim().slice(0, 160),
        deliveryLabel: offer.deliveryLabel.trim().slice(0, 160),
        priceMinor: normalizeLegacyPriceToRial(offer.priceMinor, product.currency),
      })),
    })),
  };
}

function normalizeOptionalText(value: string | null | undefined, maxLength: number) {
  const normalized = typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  return normalized || null;
}

function normalizeProductAttribute(
  attribute: AdminProductAttributeValue,
  fallbackOrder: number,
): AdminProductAttributeValue {
  return {
    id: attribute.id.trim().slice(0, 120),
    definitionId: attribute.definitionId.trim().slice(0, 120),
    code: normalizeAttributeCode(attribute.code),
    label: attribute.label.trim().slice(0, 100),
    dataType: normalizeAttributeDataType(attribute.dataType),
    unit: normalizeOptionalText(attribute.unit, 40),
    value: attribute.value.trim().slice(0, 500),
    filterable: attribute.filterable === true,
    searchable: attribute.searchable === true,
    comparable: attribute.comparable === true,
    keyFeature: attribute.keyFeature === true,
    sortOrder: Number.isSafeInteger(attribute.sortOrder)
      ? Math.max(0, Math.min(1000, attribute.sortOrder))
      : fallbackOrder,
  };
}

function normalizeVariantAttribute(
  attribute: AdminVariantAttributeValue,
): AdminVariantAttributeValue {
  return {
    id: attribute.id.trim().slice(0, 120),
    definitionId: attribute.definitionId.trim().slice(0, 120),
    code: normalizeAttributeCode(attribute.code),
    label: attribute.label.trim().slice(0, 100),
    dataType: normalizeAttributeDataType(attribute.dataType),
    unit: normalizeOptionalText(attribute.unit, 40),
    value: attribute.value.trim().slice(0, 500),
    filterable: attribute.filterable === true,
    searchable: attribute.searchable === true,
    comparable: attribute.comparable === true,
  };
}

function normalizeAttributeDataType(value: AdminAttributeDataType): AdminAttributeDataType {
  return value === "number" || value === "boolean" ? value : "text";
}

export function hasUniqueCatalogIdentifiers(state: AdminState) {
  const productIds = new Set<string>();
  const slugs = new Set<string>();
  const skus = new Set<string>();
  const variantIds = new Set<string>();
  const offerIds = new Set<string>();
  const attributeValueIds = new Set<string>();
  const definitionByScopedCode = new Map<string, string>();
  const definitionSignatures = new Map<string, string>();

  function registerAttribute(
    category: string,
    attribute: AdminProductAttributeValue | AdminVariantAttributeValue,
  ) {
    if (
      !attribute.id ||
      !attribute.definitionId ||
      !attribute.code ||
      !attribute.label ||
      !attribute.value ||
      attributeValueIds.has(attribute.id)
    ) return false;
    if (attribute.dataType === "number" && !Number.isFinite(Number(attribute.value))) {
      return false;
    }
    if (attribute.dataType === "boolean" && attribute.value !== "true" && attribute.value !== "false") {
      return false;
    }
    const scopedCode = `${category}:${attribute.code}`;
    const knownDefinition = definitionByScopedCode.get(scopedCode);
    if (knownDefinition && knownDefinition !== attribute.definitionId) return false;
    definitionByScopedCode.set(scopedCode, attribute.definitionId);
    const signature = JSON.stringify([
      category,
      attribute.code,
      attribute.label,
      attribute.dataType,
      attribute.unit,
      attribute.filterable,
      attribute.searchable,
      attribute.comparable,
    ]);
    const knownSignature = definitionSignatures.get(attribute.definitionId);
    if (knownSignature && knownSignature !== signature) return false;
    definitionSignatures.set(attribute.definitionId, signature);
    attributeValueIds.add(attribute.id);
    return true;
  }

  for (const product of state.products) {
    const slug = normalizeSlug(product.slug);
    const sku = product.sku.trim().toUpperCase();
    if (productIds.has(product.id) || slugs.has(slug) || (sku && skus.has(sku))) {
      return false;
    }
    productIds.add(product.id);
    slugs.add(slug);
    if (sku) skus.add(sku);
    const productAttributeDefinitions = new Set<string>();
    for (const attribute of product.attributes ?? []) {
      if (
        productAttributeDefinitions.has(attribute.definitionId) ||
        !registerAttribute(product.category, attribute)
      ) return false;
      productAttributeDefinitions.add(attribute.definitionId);
    }
    for (const variant of product.variants) {
      const variantSku = variant.sku.trim().toUpperCase();
      if (
        variantIds.has(variant.id) ||
        (variantSku && skus.has(variantSku))
      ) return false;
      variantIds.add(variant.id);
      if (variantSku) skus.add(variantSku);
      const variantAttributeDefinitions = new Set<string>();
      for (const attribute of variant.attributes ?? []) {
        if (
          variantAttributeDefinitions.has(attribute.definitionId) ||
          !registerAttribute(product.category, attribute)
        ) return false;
        variantAttributeDefinitions.add(attribute.definitionId);
      }
    }
    for (const offer of product.sellerOffers) {
      if (offerIds.has(offer.id)) return false;
      offerIds.add(offer.id);
    }
  }
  return true;
}

export function createAdminId(prefix: string) {
  return typeof crypto.randomUUID === "function"
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}`;
}

export function normalizeAdminHref(value: string) {
  const href = value.trim();
  return href.startsWith("/") && !href.startsWith("//")
    ? href.slice(0, 300)
    : "/";
}

export function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 180);
}

export function normalizeAttributeCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

export function normalizeProductCategorySlug(value: string) {
  const slug = normalizeSlug(value);
  return slug === "tobacco" ? "hookah-tobacco" : slug.slice(0, 100);
}

export function stableBrandSlug(value: string) {
  const normalized = normalizeSlug(value);
  if (normalized) return normalized;
  let hash = 2166136261;
  for (const character of value.trim().toLowerCase()) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `brand-${(hash >>> 0).toString(36)}`;
}

export function getActiveHeaderMessage(state: AdminState) {
  return getActiveHeaderMessages(state)[0] ?? null;
}

export function getActiveHeaderMessages(state: AdminState) {
  return filterActiveHeaderMessages(state.headerMessages);
}

export function getActiveBanners(
  state: AdminState,
  target: { scope: "home" } | { scope: "category"; categorySlug: string } = {
    scope: "home",
  },
) {
  const now = Date.now();
  return state.banners.filter((banner) => {
    if (!banner.visible) return false;
    const scope = banner.scope === "category" ? "category" : "home";
    if (scope !== target.scope) return false;
    if (
      scope === "category" &&
      target.scope === "category" &&
      banner.categorySlug !== target.categorySlug
    ) return false;
    const startsAt = banner.startsAt ? dateTimeTimestamp(banner.startsAt) : null;
    const endsAt = banner.endsAt ? dateTimeTimestamp(banner.endsAt) : null;
    return (
      (startsAt === null || Number.isNaN(startsAt) || startsAt <= now) &&
      (endsAt === null || Number.isNaN(endsAt) || endsAt >= now)
    );
  });
}

export function isAmazingProductActive(product: AdminProduct, now = Date.now()) {
  if (!product.amazingEnabled) return false;
  const startsAt = dateTimeTimestamp(product.amazingStartsAt);
  const endsAt = dateTimeTimestamp(product.amazingEndsAt);
  return (
    Number.isFinite(startsAt) &&
    Number.isFinite(endsAt) &&
    startsAt <= now &&
    endsAt >= now
  );
}

function isShortString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isHeaderMessage(value: unknown): value is AdminHeaderMessage {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isShortString(item.id, 120) &&
    isShortString(item.text, 160) &&
    isShortString(item.href, 300) &&
    isShortString(item.startsAt, 40) &&
    isShortString(item.endsAt, 40) &&
    isHexColor(item.backgroundColor) &&
    isHexColor(item.textColor) &&
    typeof item.visible === "boolean"
  );
}

function isBanner(value: unknown): value is AdminBanner {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isShortString(item.id, 120) &&
    isShortString(item.title, 160) &&
    isShortString(item.altText, 180) &&
    isShortString(item.href, 300) &&
    isShortString(item.desktopImageUrl, 500) &&
    isShortString(item.mobileImageUrl, 500) &&
    (item.placement === "wide" || item.placement === "half") &&
    (item.scope === "home" || item.scope === "category") &&
    isShortString(item.categorySlug, 180) &&
    isShortString(item.startsAt, 40) &&
    isShortString(item.endsAt, 40) &&
    typeof item.visible === "boolean"
  );
}

function isBrand(value: unknown): value is AdminBrand {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isShortString(item.id, 120) &&
    isShortString(item.slug, 180) &&
    isShortString(item.name, 100) &&
    isShortString(item.categorySlug, 180)
  );
}

function isAmazingSection(value: unknown): value is AdminAmazingSection {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isShortString(item.title, 120) &&
    isShortString(item.subtitle, 180) &&
    isShortString(item.href, 300) &&
    isShortString(item.linkLabel, 60) &&
    isHexColor(item.backgroundColor) &&
    isHexColor(item.textColor) &&
    (item.selectionMode === "amazing" ||
      item.selectionMode === "placement" ||
      item.selectionMode === "discounted") &&
    typeof item.itemLimit === "number" &&
    Number.isSafeInteger(item.itemLimit) &&
    item.itemLimit >= 3 &&
    item.itemLimit <= 30 &&
    isShortString(item.endsAt, 40) &&
    typeof item.showTimer === "boolean"
  );
}

function isBranding(value: unknown): value is AdminBranding {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isShortString(item.siteName, 80) &&
    isShortString(item.logoUrl, 500) &&
    isShortString(item.logoAlt, 120)
  );
}

function isCategory(value: unknown): value is AdminCategory {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isShortString(item.id, 120) &&
    isShortString(item.slug, 180) &&
    isShortString(item.name, 120) &&
    isShortString(item.description, 500) &&
    isShortString(item.parentSlug, 180) &&
    (item.imageUrl === undefined || isShortString(item.imageUrl, 500)) &&
    (item.imageHidden === undefined || typeof item.imageHidden === "boolean") &&
    (item.system === undefined || typeof item.system === "boolean") &&
    typeof item.visible === "boolean"
  );
}

function isProductRow(value: unknown): value is AdminProductRow {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isShortString(item.id, 120) &&
    isShortString(item.title, 160) &&
    typeof item.itemLimit === "number" &&
    Number.isSafeInteger(item.itemLimit) &&
    item.itemLimit >= 1 &&
    item.itemLimit <= 24 &&
    typeof item.visible === "boolean"
  );
}

function isProduct(value: unknown): value is AdminProduct {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isShortString(item.id, 120) &&
    isShortString(item.title, 180) &&
    isOptionalNullableString(item.englishTitle, 180) &&
    isShortString(item.slug, 180) &&
    isShortString(item.brand, 100) &&
    isShortString(item.category, 100) &&
    isShortString(item.sku, 80) &&
    isOptionalNullableString(item.shortDescription, 500) &&
    isShortString(item.description, 2000) &&
    placements.includes(item.placement as AdminProductPlacement) &&
    isCurrencyCode(item.currency) &&
    typeof item.priceMinor === "number" &&
    Number.isSafeInteger(item.priceMinor) &&
    item.priceMinor >= 0 &&
    typeof item.compareAtPriceMinor === "number" &&
    Number.isSafeInteger(item.compareAtPriceMinor) &&
    item.compareAtPriceMinor >= 0 &&
    (item.discountType === "none" ||
      item.discountType === "percentage" ||
      item.discountType === "amount") &&
    typeof item.discountValue === "number" &&
    Number.isSafeInteger(item.discountValue) &&
    item.discountValue >= 0 &&
    (item.discountType !== "percentage" || item.discountValue <= 100) &&
    typeof item.stockQuantity === "number" &&
    Number.isSafeInteger(item.stockQuantity) &&
    item.stockQuantity >= 0 &&
    item.stockQuantity <= 1_000_000 &&
    typeof item.reservedQuantity === "number" &&
    Number.isSafeInteger(item.reservedQuantity) &&
    item.reservedQuantity >= 0 &&
    item.reservedQuantity <= item.stockQuantity &&
    Array.isArray(item.imageUrls) &&
    item.imageUrls.length <= 8 &&
    item.imageUrls.every((url) => isShortString(url, 500)) &&
    isShortString(item.videoUrl, 500) &&
    typeof item.amazingEnabled === "boolean" &&
    isShortString(item.amazingStartsAt, 40) &&
    isShortString(item.amazingEndsAt, 40) &&
    (item.attributes === undefined ||
      (Array.isArray(item.attributes) &&
        item.attributes.length <= 100 &&
        item.attributes.every(isProductAttribute))) &&
    Array.isArray(item.variants) &&
    item.variants.length <= 100 &&
    item.variants.every(isProductVariant) &&
    Array.isArray(item.sellerOffers) &&
    item.sellerOffers.length <= 100 &&
    item.sellerOffers.every(isSellerOffer) &&
    typeof item.visible === "boolean"
  );
}

function isCommerceSettings(value: unknown): value is AdminCommerceSettings {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    (item.calendarMode === "jalali" || item.calendarMode === "gregorian") &&
    typeof item.lowStockThreshold === "number" &&
    Number.isSafeInteger(item.lowStockThreshold) &&
    item.lowStockThreshold >= 0 &&
    item.lowStockThreshold <= 1000 &&
    typeof item.reservationMinutes === "number" &&
    Number.isSafeInteger(item.reservationMinutes) &&
    item.reservationMinutes >= 5 &&
    item.reservationMinutes <= 1440 &&
    isDeliveryFeeSettings(item.deliveryFees) &&
    isBankTransferSettings(item.bankTransfer)
  );
}

function isDeliveryFeeSettings(value: unknown): value is DeliveryFeeSettings {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return isSafeDeliveryFee(item.standardRial) && isSafeDeliveryFee(item.priorityRial);
}

function isSafeDeliveryFee(value: unknown) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 1_000_000_000;
}

function normalizeDeliveryFee(value: number) {
  return Math.max(0, Math.min(1_000_000_000, Math.trunc(value)));
}

function isBankTransferSettings(value: unknown): value is BankTransferSettings {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.enabled === "boolean" &&
    typeof item.cardNumber === "string" &&
    item.cardNumber.length <= 32 &&
    typeof item.accountHolder === "string" &&
    item.accountHolder.length <= 120 &&
    typeof item.bankName === "string" &&
    item.bankName.length <= 80 &&
    typeof item.instructions === "string" &&
    item.instructions.length <= 500 &&
    typeof item.reviewHours === "number" &&
    Number.isSafeInteger(item.reviewHours) &&
    item.reviewHours >= 1 &&
    item.reviewHours <= 72 &&
    (!item.enabled ||
      (isValidIranianCardNumber(item.cardNumber) &&
        item.accountHolder.trim().length >= 3))
  );
}

function isAdminUser(value: unknown): value is AdminUser {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isShortString(item.id, 120) &&
    isShortString(item.email, 200) &&
    isShortString(item.displayName, 120) &&
    ["owner", "catalog_manager", "content_manager", "order_manager", "seller_manager"].includes(String(item.role)) &&
    Array.isArray(item.permissions) &&
    item.permissions.every((permission) =>
      typeof permission === "string" &&
      (["state.read", ...delegableAdminPermissions] as readonly string[]).includes(permission)
    ) &&
    typeof item.active === "boolean"
  );
}

function isProductVariant(value: unknown): value is AdminProductVariant {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isShortString(item.id, 120) &&
    isShortString(item.title, 120) &&
    isShortString(item.sku, 80) &&
    isSafeInventoryMoney(item.priceMinor) &&
    isSafeInventoryMoney(item.compareAtPriceMinor) &&
    isSafeStock(item.stockQuantity) &&
    isSafeStock(item.reservedQuantity) &&
    Number(item.reservedQuantity) <= Number(item.stockQuantity) &&
    (item.attributes === undefined ||
      (Array.isArray(item.attributes) &&
        item.attributes.length <= 30 &&
        item.attributes.every(isVariantAttribute))) &&
    typeof item.visible === "boolean"
  );
}

function isProductAttribute(value: unknown): value is AdminProductAttributeValue {
  if (!isBaseAttribute(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.keyFeature === "boolean" &&
    typeof item.sortOrder === "number" &&
    Number.isSafeInteger(item.sortOrder) &&
    item.sortOrder >= 0 &&
    item.sortOrder <= 1000
  );
}

function isVariantAttribute(value: unknown): value is AdminVariantAttributeValue {
  return isBaseAttribute(value);
}

function isBaseAttribute(value: unknown) {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isShortString(item.id, 120) &&
    isShortString(item.definitionId, 120) &&
    isShortString(item.code, 80) &&
    isShortString(item.label, 100) &&
    (item.dataType === "text" || item.dataType === "number" || item.dataType === "boolean") &&
    (item.unit === null || isShortString(item.unit, 40)) &&
    isShortString(item.value, 500) &&
    typeof item.filterable === "boolean" &&
    typeof item.searchable === "boolean" &&
    typeof item.comparable === "boolean"
  );
}

function isOptionalNullableString(value: unknown, maxLength: number) {
  return value === undefined || value === null || isShortString(value, maxLength);
}

function isSellerOffer(value: unknown): value is AdminSellerOffer {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isShortString(item.id, 120) &&
    isShortString(item.sellerId, 120) &&
    isShortString(item.sellerName, 120) &&
    isSafeInventoryMoney(item.priceMinor) &&
    isSafeStock(item.stockQuantity) &&
    isSafeStock(item.reservedQuantity) &&
    Number(item.reservedQuantity) <= Number(item.stockQuantity) &&
    isShortString(item.guaranteeLabel, 160) &&
    isShortString(item.deliveryLabel, 160) &&
    typeof item.visible === "boolean"
  );
}

function isSafeInventoryMoney(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSafeStock(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;
}

function normalizeProductMediaUrl(value: string) {
  const url = value.trim();
  return url.startsWith("/media/products/") ? url.slice(0, 500) : "";
}

function normalizeBrandingMediaUrl(value: string) {
  const url = value.trim();
  return url.startsWith("/media/branding/") ? url.slice(0, 500) : "";
}

function normalizeBannerMediaUrl(value: string) {
  const url = value.trim();
  return url.startsWith("/media/banners/") ? url.slice(0, 500) : "";
}

function normalizeCategoryMediaUrl(value: string) {
  const url = value.trim();
  return url.startsWith("/media/categories/") ? url.slice(0, 500) : "";
}

export function normalizeCurrencyCode(value: string) {
  void value;
  return IRAN_CURRENCY;
}

function isCurrencyCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function normalizeHexColor(value: string, fallback: string) {
  return isHexColor(value) ? value.toLowerCase() : fallback;
}

function normalizeProductVideoUrl(value: string) {
  const url = value.trim();
  return url.startsWith("/media/product-videos/") ? url.slice(0, 500) : "";
}
