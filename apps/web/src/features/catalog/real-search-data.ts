import { apiRequest } from "@/lib/api/client";
import type {
  CatalogProductSummary,
  CatalogSearchQuery,
  CatalogSearchResult,
} from "./catalog-gateway";

type ApiProduct = {
  id: string;
  slug: string;
  title: string;
  brand: string;
  category: null | { slug: string };
  pricing: { baseIrr: number; finalIrr: number; discountIrr: number };
  inStock: boolean;
  isAmazing: boolean;
  publishedAt: string;
};

function brandId(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "miran"
  );
}

function summaryOf(product: ApiProduct): CatalogProductSummary {
  const brand = product.brand || "Miran";
  return {
    id: product.id,
    title: product.title,
    href: `/product/${encodeURIComponent(product.slug)}`,
    mediaLabel: brand,
    brandId: brandId(brand),
    brandName: brand,
    categorySlugs: product.category ? [product.category.slug] : [],
    price: { amountMinor: product.pricing.finalIrr, currency: "IRR" },
    ...(product.pricing.discountIrr > 0
      ? {
          previousPrice: {
            amountMinor: product.pricing.baseIrr,
            currency: "IRR",
          },
        }
      : {}),
    ...(product.isAmazing ? { badge: "پیشنهاد شگفت‌انگیز" } : {}),
    inStock: product.inStock,
    featuredRank: product.isAmazing ? 1 : 100,
    publishedAt: product.publishedAt,
  };
}

export async function searchRealCatalogProducts(
  query: CatalogSearchQuery,
): Promise<CatalogSearchResult> {
  const normalized = query.query.trim().slice(0, 100);
  if (!normalized) {
    return {
      query: "",
      products: [],
      totalProducts: 0,
      page: 1,
      pageSize: query.pageSize,
      totalPages: 1,
    };
  }

  const params = new URLSearchParams({ q: normalized, limit: "100" });
  const rows = await apiRequest<ApiProduct[]>(
    `/v1/catalog/products?${params.toString()}`,
  );
  const products = rows.map(summaryOf);
  const totalPages = Math.max(1, Math.ceil(products.length / query.pageSize));
  const page = Math.min(Math.max(1, query.page), totalPages);
  const start = (page - 1) * query.pageSize;
  return {
    query: normalized,
    products: products.slice(start, start + query.pageSize),
    totalProducts: products.length,
    page,
    pageSize: query.pageSize,
    totalPages,
  };
}
