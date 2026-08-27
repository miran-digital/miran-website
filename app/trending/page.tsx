import type { Metadata } from "next";
import { getCatalogTrending } from "@/features/catalog/catalog-data";
import { CollectionPage } from "@/features/catalog/collection-page";

export const metadata: Metadata = {
  title: "محبوب و پربازدید",
  description: "محصولات محبوب و منتخب Miran Shop.",
  alternates: { canonical: "/trending" },
};

export default async function TrendingPage() {
  const products = await getCatalogTrending(12);
  return (
    <CollectionPage
      eyebrow="انتخاب مشتریان"
      title="محبوب و پربازدید"
      description="محصولاتی که در تجربه فعلی فروشگاه بیشتر در معرض دید قرار گرفته‌اند."
      products={products}
    />
  );
}
