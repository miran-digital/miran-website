import { ApiError, apiRequest } from "@/lib/api/client";
import type {
  CatalogBrandFacet,
  CatalogCategory,
  CatalogListingQuery,
  CatalogListingResult,
  CatalogMoney,
  CatalogProductDetail,
  CatalogProductSummary,
} from "./catalog-gateway";

type ApiCategory = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
  description: string;
};

type ApiProduct = {
  id: string;
  slug: string;
  title: string;
  description: string;
  brand: string;
  category: null | {
    id: string;
    slug: string;
    name: string;
    description: string;
  };
  pricing: {
    baseIrr: number;
    finalIrr: number;
    discountIrr: number;
  };
  currency: "IRR";
  inStock: boolean;
  availableQuantity: number;
  isAmazing: boolean;
  highlights: unknown[];
  specifications: unknown[];
  media: Array<{
    id: string;
    type: "IMAGE" | "VIDEO";
    url: string;
    sortOrder: number;
    isPrimary: boolean;
  }>;
  publishedAt: string;
  updatedAt: string;
};

function brandId(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "miran";
}

function money(irr: number): CatalogMoney {
  return { amountMinor: irr, currency: "IRR" };
}

function categoryOf(product: ApiProduct): CatalogCategory {
  return product.category
    ? {
        slug: product.category.slug,
        name: product.category.name,
        description: product.category.description,
      }
    : {
        slug: "uncategorized",
        name: "سایر محصولات",
        description: "محصولات بدون دسته‌بندی مشخص.",
      };
}

function primaryImageOf(product: ApiProduct) {
  const images = product.media
    .filter((item) => item.type === "IMAGE" && Boolean(item.url))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder);
  return images[0]?.url;
}

function summaryOf(product: ApiProduct): CatalogProductSummary {
  const imageUrl = primaryImageOf(product);
  return {
    id: product.id,
    title: product.title,
    href: `/product/${encodeURIComponent(product.slug)}`,
    mediaLabel: product.brand || "Miran",
    ...(imageUrl ? { imageUrl } : {}),
    brandId: brandId(product.brand || "Miran"),
    brandName: product.brand || "Miran",
    categorySlugs: product.category ? [product.category.slug] : [],
    price: money(product.pricing.finalIrr),
    ...(product.pricing.discountIrr > 0
      ? { previousPrice: money(product.pricing.baseIrr) }
      : {}),
    ...(product.isAmazing ? { badge: "پیشنهاد شگفت‌انگیز" } : {}),
    inStock: product.inStock,
    featuredRank: product.isAmazing ? 1 : 100,
    publishedAt: product.publishedAt,
  };
}

function detailOf(product: ApiProduct): CatalogProductDetail {
  const summary = summaryOf(product);
  const specifications = product.specifications
    .filter(
      (item): item is { label: string; value: string } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { label?: unknown }).label === "string" &&
        typeof (item as { value?: unknown }).value === "string",
    )
    .map((item) => ({ label: item.label, value: item.value }));
  const highlights = product.highlights.filter(
    (item): item is string => typeof item === "string",
  );
  return {
    ...summary,
    slug: product.slug,
    description: product.description,
    primaryCategory: categoryOf(product),
    media: product.media.map((item) => ({
      id: item.id,
      label: item.type === "VIDEO" ? "ویدئوی محصول" : "تصویر محصول",
      url: item.url,
      mediaType: item.type,
    })),
    highlights,
    specifications,
  };
}

async function apiProducts(params: URLSearchParams = new URLSearchParams()) {
  const suffix = params.size ? `?${params.toString()}` : "";
  return apiRequest<ApiProduct[]>(`/v1/catalog/products${suffix}`);
}

export async function getRealCatalogCategories(): Promise<readonly CatalogCategory[]> {
  const categories = await apiRequest<ApiCategory[]>("/v1/catalog/categories");
  return categories.map((category) => ({
    slug: category.slug,
    name: category.name,
    description: category.description,
  }));
}

export async function getRealCatalogCategory(slug: string): Promise<CatalogCategory | null> {
  const categories = await getRealCatalogCategories();
  return categories.find((category) => category.slug === slug) ?? null;
}

export async function getRealCatalogProduct(slug: string): Promise<CatalogProductDetail | null> {
  try {
    const product = await apiRequest<ApiProduct>(
      `/v1/catalog/products/${encodeURIComponent(slug)}`,
    );
    return detailOf(product);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function getRealRelatedProducts(
  productId: string,
  categorySlugs: readonly string[],
  limit = 4,
): Promise<readonly CatalogProductSummary[]> {
  const category = categorySlugs[0];
  if (!category) return [];
  const params = new URLSearchParams({ category, limit: String(Math.min(20, limit + 1)) });
  const products = await apiProducts(params);
  return products
    .filter((product) => product.id !== productId)
    .slice(0, limit)
    .map(summaryOf);
}

function sortProducts(products: CatalogProductSummary[], sort: CatalogListingQuery["sort"]) {
  if (sort === "price-asc") {
    return products.sort((a, b) => a.price.amountMinor - b.price.amountMinor);
  }
  if (sort === "price-desc") {
    return products.sort((a, b) => b.price.amountMinor - a.price.amountMinor);
  }
  if (sort === "newest") {
    return products.sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
    );
  }
  return products.sort((a, b) => a.featuredRank - b.featuredRank);
}

export async function getRealCatalogListing(
  query: CatalogListingQuery,
): Promise<CatalogListingResult | null> {
  const category = await getRealCatalogCategory(query.categorySlug);
  if (!category) return null;

  const params = new URLSearchParams({
    category: query.categorySlug,
    limit: "100",
  });
  const apiRows = await apiProducts(params);
  const allProducts = apiRows.map(summaryOf);

  const brandCounts = new Map<string, { label: string; count: number }>();
  for (const product of allProducts) {
    const current = brandCounts.get(product.brandId);
    brandCounts.set(product.brandId, {
      label: product.brandName,
      count: (current?.count ?? 0) + 1,
    });
  }

  const filtered = allProducts.filter((product) => {
    if (query.brandIds.length > 0 && !query.brandIds.includes(product.brandId)) return false;
    if (query.inStockOnly && !product.inStock) return false;
    if (query.minPriceMinor !== undefined && product.price.amountMinor < query.minPriceMinor) return false;
    if (query.maxPriceMinor !== undefined && product.price.amountMinor > query.maxPriceMinor) return false;
    return true;
  });
  const sorted = sortProducts([...filtered], query.sort);
  const totalPages = Math.max(1, Math.ceil(sorted.length / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const start = (page - 1) * query.pageSize;
  const brandFacets: CatalogBrandFacet[] = [...brandCounts.entries()]
    .map(([id, value]) => ({ id, label: value.label, count: value.count }))
    .sort((a, b) => a.label.localeCompare(b.label, "fa"));

  return {
    category,
    products: sorted.slice(start, start + query.pageSize),
    brandFacets,
    totalProducts: sorted.length,
    page,
    pageSize: query.pageSize,
    totalPages,
  };
}

export async function getRealHomeProducts(limit = 12) {
  const params = new URLSearchParams({ limit: String(Math.min(100, limit)) });
  return (await apiProducts(params)).map(summaryOf);
}

export async function getRealAmazingProducts(limit = 12) {
  const params = new URLSearchParams({
    limit: String(Math.min(100, limit)),
    amazing: "1",
  });
  return (await apiProducts(params)).map(summaryOf);
}
