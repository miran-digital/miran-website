import type { Metadata } from "next";
import { getCatalogTrending } from "@/features/catalog/catalog-data";
import { WishlistPage } from "@/features/wishlist/wishlist-page";

export const metadata: Metadata = {
  title: "علاقه‌مندی‌ها",
  description: "محصولات ذخیره‌شده شما در Miran Shop.",
  robots: { index: false, follow: false },
};

export default async function WishlistRoute() {
  const catalogProducts = await getCatalogTrending();
  return <WishlistPage catalogProducts={catalogProducts} />;
}
