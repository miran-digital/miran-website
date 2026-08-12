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

const gbp = (amountMinor: number): CatalogMoney => ({
  amountMinor,
  currency: "GBP",
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
];

const products: readonly CatalogProductSummary[] = [
  {
    id: "phone-1",
    title: "گوشی هوشمند Nova 128GB",
    href: "/product/nova-128",
    mediaLabel: "Mobile",
    brandId: "nova",
    brandName: "Nova",
    categorySlugs: ["digital", "mobile"],
    price: gbp(24999),
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
    price: gbp(39999),
    previousPrice: gbp(42999),
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
    price: gbp(64999),
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
    price: gbp(79999),
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
    price: gbp(6999),
    previousPrice: gbp(8999),
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
    price: gbp(7999),
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
    price: gbp(3999),
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
    price: gbp(4499),
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
    price: gbp(2999),
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
    price: gbp(11999),
    previousPrice: gbp(14999),
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
    price: gbp(3499),
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
    price: gbp(5499),
    previousPrice: gbp(6999),
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
    price: gbp(4999),
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
    price: gbp(4299),
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
    price: gbp(3299),
    previousPrice: gbp(4299),
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
    price: gbp(1899),
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
    price: gbp(4599),
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
    price: gbp(5299),
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
    price: gbp(2499),
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
    price: gbp(5999),
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
    price: gbp(1299),
    inStock: true,
    featuredRank: 1,
    publishedAt: "2026-07-23T10:00:00Z",
  },
];

function findCategory(slug: string) {
  return categories.find((category) => category.slug === slug) ?? null;
}

function getProductSlug(product: CatalogProductSummary) {
  return product.href.replace(/^\/product\//, "");
}

function normalizeSearchValue(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("fa")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ");
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
      { label: "وضعیت", value: product.inStock ? "موجود" : "ناموجود" },
    ],
  };
}

function sortProducts(
  items: CatalogProductSummary[],
  sort: CatalogListingQuery["sort"],
) {
  return items.sort((left, right) => {
    if (sort === "price-asc")
      return left.price.amountMinor - right.price.amountMinor;
    if (sort === "price-desc")
      return right.price.amountMinor - left.price.amountMinor;
    if (sort === "newest")
      return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
    return left.featuredRank - right.featuredRank;
  });
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
        query.minPriceMinor !== undefined &&
        product.price.amountMinor < query.minPriceMinor
      )
        return false;
      if (
        query.maxPriceMinor !== undefined &&
        product.price.amountMinor > query.maxPriceMinor
      )
        return false;
      return true;
    });
    const sortedProducts = sortProducts([...filteredProducts], query.sort);
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
      totalProducts: sortedProducts.length,
      page,
      pageSize: query.pageSize,
      totalPages,
    } satisfies CatalogListingResult;
  },
};

export async function getCatalogCategory(slug: string) {
  return mockCatalogGateway.getCategory(slug);
}

export async function getCatalogCategorySlugs() {
  return mockCatalogGateway.getCategorySlugs();
}

export async function getCatalogCategories() {
  return mockCatalogGateway.listCategories();
}

export async function getCatalogListing(query: CatalogListingQuery) {
  return mockCatalogGateway.listCategory(query);
}

export async function getCatalogProduct(slug: string) {
  return mockCatalogGateway.getProduct(slug);
}

export async function getCatalogProductSlugs() {
  return mockCatalogGateway.getProductSlugs();
}

export async function searchCatalogProducts(query: CatalogSearchQuery) {
  return mockCatalogGateway.searchProducts(query);
}

export async function getCatalogOffers(limit?: number) {
  return mockCatalogGateway.listOffers(limit);
}

export async function getCatalogTrending(limit?: number) {
  return mockCatalogGateway.listTrending(limit);
}

export async function getCatalogBrands() {
  return mockCatalogGateway.listBrands();
}

export async function getCatalogBrandProducts(brandId: string) {
  return mockCatalogGateway.listBrandProducts(brandId);
}

export async function getRelatedCatalogProducts(
  productId: string,
  categorySlugs: readonly string[],
  limit = 4,
) {
  return mockCatalogGateway.listRelatedProducts(
    productId,
    categorySlugs,
    limit,
  );
}
