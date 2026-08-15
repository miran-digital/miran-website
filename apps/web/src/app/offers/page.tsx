import type { Metadata } from "next";
import { getRealAmazingProducts } from "@/features/catalog/real-catalog-data";
import { CollectionPage } from "@/features/catalog/collection-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "پیشنهاد شگفت‌انگیز",
  description: "محصولات دارای تخفیف فعال در Miran Shop.",
  alternates: { canonical: "/offers" },
};

export default async function OffersPage() {
  const products = await getRealAmazingProducts(100);
  return (
    <CollectionPage
      eyebrow="فرصت خرید"
      title="پیشنهاد شگفت‌انگیز"
      description="محصولات منتشرشده‌ای که مدیر به‌عنوان پیشنهاد شگفت‌انگیز فعال کرده است؛ قیمت و موجودی از Backend خوانده می‌شود."
      products={products}
    />
  );
}
