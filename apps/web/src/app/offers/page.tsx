import type { Metadata } from "next";
import { getCatalogOffers } from "@/features/catalog/catalog-data";
import { CollectionPage } from "@/features/catalog/collection-page";

export const metadata: Metadata = {
  title: "پیشنهادهای ویژه",
  description: "محصولات منتخب دارای تخفیف در Miran Shop.",
  alternates: { canonical: "/offers" },
};

export default async function OffersPage() {
  const products = await getCatalogOffers();
  return (
    <CollectionPage
      eyebrow="فرصت خرید"
      title="پیشنهادهای ویژه"
      description="کالاهای دارای قیمت ویژه؛ موجودی و قیمت نهایی هنگام خرید دوباره بررسی می‌شود."
      products={products}
    />
  );
}
