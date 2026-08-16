import { apiRequest } from "@/lib/api/client";
import type { HomeBrandSection, HomeCategory } from "./home-content";
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
    ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
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
      description: "تخفیف‌های فعال با قیمت نهایی محاسبه‌شده در Miran.",
      href: "/offers",
      linkLabel: "مشاهده همه پیشنهادها",
      products: toHomeProducts(amazing),
    });
  }
  if (newest.length > 0) {
    sections.push({
      id: "database-products",
      title: "جدیدترین محصولات Miran",
      description: "محصولات منتشرشده با قیمت و موجودی واقعی فروشگاه.",
      href: "/categories",
      linkLabel: "مشاهده همه محصولات",
      products: toHomeProducts(newest),
    });
  }
  return sections;
}

export async function getRealHomeBrands(limit = 12): Promise<HomeBrandSection> {
  const products = await getRealHomeProducts(100);
  const seen = new Set<string>();
  const items = [];

  for (const product of products) {
    if (!product.brandName || seen.has(product.brandId)) continue;
    seen.add(product.brandId);
    items.push({
      id: product.brandId,
      name: product.brandName,
      href: `/brand/${encodeURIComponent(product.brandId)}`,
    });
    if (items.length >= limit) break;
  }

  return {
    title: "برندهای موجود در Miran",
    description: "برندها مستقیماً از محصولات منتشرشده فروشگاه ساخته می‌شوند.",
    href: "/brands",
    linkLabel: "مشاهده همه برندها",
    items,
  };
}
