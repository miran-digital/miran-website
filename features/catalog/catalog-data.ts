import type {
  CatalogCategory,
  CatalogBrand,
  CatalogGateway,
  CatalogListingQuery,
  CatalogListingResult,
  CatalogMoney,
  CatalogProductDetail,
  CatalogProductSummary,
  CatalogSearchQuery,
  CatalogSearchResult,
} from "./catalog-gateway";
import { readStorefrontState } from "@/db/admin-repository";
import type { AdminBrand, AdminProduct } from "@/features/admin/admin-types";
import {
  isAmazingProductActive,
  stableBrandSlug,
} from "@/features/admin/admin-types";
import { minorToMajor } from "@/lib/money";
import { normalizePersianSearchText } from "@/lib/persian-search";
import { productHref } from "@/lib/product-link";
import { collectCategoryBrands } from "./category-brand-collection";
import {
  handleStorefrontFailure,
  isMockStorefrontAllowed,
} from "@/lib/storefront-runtime";

const irr = (legacyAmountMinor: number): CatalogMoney => ({
  amountMinor: legacyAmountMinor * 10_000,
  currency: "IRR",
});

const categories: readonly CatalogCategory[] = [
  {
    slug: "digital",
    name: "کالای دیجیتال",
    description: "موبایل، لپ‌تاپ، صوتی و لوازم جانبی دیجیتال.",
  },
  {
    slug: "mobile",
    name: "موبایل",
    description: "گوشی هوشمند و تجهیزات مرتبط برای استفاده روزمره.",
  },
  {
    slug: "computers",
    name: "لپ‌تاپ و کامپیوتر",
    description: "لپ‌تاپ، کامپیوتر و تجهیزات مناسب کار و استفاده شخصی.",
  },
  {
    slug: "audio",
    name: "هدفون و صوتی",
    description: "هدفون، اسپیکر و محصولات صوتی منتخب.",
  },
  {
    slug: "accessories",
    name: "لوازم جانبی دیجیتال",
    description: "شارژر، کابل و لوازم جانبی کاربردی.",
  },
  {
    slug: "home-kitchen",
    name: "خانه و آشپزخانه",
    description: "کالاهای کاربردی برای خانه، آشپزخانه و زندگی روزمره.",
  },
  {
    slug: "home-appliances",
    name: "لوازم برقی خانه",
    description: "لوازم برقی منتخب برای خانه و آشپزخانه.",
  },
  {
    slug: "cooking",
    name: "پخت‌وپز",
    description: "ابزار و لوازم مورد نیاز برای آشپزی و پذیرایی.",
  },
  {
    slug: "cleaning",
    name: "نظافت و شست‌وشو",
    description: "محصولات کاربردی برای نظافت خانه.",
  },
  {
    slug: "home-decor",
    name: "دکوراسیون",
    description: "انتخاب‌های ساده برای تکمیل فضای خانه.",
  },
  {
    slug: "fashion",
    name: "مد و پوشاک",
    description: "پوشاک، کفش و اکسسوری برای استایل روزمره.",
  },
  {
    slug: "women",
    name: "پوشاک زنانه",
    description: "انتخاب‌های روزمره از پوشاک زنانه.",
  },
  {
    slug: "men",
    name: "پوشاک مردانه",
    description: "انتخاب‌های روزمره از پوشاک مردانه.",
  },
  { slug: "shoes", name: "کفش", description: "کفش‌های روزمره و ورزشی منتخب." },
  {
    slug: "fashion-accessories",
    name: "کیف و اکسسوری",
    description: "کیف و اکسسوری‌های کاربردی و روزمره.",
  },
  {
    slug: "beauty-health",
    name: "زیبایی و سلامت",
    description: "مراقبت پوست، مو و بهداشت شخصی.",
  },
  {
    slug: "skincare",
    name: "مراقبت پوست",
    description: "محصولات منتخب برای روتین مراقبت پوست.",
  },
  {
    slug: "haircare",
    name: "مراقبت مو",
    description: "محصولات منتخب برای مراقبت روزمره مو.",
  },
  {
    slug: "fragrance",
    name: "عطر و ادکلن",
    description: "رایحه‌های منتخب برای استفاده روزمره.",
  },
  {
    slug: "personal-care",
    name: "بهداشت شخصی",
    description: "محصولات ضروری مراقبت و بهداشت شخصی.",
  },
  {
    slug: "sports-travel",
    name: "ورزش و سفر",
    description: "کالاهای ورزشی، کمپ و سفر.",
  },
  {
    slug: "kids-entertainment",
    name: "کودک و سرگرمی",
    description: "اسباب‌بازی و محصولات منتخب کودک.",
  },
  {
    slug: "automotive-tools",
    name: "خودرو و ابزار",
    description: "لوازم کاربردی خودرو و ابزارهای منتخب.",
  },
  {
    slug: "grocery",
    name: "سوپرمارکت",
    description: "کالاهای مصرفی و ضروری روزمره.",
  },
  {
    slug: "tobacco",
    name: "دخانیات",
    description: "دستهٔ مادر محصولات دخانی.",
  },
  {
    slug: "hookah-tobacco",
    name: "تنباکو",
    description: "تنباکوهای موجود از برندهای مختلف.",
  },
];

