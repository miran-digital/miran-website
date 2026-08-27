import type { Metadata } from "next";
import {
  getCatalogCategories,
  getCatalogOffers,
} from "@/features/catalog/catalog-data";
import {
  OffersLandingPage,
  type OffersSearchParams,
} from "@/features/offers/offers-page";

export const metadata: Metadata = {
  title: "پیشنهاد شگفت‌انگیز",
  description: "پیشنهادهای زمان‌دار و محصولات منتخب دارای تخفیف در Miran Shop.",
  alternates: { canonical: "/offers" },
};

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<OffersSearchParams>;
}) {
  const [products, categories, params] = await Promise.all([
    getCatalogOffers(),
    getCatalogCategories(),
    searchParams,
  ]);
  return (
    <OffersLandingPage
      products={products}
      categories={categories}
      searchParams={params}
    />
  );
}
