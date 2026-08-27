import type { Metadata } from "next";
import { SellerPage } from "@/features/seller/seller-page";
import { getCatalogCategories } from "@/features/catalog/catalog-data";

export const metadata: Metadata = {
  title: "فروش در Miran Shop",
  description: "ثبت درخواست فروشندگی در Marketplace میران.",
  robots: { index: false, follow: true },
};

export default async function SellRoute() {
  const categories = await getCatalogCategories();
  return <SellerPage categories={categories} />;
}
