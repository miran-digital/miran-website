import type { MetadataRoute } from "next";
import {
  getCatalogBrands,
  getCatalogCategories,
  getCatalogProductSlugs,
} from "@/features/catalog/catalog-data";
import { getSiteContentPages } from "@/features/content/site-content";
import { absoluteSiteUrl } from "@/lib/site-url";
import { productHref } from "@/lib/product-link";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, productSlugs, brands] = await Promise.all([
    getCatalogCategories(),
    getCatalogProductSlugs(),
    getCatalogBrands(),
  ]);
  const entries: MetadataRoute.Sitemap = [
    entry("/", "daily", 1),
    entry("/categories", "weekly", 0.9),
    entry("/offers", "daily", 0.9),
    entry("/trending", "daily", 0.8),
    entry("/brands", "weekly", 0.7),
    ...categories.map((category) =>
      entry(`/category/${encodeURIComponent(category.slug)}`, "daily", 0.8),
    ),
    ...productSlugs.map((slug) =>
      entry(productHref(slug), "daily", 0.8),
    ),
    ...brands.map((brand) =>
      entry(`/brand/${encodeURIComponent(brand.id)}`, "weekly", 0.6),
    ),
    ...getSiteContentPages().map((page) =>
      entry(`/${page.path}`, "monthly", 0.5),
    ),
  ];

  return [...new Map(entries.map((item) => [item.url, item])).values()];
}

function entry(
  path: string,
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>,
  priority: number,
): MetadataRoute.Sitemap[number] {
  return { url: absoluteSiteUrl(path), changeFrequency, priority };
}
