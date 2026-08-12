import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryListing } from "@/features/catalog/category-listing";
import {
  getCatalogCategory,
  getCatalogCategorySlugs,
  getCatalogListing,
} from "@/features/catalog/catalog-data";
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
  const listing = await getCatalogListing(toCatalogListingQuery(slug, state));
  if (!listing) notFound();

  return (
    <CategoryListing
      listing={listing}
      state={{ ...state, page: listing.page }}
    />
  );
}
