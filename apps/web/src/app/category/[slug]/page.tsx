import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryListing } from "@/features/catalog/category-listing";
import {
  getRealCatalogCategory,
  getRealCatalogListing,
} from "@/features/catalog/real-catalog-data";
import {
  parseCategoryListingState,
  toCatalogListingQuery,
  type ListingSearchParams,
} from "@/features/catalog/listing-state";

export const dynamic = "force-dynamic";

type CategoryPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<ListingSearchParams>;
};

export async function generateMetadata({
  params,
}: Pick<CategoryPageProps, "params">): Promise<Metadata> {
  const { slug } = await params;
  const category = await getRealCatalogCategory(slug);
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
  const listing = await getRealCatalogListing(toCatalogListingQuery(slug, state));
  if (!listing) notFound();

  return (
    <CategoryListing
      listing={listing}
      state={{ ...state, page: listing.page }}
    />
  );
}
