import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCatalogProduct,
  getCatalogProductSlugs,
  getRelatedCatalogProducts,
} from "@/features/catalog/catalog-data";
import { ProductDetail } from "@/features/catalog/product-detail";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const slugs = await getCatalogProductSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getCatalogProduct(slug);
  if (!product) return {};

  return {
    title: product.title,
    description: product.description,
    alternates: { canonical: `/product/${encodeURIComponent(product.slug)}` },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getCatalogProduct(slug);
  if (!product) notFound();

  const relatedProducts = await getRelatedCatalogProducts(
    product.id,
    product.categorySlugs,
  );
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    sku: product.id,
    brand: { "@type": "Brand", name: product.brandName },
    offers: {
      "@type": "Offer",
      priceCurrency: product.price.currency,
      price: (product.price.amountMinor / 100).toFixed(2),
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: `/product/${encodeURIComponent(product.slug)}`,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <ProductDetail product={product} relatedProducts={relatedProducts} />
    </>
  );
}
