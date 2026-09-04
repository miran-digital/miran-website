export const DUPLICATE_SIBLING_CATEGORY_MESSAGE =
  "دسته‌ای با این نام در این دسته مادر از قبل وجود دارد.";

export type CategoryNameIdentity = {
  id: string;
  name: string;
  parentSlug: string;
};

export type CategoryReferenceSnapshot = {
  productCount: number;
  childCategoryCount: number;
  brandReferenceCount: number;
  bannerReferenceCount: number;
  hasBusinessReferences: boolean;
};

export function normalizeCategoryComparisonName(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

export function categorySiblingNameKey(
  category: Pick<CategoryNameIdentity, "name" | "parentSlug">,
) {
  const parent = category.parentSlug
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${parent}\u0000${normalizeCategoryComparisonName(category.name)}`;
}

export function findSiblingCategoryNameConflict(
  categories: readonly CategoryNameIdentity[],
  candidate: CategoryNameIdentity,
  excludedId = candidate.id,
) {
  const key = categorySiblingNameKey(candidate);
  if (!normalizeCategoryComparisonName(candidate.name)) return null;
  return categories.find(
    (category) =>
      category.id !== excludedId && categorySiblingNameKey(category) === key,
  ) ?? null;
}

export function hasUniqueSiblingCategoryNames(
  categories: readonly CategoryNameIdentity[],
) {
  const seen = new Set<string>();
  for (const category of categories) {
    const name = normalizeCategoryComparisonName(category.name);
    if (!name) continue;
    const key = categorySiblingNameKey(category);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/**
 * Production may already contain a legacy collision. Preserve unrelated edits,
 * but reject every new or enlarged sibling-name collision.
 */
export function introducesSiblingCategoryNameConflict(
  current: readonly CategoryNameIdentity[],
  next: readonly CategoryNameIdentity[],
) {
  const currentConflicts = conflictMembers(current);
  const nextConflicts = conflictMembers(next);
  for (const [key, memberIds] of nextConflicts) {
    const previousIds = currentConflicts.get(key);
    if (!previousIds || !sameMembers(previousIds, memberIds)) return true;
  }
  return false;
}

export function inspectCategoryReferences(
  source: {
    products: readonly { category: string }[];
    categories: readonly { parentSlug?: string }[];
    brands: readonly { categorySlug: string }[];
    banners: readonly { scope: string; categorySlug: string }[];
  },
  slug: string,
): CategoryReferenceSnapshot {
  const productCount = source.products.filter(
    (product) => product.category === slug,
  ).length;
  const childCategoryCount = source.categories.filter(
    (category) => category.parentSlug === slug,
  ).length;
  const brandReferenceCount = source.brands.filter(
    (brand) => brand.categorySlug === slug,
  ).length;
  const bannerReferenceCount = source.banners.filter(
    (banner) => banner.scope === "category" && banner.categorySlug === slug,
  ).length;
  return {
    productCount,
    childCategoryCount,
    brandReferenceCount,
    bannerReferenceCount,
    hasBusinessReferences:
      productCount +
        childCategoryCount +
        brandReferenceCount +
        bannerReferenceCount >
      0,
  };
}

function conflictMembers(categories: readonly CategoryNameIdentity[]) {
  const grouped = new Map<string, Set<string>>();
  for (const category of categories) {
    if (!normalizeCategoryComparisonName(category.name)) continue;
    const key = categorySiblingNameKey(category);
    const ids = grouped.get(key) ?? new Set<string>();
    ids.add(category.id);
    grouped.set(key, ids);
  }
  return new Map([...grouped].filter(([, ids]) => ids.size > 1));
}

function sameMembers(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return left.size === right.size && [...left].every((id) => right.has(id));
}