const categoryParents: Readonly<Record<string, string>> = {
  mobile: "digital",
  computers: "digital",
  audio: "digital",
  accessories: "digital",
  "home-appliances": "home-kitchen",
  cooking: "home-kitchen",
  cleaning: "home-kitchen",
  "home-decor": "home-kitchen",
  women: "fashion",
  men: "fashion",
  shoes: "fashion",
  "fashion-accessories": "fashion",
  skincare: "beauty-health",
  haircare: "beauty-health",
  fragrance: "beauty-health",
  "personal-care": "beauty-health",
  "hookah-tobacco": "tobacco",
};

function getStaticCategories(): CatalogCategory[] {
  return categories.map((category) => ({
    ...category,
    ...(categoryParents[category.slug]
      ? { parentSlug: categoryParents[category.slug] }
      : {}),
  }));
}

const products: readonly CatalogProductSummary[] = [
  {
    id: "phone-1",
    title: "گوشی هوشمند Nova 128GB",
    href: "/product/nova-128",
    mediaLabel: "Mobile",
    brandId: "nova",
    brandName: "Nova",
    categorySlugs: ["digital", "mobile"],
    price: irr(24999),
    badge: "پرفروش",
    inStock: true,
    featuredRank: 1,
    publishedAt: "2026-07-20T10:00:00Z",
  },
  {
    id: "phone-2",
    title: "گوشی هوشمند Orbit Pro",
    href: "/product/orbit-pro",
    mediaLabel: "Mobile",
    brandId: "orbit",
    brandName: "Orbit",
    categorySlugs: ["digital", "mobile"],
    price: irr(39999),
    previousPrice: irr(42999),
    badge: "تخفیف",
    inStock: true,
    featuredRank: 2,
    publishedAt: "2026-07-28T10:00:00Z",
  },
  {
    id: "laptop-1",
    title: "لپ‌تاپ سبک Vertex 14",
    href: "/product/vertex-14",
    mediaLabel: "Laptop",
    brandId: "vertex",
    brandName: "Vertex",
    categorySlugs: ["digital", "computers"],
    price: irr(64999),
    inStock: true,
    featuredRank: 3,
    publishedAt: "2026-07-12T10:00:00Z",
  },
  {
    id: "laptop-2",
    title: "لپ‌تاپ کاری Vertex Air",
    href: "/product/vertex-air",
    mediaLabel: "Laptop",
    brandId: "vertex",
    brandName: "Vertex",
    categorySlugs: ["digital", "computers"],
    price: irr(79999),
    inStock: false,
    featuredRank: 8,
    publishedAt: "2026-06-25T10:00:00Z",
  },
  {
    id: "audio-1",
    title: "هدفون بی‌سیم Sonic One",
    href: "/product/sonic-one",
    mediaLabel: "Audio",
    brandId: "sonic",
    brandName: "Sonic",
    categorySlugs: ["digital", "audio"],
    price: irr(6999),
    previousPrice: irr(8999),
    badge: "پیشنهاد ویژه",
    inStock: true,
    featuredRank: 4,
    publishedAt: "2026-08-01T10:00:00Z",
  },
  {
    id: "audio-2",
    title: "اسپیکر قابل حمل Sonic Mini",
    href: "/product/sonic-mini",
    mediaLabel: "Audio",
    brandId: "sonic",
    brandName: "Sonic",
    categorySlugs: ["digital", "audio"],
    price: irr(7999),
    inStock: true,
    featuredRank: 6,
    publishedAt: "2026-07-18T10:00:00Z",
  },
  {
    id: "power-1",
    title: "شارژر سریع Volt 65W",
    href: "/product/volt-65w",
    mediaLabel: "Power",
    brandId: "volt",
    brandName: "Volt",
    categorySlugs: ["digital", "accessories"],
    price: irr(3999),
    inStock: true,
    featuredRank: 5,
    publishedAt: "2026-08-03T10:00:00Z",
  },
  {
    id: "power-2",
    title: "پاوربانک Volt 20K",
    href: "/product/volt-20k",
    mediaLabel: "Power",
    brandId: "volt",
    brandName: "Volt",
    categorySlugs: ["digital", "accessories"],
    price: irr(4499),
    inStock: true,
    featuredRank: 7,
    publishedAt: "2026-07-30T10:00:00Z",
  },
  {
    id: "home-1",
    title: "کتری برقی Haven",
    href: "/product/haven-kettle",
    mediaLabel: "Kitchen",
    brandId: "haven",
    brandName: "Haven",
    categorySlugs: ["home-kitchen", "home-appliances", "cooking"],
    price: irr(2999),
    inStock: true,
    featuredRank: 1,
    publishedAt: "2026-07-21T10:00:00Z",
  },
  {
    id: "home-2",
    title: "جارو شارژی Haven Lite",
    href: "/product/haven-vacuum",
    mediaLabel: "Home",
    brandId: "haven",
    brandName: "Haven",
    categorySlugs: ["home-kitchen", "home-appliances", "cleaning"],
    price: irr(11999),
    previousPrice: irr(14999),
    inStock: true,
    featuredRank: 2,
    publishedAt: "2026-07-26T10:00:00Z",
  },
  {
    id: "home-3",
    title: "چراغ رومیزی Loom",
    href: "/product/loom-desk-lamp",
    mediaLabel: "Decor",
    brandId: "loom",
    brandName: "Loom",
    categorySlugs: ["home-kitchen", "home-decor"],
    price: irr(3499),
    inStock: true,
    featuredRank: 3,
    publishedAt: "2026-07-14T10:00:00Z",
  },
  {
    id: "fashion-1",
    title: "کفش روزمره Move",
    href: "/product/move-everyday",
    mediaLabel: "Shoes",
    brandId: "move",
    brandName: "Move",
    categorySlugs: ["fashion", "shoes", "women", "men"],
    price: irr(5499),
    previousPrice: irr(6999),
    inStock: true,
    featuredRank: 1,
    publishedAt: "2026-07-29T10:00:00Z",
  },
  {
    id: "fashion-2",
    title: "کیف مینیمال Loom",
    href: "/product/loom-minimal-bag",
    mediaLabel: "Bag",
    brandId: "loom",
    brandName: "Loom",
    categorySlugs: ["fashion", "fashion-accessories", "women"],
    price: irr(4999),
    inStock: true,
    featuredRank: 2,
    publishedAt: "2026-07-16T10:00:00Z",
  },
  {
    id: "fashion-3",
    title: "پیراهن روزمره North",
    href: "/product/north-shirt",
    mediaLabel: "Fashion",
    brandId: "north",
    brandName: "North",
    categorySlugs: ["fashion", "men"],
    price: irr(4299),
    inStock: true,
    featuredRank: 3,
    publishedAt: "2026-07-11T10:00:00Z",
  },
  {
    id: "beauty-1",
    title: "ست مراقبت پوست Pure",
    href: "/product/pure-skincare-set",
    mediaLabel: "Beauty",
    brandId: "pure",
    brandName: "Pure",
    categorySlugs: ["beauty-health", "skincare", "personal-care"],
    price: irr(3299),
    previousPrice: irr(4299),
    inStock: true,
    featuredRank: 1,
    publishedAt: "2026-08-02T10:00:00Z",
  },
  {
    id: "beauty-2",
    title: "ماسک موی Pure Care",
    href: "/product/pure-hair-mask",
    mediaLabel: "Beauty",
    brandId: "pure",
    brandName: "Pure",
    categorySlugs: ["beauty-health", "haircare", "personal-care"],
    price: irr(1899),
    inStock: true,
    featuredRank: 2,
    publishedAt: "2026-07-22T10:00:00Z",
  },
  {
    id: "beauty-3",
    title: "عطر روزانه Aura",
    href: "/product/aura-daily",
    mediaLabel: "Fragrance",
    brandId: "aura",
    brandName: "Aura",
    categorySlugs: ["beauty-health", "fragrance"],
    price: irr(4599),
    inStock: false,
    featuredRank: 3,
    publishedAt: "2026-07-10T10:00:00Z",
  },
  {
    id: "sports-1",
    title: "کوله سفر Trek 28L",
    href: "/product/trek-28",
    mediaLabel: "Travel",
    brandId: "trek",
    brandName: "Trek",
    categorySlugs: ["sports-travel"],
    price: irr(5299),
    inStock: true,
    featuredRank: 1,
    publishedAt: "2026-07-27T10:00:00Z",
  },
  {
    id: "kids-1",
    title: "ست ساختنی Play Lab",
    href: "/product/play-lab",
    mediaLabel: "Kids",
    brandId: "play",
    brandName: "Play",
    categorySlugs: ["kids-entertainment"],
    price: irr(2499),
    inStock: true,
    featuredRank: 1,
    publishedAt: "2026-07-19T10:00:00Z",
  },
  {
    id: "auto-1",
    title: "کیت ابزار Drive 40",
    href: "/product/drive-tool-kit",
    mediaLabel: "Tools",
    brandId: "drive",
    brandName: "Drive",
    categorySlugs: ["automotive-tools"],
    price: irr(5999),
    inStock: true,
    featuredRank: 1,
    publishedAt: "2026-07-24T10:00:00Z",
  },
  {
    id: "grocery-1",
    title: "پک قهوه روزانه Roast",
    href: "/product/roast-daily",
    mediaLabel: "Grocery",
    brandId: "roast",
    brandName: "Roast",
    categorySlugs: ["grocery"],
    price: irr(1299),
    inStock: true,
    featuredRank: 1,
    publishedAt: "2026-07-23T10:00:00Z",
  },
];

