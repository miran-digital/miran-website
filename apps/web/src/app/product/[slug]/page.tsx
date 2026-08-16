import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getRealCatalogProduct,
  getRealRelatedProducts,
} from "@/features/catalog/real-catalog-data";
import { ProductDetail } from "@/features/catalog/product-detail";

export const dynamic = "force-dynamic";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getRealCatalogProduct(slug);
  if (!product) return {};

  return {
    title: product.title,
    description: product.description,
    alternates: { canonical: `/product/${encodeURIComponent(product.slug)}` },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getRealCatalogProduct(slug);
  if (!product) notFound();

  const relatedProducts = await getRealRelatedProducts(
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
      priceCurrency: "IRR",
      price: String(product.price.amountMinor),
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
