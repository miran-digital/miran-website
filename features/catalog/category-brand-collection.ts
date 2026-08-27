import type { AdminBrand } from "../admin/admin-types";
import type {
  CatalogCategory,
  CatalogCategoryBrand,
  CatalogProductSummary,
} from "./catalog-gateway";

function isCategoryWithinBranch(
  candidateSlug: string,
  branchSlug: string,
  categories: readonly CatalogCategory[],
) {
  const visited = new Set<string>();
  let cursor = candidateSlug;
  while (cursor && !visited.has(cursor)) {
    if (cursor === branchSlug) return true;
    visited.add(cursor);
    cursor =
      categories.find((category) => category.slug === cursor)?.parentSlug ?? "";
  }
  return false;
}

export function collectCategoryBrands(
  categorySlug: string,
  catalogCategories: readonly CatalogCategory[],
  catalogProducts: readonly CatalogProductSummary[],
  managedBrands: readonly AdminBrand[],
) {
  const branchSlugs = new Set(
    catalogCategories
      .filter((category) =>
        isCategoryWithinBranch(category.slug, categorySlug, catalogCategories),
      )
      .map((category) => category.slug),
  );
  const branchProducts = catalogProducts.filter((product) =>
    product.categorySlugs.includes(categorySlug),
  );
  const productCounts = new Map<string, number>();
  for (const product of branchProducts) {
    productCounts.set(product.brandId, (productCounts.get(product.brandId) ?? 0) + 1);
  }

  const brands = new Map<string, CatalogCategoryBrand>();
  for (const brand of managedBrands) {
    if (!branchSlugs.has(brand.categorySlug)) continue;
    brands.set(brand.slug, {
      id: brand.slug,
      name: brand.name,
      categorySlug: brand.categorySlug,
      productCount: productCounts.get(brand.slug) ?? 0,
    });
  }
  for (const product of branchProducts) {
    if (brands.has(product.brandId)) continue;
    const directCategory =
      product.categorySlugs.find((slug) => branchSlugs.has(slug) && slug !== categorySlug) ??
      categorySlug;
    brands.set(product.brandId, {
      id: product.brandId,
      name: product.brandName,
      categorySlug: directCategory,
      productCount: productCounts.get(product.brandId) ?? 0,
    });
  }

  return [...brands.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "fa"),
  );
}