function findCategory(slug: string) {
  return categories.find((category) => category.slug === slug) ?? null;
}

function getCategoriesFromState(
  state: Awaited<ReturnType<typeof readStorefrontState>>,
) {
  const hiddenSlugs = new Set(state.hiddenCategoryIds);
  const staticCategories = getStaticCategories();
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of staticCategories) {
      if (
        category.parentSlug &&
        hiddenSlugs.has(category.parentSlug) &&
        !hiddenSlugs.has(category.slug)
      ) {
        hiddenSlugs.add(category.slug);
        changed = true;
      }
    }
  }
  const inactiveCustomSlugs = new Set(
    state.customCategories
      .filter((category) => !category.visible || hiddenSlugs.has(category.slug))
      .map((category) => category.slug),
  );
  changed = true;
  while (changed) {
    changed = false;
    for (const category of state.customCategories) {
      if (
        category.parentSlug &&
        (hiddenSlugs.has(category.parentSlug) ||
          inactiveCustomSlugs.has(category.parentSlug)) &&
        !inactiveCustomSlugs.has(category.slug)
      ) {
        inactiveCustomSlugs.add(category.slug);
        changed = true;
      }
    }
  }
  const customCategories: CatalogCategory[] = state.customCategories
    .filter(
      (category) =>
        category.visible &&
        !hiddenSlugs.has(category.slug) &&
        !inactiveCustomSlugs.has(category.slug),
    )
    .map((category) => ({
      slug: category.slug,
      name: category.name,
      description: category.description,
      ...(category.parentSlug ? { parentSlug: category.parentSlug } : {}),
      ...(category.imageUrl ? { imageUrl: category.imageUrl } : {}),
      imageHidden: category.imageHidden,
      custom: true,
    }));
  const customSlugs = new Set(customCategories.map((category) => category.slug));
  return [
    ...staticCategories.filter(
      (category) =>
        !customSlugs.has(category.slug) && !hiddenSlugs.has(category.slug),
    ),
    ...customCategories,
  ];
}

