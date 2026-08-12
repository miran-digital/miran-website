import type { CatalogListingQuery, CatalogSort } from "./catalog-gateway";

export type ListingSearchParams = Record<string, string | string[] | undefined>;

export type CategoryListingState = {
  brandIds: readonly string[];
  inStockOnly: boolean;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  sort: CatalogSort;
  page: number;
};

const validSorts = new Set<CatalogSort>([
  "featured",
  "price-asc",
  "price-desc",
  "newest",
]);

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function allValues(value: string | string[] | undefined) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseMoneyToMinor(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 100);
}

export function parseCategoryListingState(
  searchParams: ListingSearchParams,
): CategoryListingState {
  const sortValue = firstValue(searchParams.sort);
  const minPriceMinor = parseMoneyToMinor(firstValue(searchParams.minPrice));
  const maxPriceMinor = parseMoneyToMinor(firstValue(searchParams.maxPrice));

  return {
    brandIds: [...new Set(allValues(searchParams.brand).filter(Boolean))],
    inStockOnly: firstValue(searchParams.inStock) === "1",
    ...(minPriceMinor === undefined ? {} : { minPriceMinor }),
    ...(maxPriceMinor === undefined ? {} : { maxPriceMinor }),
    sort:
      sortValue && validSorts.has(sortValue as CatalogSort)
        ? (sortValue as CatalogSort)
        : "featured",
    page: parsePage(firstValue(searchParams.page)),
  };
}

export function toCatalogListingQuery(
  categorySlug: string,
  state: CategoryListingState,
): CatalogListingQuery {
  return {
    categorySlug,
    brandIds: state.brandIds,
    inStockOnly: state.inStockOnly,
    ...(state.minPriceMinor === undefined
      ? {}
      : { minPriceMinor: state.minPriceMinor }),
    ...(state.maxPriceMinor === undefined
      ? {}
      : { maxPriceMinor: state.maxPriceMinor }),
    sort: state.sort,
    page: state.page,
    pageSize: 6,
  };
}

export function buildCategoryListingHref(
  categorySlug: string,
  state: CategoryListingState,
  overrides: Partial<Pick<CategoryListingState, "page" | "sort">> = {},
) {
  const nextState = { ...state, ...overrides };
  const params = new URLSearchParams();
  for (const brandId of nextState.brandIds) params.append("brand", brandId);
  if (nextState.inStockOnly) params.set("inStock", "1");
  if (nextState.minPriceMinor !== undefined)
    params.set("minPrice", String(nextState.minPriceMinor / 100));
  if (nextState.maxPriceMinor !== undefined)
    params.set("maxPrice", String(nextState.maxPriceMinor / 100));
  if (nextState.sort !== "featured") params.set("sort", nextState.sort);
  if (nextState.page > 1) params.set("page", String(nextState.page));
  const query = params.toString();
  return `/category/${encodeURIComponent(categorySlug)}${query ? `?${query}` : ""}`;
}

export function hasActiveListingFilters(state: CategoryListingState) {
  return (
    state.brandIds.length > 0 ||
    state.inStockOnly ||
    state.minPriceMinor !== undefined ||
    state.maxPriceMinor !== undefined
  );
}
