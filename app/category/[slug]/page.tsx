import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryListing } from "@/features/catalog/category-listing";
import {
  getCatalogBrandsForCategory,
  getCatalogCategory,
  getCatalogCategorySlugs,
  getCatalogListing,
  getCatalogOffers,
  getCatalogProductsForCategory,
} from "@/features/catalog/catalog-data";
import { ParentCategoryShowcase } from "@/features/catalog/parent-category-showcase";
import { ManagedBanners } from "@/features/admin/managed-storefront";
import {
  parseCategoryListingState,
  toCatalogListingQuery,
  type ListingSearchParams,
} from "@/features/catalog/listing-state";

type CategoryPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<ListingSearchParams>;
};

export async function generateStaticParams() {
  const slugs = await getCatalogCategorySlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: Pick<CategoryPageProps, "params">): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCatalogCategory(slug);
  if (!category) return {};

  return {
    title: category.name,
    description: category.description,
    alternates: { canonical: `/category/${encodeURIComponent(category.slug)}` },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const [{ slug }, rawSearchParams] = await Promise.all([params, searchParams]);
  const state = parseCategoryListingState(rawSearchParams);
  const [listing, offers, categoryProducts, categoryBrands] = await Promise.all([
    getCatalogListing(toCatalogListingQuery(slug, state)),
    getCatalogOffers(),
    getCatalogProductsForCategory(slug, 10),
    getCatalogBrandsForCategory(slug),
  ]);
  if (!listing) notFound();
  const isRootCategory = !listing.category.parentSlug;

  return (
    <>
      {isRootCategory ? (
        <>
          <ManagedBanners categorySlug={listing.category.slug} />
          <ParentCategoryShowcase
            category={listing.category}
            brands={categoryBrands}
            products={categoryProducts}
            offers={offers}
          />
        </>
      ) : null}
      <div id={`all-${listing.category.slug}`}>
        <CategoryListing
          listing={listing}
          state={{ ...state, page: listing.page }}
          compactHeader={isRootCategory}
        />
      </div>
    </>
  );
}