async function getEffectiveCategories() {
  try {
    return getCategoriesFromState(await readStorefrontState());
  } catch {
    handleStorefrontFailure("categories");
    return getStaticCategories();
  }
}

function getProductSlug(product: CatalogProductSummary) {
  return product.href.replace(/^\/product\//, "");
}

function normalizeSearchValue(value: string) {
  return normalizePersianSearchText(value);
}

function getProductSearchText(product: CatalogProductSummary) {
  const categoryNames = product.categorySlugs
    .map((slug) => findCategory(slug)?.name ?? "")
    .join(" ");
  return normalizeSearchValue(
    `${product.title} ${product.brandName} ${categoryNames} ${product.mediaLabel}`,
  );
}

function paginateProducts(
  items: readonly CatalogProductSummary[],
  query: CatalogSearchQuery,
): CatalogSearchResult {
  const pageSize = Math.max(1, Math.min(24, Math.trunc(query.pageSize)));
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, Math.trunc(query.page)), totalPages);
  const start = (page - 1) * pageSize;
  return {
    query: query.query,
    products: items.slice(start, start + pageSize),
    totalProducts: items.length,
    page,
    pageSize,
    totalPages,
  };
}

function buildProductDetail(
  product: CatalogProductSummary,
): CatalogProductDetail | null {
  const primaryCategory = findCategory(product.categorySlugs[0] ?? "");
  if (!primaryCategory) return null;

  return {
    ...product,
    availableQuantity: product.availableQuantity ?? (product.inStock ? 10 : 0),
    sku: product.sku ?? product.id.toUpperCase(),
    slug: getProductSlug(product),
    description: `${product.title} از برند ${product.brandName}، انتخابی کاربردی از مجموعه ${primaryCategory.name} Miran Shop است که با تضمین اصالت کالا و پشتیبانی پس از خرید ارائه می‌شود.`,
    primaryCategory,
    media: [
      { id: "primary", label: `نمای اصلی ${product.title}` },
      { id: "detail", label: `جزئیات ${product.title}` },
      { id: "package", label: `بسته‌بندی ${product.title}` },
    ],
    highlights: [
      "تضمین اصالت و سلامت کالا",
      "ارسال قابل پیگیری تا مقصد",
      "پشتیبانی Miran Shop پس از خرید",
    ],
    specifications: [
      { label: "برند", value: product.brandName },
      { label: "دسته‌بندی", value: primaryCategory.name },
      { label: "شناسه کالا", value: product.id },
      { label: "کد کالا", value: product.sku ?? product.id.toUpperCase() },
      { label: "وضعیت", value: product.inStock ? "موجود" : "ناموجود" },
    ],
    attributes: [],
    reviewCount: 0,
    questionCount: 0,
    calendarMode: "jalali",
    variants: [],
    sellerOffers: [],
  };
}

