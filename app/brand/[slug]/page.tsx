import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCatalogBrandProducts,
  getCatalogBrands,
} from "@/features/catalog/catalog-data";
import { CollectionPage } from "@/features/catalog/collection-page";

type BrandPageProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const brands = await getCatalogBrands();
  return brands.map((brand) => ({ slug: brand.id }));
}

export async function generateMetadata({
  params,
}: BrandPageProps): Promise<Metadata> {
  const { slug } = await params;
  const brands = await getCatalogBrands();
  const brand = brands.find((item) => item.id === slug);
  if (!brand) return {};
  return {
    title: `برند ${brand.name}`,
    description: `مشاهده محصولات ${brand.name} در Miran Shop.`,
    alternates: { canonical: `/brand/${encodeURIComponent(brand.id)}` },
  };
}

export default async function BrandPage({ params }: BrandPageProps) {
  const { slug } = await params;
  const brands = await getCatalogBrands();
  const brand = brands.find((item) => item.id === slug);
  if (!brand) notFound();
  const products = await getCatalogBrandProducts(slug);
  return (
    <CollectionPage
      eyebrow="برند"
      title={brand.name}
      description={`محصولات موجود از برند ${brand.name}.`}
      products={products}
    />
  );
}
