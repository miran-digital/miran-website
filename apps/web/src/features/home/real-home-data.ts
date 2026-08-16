import { apiRequest } from "@/lib/api/client";
import type { HomeCategory } from "./home-content";
import type { HomeProductRail } from "./merchandising-content";
import {
  getRealAmazingProducts,
  getRealHomeProducts,
} from "@/features/catalog/real-catalog-data";

type ApiCategory = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
  description: string;
};

export async function getRealHomeCategories(): Promise<readonly HomeCategory[]> {
  const categories = await apiRequest<ApiCategory[]>("/v1/catalog/categories");
  return categories
    .filter((category) => category.parentId === null)
    .map((category) => ({
      id: category.id,
      name: category.name,
      href: `/category/${encodeURIComponent(category.slug)}`,
      ...(category.description ? { itemCountLabel: category.description } : {}),
      ...(category.imageUrl ? { imageUrl: category.imageUrl } : {}),
    }));
}

function toHomeProducts(
  products: Awaited<ReturnType<typeof getRealHomeProducts>>,
) {
  return products.map((product) => ({
    id: product.id,
    title: product.title,
    href: product.href,
    mediaLabel: product.mediaLabel,
    eyebrow: product.brandName,
    ...(product.badge ? { badge: product.badge } : {}),
    price: product.price,
    ...(product.previousPrice ? { previousPrice: product.previousPrice } : {}),
  }));
}

export async function getRealHomeRails(): Promise<readonly HomeProductRail[]> {
  const [amazing, newest] = await Promise.all([
    getRealAmazingProducts(12),
    getRealHomeProducts(12),
  ]);

  const sections: HomeProductRail[] = [];
  if (amazing.length > 0) {
    sections.push({
      id: "database-amazing",
      title: "پیشنهاد شگفت‌انگیز",
      description: "تخفیف‌های فعال که قیمتشان در Backend محاسبه می‌شود.",
      href: "/offers",
      linkLabel: "مشاهده همه پیشنهادها",
      products: toHomeProducts(amazing),
    });
  }
  if (newest.length > 0) {
    sections.push({
      id: "database-products",
      title: "محصولات Miran",
      description: "محصولات منتشرشده مستقیم از Database فروشگاه.",
      href: "/categories",
      linkLabel: "مشاهده همه محصولات",
      products: toHomeProducts(newest),
    });
  }
  return sections;
}