function sortProducts(
  items: CatalogProductSummary[],
  sort: CatalogListingQuery["sort"],
  allowPriceSort = true,
) {
  return items.sort((left, right) => {
    if (sort === "price-asc" && allowPriceSort)
      return left.price.amountMinor - right.price.amountMinor;
    if (sort === "price-desc" && allowPriceSort)
      return right.price.amountMinor - left.price.amountMinor;
    if (sort === "newest")
      return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
    return left.featuredRank - right.featuredRank;
  });
}

function databaseProductToSummary(
  product: AdminProduct,
  ancestorSlugs: readonly string[] = [],
  managedBrands: readonly AdminBrand[] = [],
): CatalogProductSummary {
  const availableQuantity = Math.max(
    0,
    product.stockQuantity - product.reservedQuantity,
  );
  const brandId =
    managedBrands.find(
      (brand) =>
        brand.name.trim().toLocaleLowerCase("fa") ===
        product.brand.trim().toLocaleLowerCase("fa"),
    )?.slug ?? stableBrandSlug(product.brand || "Miran");
  const seededProduct = isMockStorefrontAllowed()
    ? products.find((item) => item.id === product.id)
    : undefined;
  const amazingActive = isAmazingProductActive(product);
  const categorySlugs = [
    ...new Set([
      product.category,
      ...ancestorSlugs,
      ...(seededProduct?.categorySlugs ?? []),
    ]),
  ];
  return {
    id: product.id,
    title: product.title,
    href: productHref(product.slug),
    mediaLabel: seededProduct?.mediaLabel ?? (product.brand || "Miran"),
    ...(product.imageUrls[0] ? { imageUrl: product.imageUrls[0] } : {}),
    brandId,
    brandName: product.brand || "Miran",
    categorySlugs,
    price: { amountMinor: product.priceMinor, currency: product.currency },
    ...(product.compareAtPriceMinor > product.priceMinor
      ? { previousPrice: { amountMinor: product.compareAtPriceMinor, currency: product.currency } }
      : {}),
    badge: amazingActive
      ? "شگفت‌انگیز"
      : product.compareAtPriceMinor > product.priceMinor
        ? "تخفیف"
        : "جدید",
    ...(amazingActive ? { offerEndsAt: product.amazingEndsAt } : {}),
    inStock: availableQuantity > 0,
    availableQuantity,
    sku: product.sku || product.id.toUpperCase(),
    featuredRank: seededProduct?.featuredRank ?? 1,
    publishedAt: seededProduct?.publishedAt ?? product.createdAt ?? "1970-01-01T00:00:00Z",
  };
}

async function getDatabaseProducts() {
  const state = await readStorefrontState();
  const catalogCategories = getCategoriesFromState(state);
  return state.products
    .filter((product) => product.visible)
    .map((product) =>
      databaseProductToSummary(
        product,
        getCategoryAncestorSlugs(product.category, catalogCategories),
        state.brands,
      ),
    );
}

function getCategoryAncestorSlugs(
  slug: string,
  catalogCategories: readonly CatalogCategory[],
) {
  const ancestors: string[] = [];
  const seen = new Set([slug]);
  let current = catalogCategories.find((category) => category.slug === slug);
  while (current?.parentSlug && !seen.has(current.parentSlug)) {
    ancestors.push(current.parentSlug);
    seen.add(current.parentSlug);
    current = catalogCategories.find(
      (category) => category.slug === current?.parentSlug,
    );
  }
  return ancestors;
}

async function getEffectiveProducts() {
  try {
    return await getDatabaseProducts();
  } catch {
    handleStorefrontFailure("products");
    return products;
  }
}

