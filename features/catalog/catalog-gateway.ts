import type { CalendarMode } from "@/lib/jalali";

export type CatalogMoney = {
  amountMinor: number;
  currency: string;
};

export type CatalogCategory = {
  slug: string;
  name: string;
  description: string;
  parentSlug?: string;
  custom?: boolean;
  imageUrl?: string;
  imageHidden?: boolean;
};

export type CatalogProductSummary = {
  id: string;
  title: string;
  href: string;
  mediaLabel: string;
  imageUrl?: string;
  brandId: string;
  brandName: string;
  categorySlugs: readonly string[];
  price: CatalogMoney;
  previousPrice?: CatalogMoney;
  badge?: string;
  offerEndsAt?: string;
  inStock: boolean;
  availableQuantity?: number;
  sku?: string;
  featuredRank: number;
  publishedAt: string;
};

export type CatalogProductMedia = {
  id: string;
  label: string;
  imageUrl?: string;
  videoUrl?: string;
};

export type CatalogProductSpecification = {
  label: string;
  value: string;
};

export type CatalogProductVariant = {
  id: string;
  title: string;
  sku: string;
  price: CatalogMoney;
  previousPrice?: CatalogMoney;
  availableQuantity: number;
  attributes: readonly CatalogProductAttribute[];
};

export type CatalogProductAttribute = {
  code: string;
  label: string;
  dataType: "text" | "number" | "boolean";
  value: string;
  unit?: string;
  filterable: boolean;
  searchable: boolean;
  comparable: boolean;
  keyFeature: boolean;
};

export type CatalogSellerOffer = {
  id: string;
  sellerId: string;
  sellerName: string;
  price: CatalogMoney;
  availableQuantity: number;
  guaranteeLabel: string;
  deliveryLabel: string;
};

export type CatalogProductDetail = CatalogProductSummary & {
  slug: string;
  englishTitle?: string;
  shortDescription?: string;
  description: string;
  primaryCategory: CatalogCategory;
  media: readonly CatalogProductMedia[];
  highlights: readonly string[];
  specifications: readonly CatalogProductSpecification[];
  attributes: readonly CatalogProductAttribute[];
  ratingAverage?: number | null;
  reviewCount: number;
  questionCount: number;
  calendarMode: CalendarMode;
  variants: readonly CatalogProductVariant[];
  sellerOffers: readonly CatalogSellerOffer[];
};

export type CatalogBrand = {
  id: string;
  name: string;
  productCount: number;
};

export type CatalogCategoryBrand = CatalogBrand & {
  categorySlug: string;
};

export type CatalogSearchQuery = {
  query: string;
  page: number;
  pageSize: number;
};

export type CatalogSearchResult = {
  query: string;
  products: readonly CatalogProductSummary[];
  totalProducts: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CatalogSort = "featured" | "price-asc" | "price-desc" | "newest";

export type CatalogListingQuery = {
  categorySlug: string;
  brandIds: readonly string[];
  inStockOnly: boolean;
  minPriceMajor?: number;
  maxPriceMajor?: number;
  sort: CatalogSort;
  page: number;
  pageSize: number;
};

export type CatalogBrandFacet = {
  id: string;
  label: string;
  count: number;
};

export type CatalogListingResult = {
  category: CatalogCategory;
  products: readonly CatalogProductSummary[];
  brandFacets: readonly CatalogBrandFacet[];
  currencies: readonly string[];
  totalProducts: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export interface CatalogGateway {
  getCategory(slug: string): Promise<CatalogCategory | null>;
  getCategorySlugs(): Promise<readonly string[]>;
  listCategories(): Promise<readonly CatalogCategory[]>;
  getProduct(slug: string): Promise<CatalogProductDetail | null>;
  getProductSlugs(): Promise<readonly string[]>;
  searchProducts(query: CatalogSearchQuery): Promise<CatalogSearchResult>;
  listOffers(limit?: number): Promise<readonly CatalogProductSummary[]>;
  listTrending(limit?: number): Promise<readonly CatalogProductSummary[]>;
  listBrands(): Promise<readonly CatalogBrand[]>;
  listBrandProducts(brandId: string): Promise<readonly CatalogProductSummary[]>;
  listRelatedProducts(
    productId: string,
    categorySlugs: readonly string[],
    limit: number,
  ): Promise<readonly CatalogProductSummary[]>;
  listCategory(
    query: CatalogListingQuery,
  ): Promise<CatalogListingResult | null>;
}