function buildListingFromProducts(
  items: readonly CatalogProductSummary[],
  query: CatalogListingQuery,
  catalogCategories: readonly CatalogCategory[],
): CatalogListingResult | null {
  const category =
    catalogCategories.find((item) => item.slug === query.categorySlug) ?? null;
  if (!category) return null;
  const categoryProducts = items.filter((product) =>
    product.categorySlugs.includes(query.categorySlug),
  );
  const currencies = [
    ...new Set(categoryProducts.map((product) => product.price.currency)),
  ].sort();
  const brandCounts = new Map<string, { label: string; count: number }>();
  for (const product of categoryProducts) {
    const current = brandCounts.get(product.brandId);
    brandCounts.set(product.brandId, {
      label: product.brandName,
      count: (current?.count ?? 0) + 1,
    });
  }
  const filteredProducts = categoryProducts.filter((product) => {
    if (query.brandIds.length > 0 && !query.brandIds.includes(product.brandId))
      return false;
    if (query.inStockOnly && !product.inStock) return false;
    if (
      query.minPriceMajor !== undefined &&
      minorToMajor(product.price.amountMinor, product.price.currency) <
        query.minPriceMajor
    )
      return false;
    if (
      query.maxPriceMajor !== undefined &&
      minorToMajor(product.price.amountMinor, product.price.currency) >
        query.maxPriceMajor
    )
      return false;
    return true;
  });
  const pageSize = Math.max(1, Math.min(24, Math.trunc(query.pageSize)));
  const sortedProducts = sortProducts(
    [...filteredProducts],
    query.sort,
    currencies.length <= 1,
  );
  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / pageSize));
  const page = Math.min(Math.max(1, Math.trunc(query.page)), totalPages);
  const start = (page - 1) * pageSize;
  return {
    category,
    products: sortedProducts.slice(start, start + pageSize),
    brandFacets: [...brandCounts.entries()]
      .map(([id, value]) => ({ id, label: value.label, count: value.count }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    currencies,
    totalProducts: sortedProducts.length,
    page,
    pageSize,
    totalPages,
  };
}

const mockCatalogGateway: CatalogGateway = {
  async getCategory(slug) {
    return findCategory(slug);
  },
  async getCategorySlugs() {
    return categories.map((category) => category.slug);
  },
  async listCategories() {
    return categories;
  },
  async getProduct(slug) {
    const product = products.find((item) => getProductSlug(item) === slug);
    return product ? buildProductDetail(product) : null;
  },
  async getProductSlugs() {
    return products.map(getProductSlug);
  },
  async searchProducts(query) {
    const terms = normalizeSearchValue(query.query).split(" ").filter(Boolean);
    if (terms.length === 0) return paginateProducts([], query);
    const matches = products.filter((product) => {
      const searchable = getProductSearchText(product);
      return terms.every((term) => searchable.includes(term));
    });
    return paginateProducts(matches, query);
  },
  async listOffers(limit) {
    const offers = products
      .filter((product) => product.previousPrice !== undefined)
      .sort((left, right) => left.featuredRank - right.featuredRank);
    return limit === undefined ? offers : offers.slice(0, limit);
  },
  async listTrending(limit) {
    const trending = [...products].sort((left, right) => {
      if (left.inStock !== right.inStock) return left.inStock ? -1 : 1;
      return left.featuredRank - right.featuredRank;
    });
    return limit === undefined ? trending : trending.slice(0, limit);
  },
  async listBrands() {
    const brandMap = new Map<string, CatalogBrand>();
    for (const product of products) {
      const current = brandMap.get(product.brandId);
      brandMap.set(product.brandId, {
        id: product.brandId,
        name: product.brandName,
        productCount: (current?.productCount ?? 0) + 1,
      });
    }
    return [...brandMap.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  },
  async listBrandProducts(brandId) {
    return products.filter((product) => product.brandId === brandId);
  },
  async listRelatedProducts(productId, categorySlugs, limit) {
    return products
      .filter(
        (product) =>
          product.id !== productId &&
          product.categorySlugs.some((slug) => categorySlugs.includes(slug)),
      )
      .sort((left, right) => left.featuredRank - right.featuredRank)
      .slice(0, limit);
  },
  async listCategory(query) {
    const category = findCategory(query.categorySlug);
    if (!category) return null;

    const categoryProducts = products.filter((product) =>
      product.categorySlugs.includes(query.categorySlug),
    );
    const currencies = [
      ...new Set(categoryProducts.map((product) => product.price.currency)),
    ].sort();
    const brandCounts = new Map<string, { label: string; count: number }>();
    for (const product of categoryProducts) {
      const current = brandCounts.get(product.brandId);
      brandCounts.set(product.brandId, {
        label: product.brandName,
        count: (current?.count ?? 0) + 1,
      });
    }

    const filteredProducts = categoryProducts.filter((product) => {
      if (
        query.brandIds.length > 0 &&
        !query.brandIds.includes(product.brandId)
      )
        return false;
      if (query.inStockOnly && !product.inStock) return false;
      if (
        query.minPriceMajor !== undefined &&
        minorToMajor(product.price.amountMinor, product.price.currency) <
          query.minPriceMajor
      )
        return false;
      if (
        query.maxPriceMajor !== undefined &&
        minorToMajor(product.price.amountMinor, product.price.currency) >
          query.maxPriceMajor
      )
        return false;
      return true;
    });
    const sortedProducts = sortProducts(
      [...filteredProducts],
      query.sort,
      currencies.length <= 1,
    );
    const totalPages = Math.max(
      1,
      Math.ceil(sortedProducts.length / query.pageSize),
    );
    const page = Math.min(query.page, totalPages);
    const start = (page - 1) * query.pageSize;

    return {
      category,
      products: sortedProducts.slice(start, start + query.pageSize),
      brandFacets: [...brandCounts.entries()]
        .map(([id, value]) => ({ id, label: value.label, count: value.count }))
        .sort((left, right) => left.label.localeCompare(right.label)),
      currencies,
      totalProducts: sortedProducts.length,
      page,
      pageSize: query.pageSize,
      totalPages,
    } satisfies CatalogListingResult;
  },
};

export async function getCatalogCategory(slug: string) {
  return (await getEffectiveCategories()).find((category) => category.slug === slug) ?? null;
}

export async function getCatalogCategorySlugs() {
  return (await getEffectiveCategories()).map((category) => category.slug);
}

export async function getCatalogCategories() {
  return getEffectiveCategories();
}

export async function getCatalogProductsForCategory(
  categorySlug: string,
  limit?: number,
) {
  const categoryProducts = (await getEffectiveProducts())
    .filter((product) => product.categorySlugs.includes(categorySlug))
    .sort((left, right) => left.featuredRank - right.featuredRank);
  return limit === undefined ? categoryProducts : categoryProducts.slice(0, limit);
}

export async function getCatalogRootCategoryShowcases(limit = 8) {
  const [catalogProducts, catalogCategories] = await Promise.all([
    getEffectiveProducts(),
    getEffectiveCategories(),
  ]);
  let categoryOrder: readonly string[] = [];
  try {
    categoryOrder = (await readStorefrontState()).categoryOrder;
  } catch {
    handleStorefrontFailure("category-order");
    categoryOrder = [];
  }
  const rank = new Map(categoryOrder.map((slug, index) => [slug, index]));
  return catalogCategories
    .filter((category) => !category.parentSlug)
    .sort(
      (left, right) =>
        (rank.get(left.slug) ?? 999) - (rank.get(right.slug) ?? 999),
    )
    .map((category) => ({
      category,
      products: catalogProducts
        .filter((product) => product.categorySlugs.includes(category.slug))
        .sort((left, right) => left.featuredRank - right.featuredRank)
        .slice(0, limit),
    }));
}

export function getAdminCatalogCategories() {
  return getStaticCategories();
}

export async function getCatalogListing(query: CatalogListingQuery) {
  const [catalogProducts, catalogCategories] = await Promise.all([
    getEffectiveProducts(),
    getEffectiveCategories(),
  ]);
  return buildListingFromProducts(catalogProducts, query, catalogCategories);
}

export async function getCatalogProduct(slug: string) {
  try {
    const state = await readStorefrontState();
    const product = state.products.find(
      (item) => item.visible && item.slug === slug,
    );
    if (!product) return null;
    const catalogCategories = getCategoriesFromState(state);
    const primaryCategory =
      catalogCategories.find((category) => category.slug === product.category) ??
      catalogCategories[0];
    if (!primaryCategory) return null;
    const attributes = product.attributes.map((attribute) => ({
      code: attribute.code,
      label: attribute.label,
      dataType: attribute.dataType,
      value: attribute.value,
      ...(attribute.unit ? { unit: attribute.unit } : {}),
      filterable: attribute.filterable,
      searchable: attribute.searchable,
      comparable: attribute.comparable,
      keyFeature: attribute.keyFeature,
    }));
    return {
      ...databaseProductToSummary(
        product,
        getCategoryAncestorSlugs(product.category, catalogCategories),
      ),
      slug: product.slug,
      ...(product.englishTitle ? { englishTitle: product.englishTitle } : {}),
      ...(product.shortDescription ? { shortDescription: product.shortDescription } : {}),
      primaryCategory,
      description: product.description ||
        (isMockStorefrontAllowed()
          ? `${product.title}؛ محصول ثبت‌شده در کاتالوگ Miran Shop.`
          : ""),
      media: [
        ...product.imageUrls.map((imageUrl, index) => ({
              id: `${product.id}-${index + 1}`,
              label: `تصویر ${index + 1} از ${product.title}`,
              imageUrl,
            })),
        ...(product.videoUrl
          ? [{
              id: `${product.id}-video`,
              label: `ویدئوی کوتاه ${product.title}`,
              videoUrl: product.videoUrl,
            }]
          : []),
        ...(!product.imageUrls.length && !product.videoUrl
          ? [{ id: `${product.id}-main`, label: `تصویر ${product.title}` }]
          : []),
      ],
      highlights: attributes
        .filter((attribute) => attribute.keyFeature)
        .map((attribute) => `${attribute.label}: ${formatCatalogAttributeValue(attribute)}`),
      specifications: attributes.length > 0
        ? attributes.map((attribute) => ({
            label: attribute.label,
            value: formatCatalogAttributeValue(attribute),
          }))
        : [
            { label: "برند", value: product.brand || "Miran" },
            { label: "دسته‌بندی", value: primaryCategory.name },
            { label: "کد کالا", value: product.sku || product.id.toUpperCase() },
            {
              label: "موجودی قابل سفارش",
              value: Math.max(
                0,
                product.stockQuantity - product.reservedQuantity,
              ).toLocaleString("fa-IR"),
            },
          ],
      attributes,
      reviewCount: 0,
      questionCount: 0,
      calendarMode: state.commerce.calendarMode,
      variants: product.variants
        .filter((variant) => variant.visible)
        .map((variant) => ({
          id: variant.id,
          title: variant.title,
          sku: variant.sku,
          price: { amountMinor: variant.priceMinor, currency: product.currency },
          ...(variant.compareAtPriceMinor > variant.priceMinor
            ? { previousPrice: { amountMinor: variant.compareAtPriceMinor, currency: product.currency } }
            : {}),
          availableQuantity: Math.max(0, variant.stockQuantity - variant.reservedQuantity),
          attributes: variant.attributes.map((attribute) => ({
            code: attribute.code,
            label: attribute.label,
            dataType: attribute.dataType,
            value: attribute.value,
            ...(attribute.unit ? { unit: attribute.unit } : {}),
            filterable: attribute.filterable,
            searchable: attribute.searchable,
            comparable: attribute.comparable,
            keyFeature: false,
          })),
        })),
      sellerOffers: product.sellerOffers
        .filter((offer) => offer.visible)
        .map((offer) => ({
          id: offer.id,
          sellerId: offer.sellerId,
          sellerName: offer.sellerName,
          price: { amountMinor: offer.priceMinor, currency: product.currency },
          availableQuantity: Math.max(0, offer.stockQuantity - offer.reservedQuantity),
          guaranteeLabel: offer.guaranteeLabel,
          deliveryLabel: offer.deliveryLabel,
        })),
    };
  } catch {
    handleStorefrontFailure("product-detail");
    return mockCatalogGateway.getProduct(slug);
  }
}

function formatCatalogAttributeValue(attribute: {
  dataType: "text" | "number" | "boolean";
  value: string;
  unit?: string;
}) {
  const value = attribute.dataType === "boolean"
    ? attribute.value === "true" ? "بله" : "خیر"
    : attribute.dataType === "number"
      ? Number(attribute.value).toLocaleString("fa-IR")
      : attribute.value;
  return attribute.unit ? `${value} ${attribute.unit}` : value;
}

export async function getCatalogProductSlugs() {
  return (await getEffectiveProducts()).map(getProductSlug);
}

export async function searchCatalogProducts(query: CatalogSearchQuery) {
  const terms = normalizeSearchValue(query.query).split(" ").filter(Boolean);
  if (terms.length === 0) return paginateProducts([], query);
  const matches = (await getEffectiveProducts()).filter((product) => {
    const searchable = getProductSearchText(product);
    return terms.every((term) => searchable.includes(term));
  });
  return paginateProducts(matches, query);
}

export async function getCatalogOffers(limit?: number) {
  const offers = (await getEffectiveProducts())
    .filter((product) => product.previousPrice !== undefined || product.offerEndsAt)
    .sort((left, right) => left.featuredRank - right.featuredRank);
  return limit === undefined ? offers : offers.slice(0, limit);
}

export async function getCatalogTrending(limit?: number) {
  const trending = [...(await getEffectiveProducts())].sort((left, right) => {
    if (left.inStock !== right.inStock) return left.inStock ? -1 : 1;
    return left.featuredRank - right.featuredRank;
  });
  return limit === undefined ? trending : trending.slice(0, limit);
}

export async function getCatalogBrands() {
  const brandMap = new Map<string, CatalogBrand>();
  const catalogProducts = await getEffectiveProducts();
  let managedBrands: readonly AdminBrand[] = [];
  try {
    managedBrands = (await readStorefrontState()).brands;
  } catch {
    handleStorefrontFailure("brands");
    managedBrands = [];
  }
  const productCounts = new Map<string, number>();
  for (const product of catalogProducts) {
    productCounts.set(product.brandId, (productCounts.get(product.brandId) ?? 0) + 1);
  }
  for (const brand of managedBrands) {
    brandMap.set(brand.slug, {
      id: brand.slug,
      name: brand.name,
      productCount: productCounts.get(brand.slug) ?? 0,
    });
  }
  for (const product of catalogProducts) {
    const current = brandMap.get(product.brandId);
    brandMap.set(product.brandId, {
      id: product.brandId,
      name: product.brandName,
      productCount: current?.productCount ?? productCounts.get(product.brandId) ?? 0,
    });
  }
  return [...brandMap.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export async function getCatalogBrandsForCategory(categorySlug: string) {
  const [catalogCategories, catalogProducts] = await Promise.all([
    getEffectiveCategories(),
    getEffectiveProducts(),
  ]);
  let managedBrands: readonly AdminBrand[] = [];
  try {
    managedBrands = (await readStorefrontState()).brands;
  } catch {
    handleStorefrontFailure("category-brands");
    managedBrands = [];
  }
  return collectCategoryBrands(
    categorySlug,
    catalogCategories,
    catalogProducts,
    managedBrands,
  );
}

export async function getCatalogBrandProducts(brandId: string) {
  return (await getEffectiveProducts()).filter(
    (product) => product.brandId === brandId,
  );
}

export async function getRelatedCatalogProducts(
  productId: string,
  categorySlugs: readonly string[],
  limit = 4,
) {
  return (await getEffectiveProducts())
    .filter(
      (product) =>
        product.id !== productId &&
        product.categorySlugs.some((slug) => categorySlugs.includes(slug)),
    )
    .sort((left, right) => left.featuredRank - right.featuredRank)
    .slice(0, limit);
}
