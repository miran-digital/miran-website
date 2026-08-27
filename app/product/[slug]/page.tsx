import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getCustomerUser } from "@/lib/customer-auth";
import { readStorefrontState } from "@/db/admin-repository";
import {
  getCustomerReviewState,
  listApprovedProductReviews,
} from "@/db/review-repository";
import {
  getCatalogProduct,
  getCatalogProductSlugs,
  getRelatedCatalogProducts,
} from "@/features/catalog/catalog-data";
import { ProductDetail } from "@/features/catalog/product-detail";
import { normalizeLegacyPriceToRial } from "@/lib/money";
import { absoluteSiteUrl } from "@/lib/site-url";
import { ProductReviews } from "@/features/reviews/product-reviews";
import { Container } from "@/components/ui";
import { productHref, resolveProductSlug } from "@/lib/product-link";
import { getProductEngagementSummary } from "@/db/product-page-repository";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  const slugs = await getCatalogProductSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getCatalogProduct(resolveProductSlug(slug));
  if (!product) return {};

  const imageUrl = product.media.flatMap((item) =>
    "imageUrl" in item && item.imageUrl ? [item.imageUrl] : [],
  )[0];

  return {
    title: product.title,
    description: product.shortDescription ?? product.description,
    alternates: { canonical: `/product/${encodeURIComponent(product.slug)}` },
    openGraph: {
      type: "website",
      locale: "fa_IR",
      title: product.title,
      description: product.shortDescription ?? product.description,
      url: `/product/${encodeURIComponent(product.slug)}`,
      ...(imageUrl
        ? { images: [{ url: imageUrl, alt: product.title }] }
        : {}),
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const canonicalSlug = resolveProductSlug(slug);
  if (canonicalSlug !== slug) permanentRedirect(productHref(canonicalSlug));
  const product = await getCatalogProduct(canonicalSlug);
  if (!product) notFound();

  const [relatedProducts, approvedReviewRows, engagement, user, calendarMode] = await Promise.all([
    getRelatedCatalogProducts(product.id, product.categorySlugs),
    listApprovedProductReviews(product.id).catch(() => []),
    getProductEngagementSummary(product.id).catch(() => ({
      ratingAverage: null,
      reviewCount: 0,
      questionCount: 0,
    })),
    getCustomerUser(),
    readStorefrontState().then((state) => state.commerce.calendarMode).catch(() => "jalali" as const),
  ]);
  const customerState = user
    ? await getCustomerReviewState(product.id, user.email).catch(() => ({ eligible: false, review: null }))
    : { eligible: false, review: null };
  const approvedReviews = approvedReviewRows.map(({ id, customerName, rating, title, body, createdAt }) => ({
    id,
    customerName,
    rating,
    title,
    body,
    createdAt,
  }));
  const canonicalUrl = absoluteSiteUrl(
    `/product/${encodeURIComponent(product.slug)}`,
  );
  const imageUrls = product.media
    .flatMap((item) =>
      "imageUrl" in item && item.imageUrl
        ? [absoluteSiteUrl(item.imageUrl)]
        : [],
    );
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    sku: product.sku || product.id,
    url: canonicalUrl,
    ...(imageUrls.length > 0 ? { image: imageUrls } : {}),
    brand: { "@type": "Brand", name: product.brandName },
    offers: {
      "@type": "Offer",
      priceCurrency: product.price.currency,
      price: normalizeLegacyPriceToRial(
        product.price.amountMinor,
        product.price.currency,
      ).toFixed(0),
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "Miran Shop" },
      url: canonicalUrl,
      ...(product.offerEndsAt
        ? { priceValidUntil: product.offerEndsAt.slice(0, 10) }
        : {}),
    },
    ...(approvedReviews.length > 0 ? {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: approvedReviews.reduce((sum, item) => sum + item.rating, 0) / approvedReviews.length,
        reviewCount: approvedReviews.length,
      },
    } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <ProductDetail
        product={{ ...product, ...engagement }}
        relatedProducts={relatedProducts}
      />
      <Container size="wide">
        <ProductReviews
          productId={product.id}
          approvedReviews={approvedReviews}
          customerState={customerState}
          signedIn={Boolean(user)}
          signInHref={`/account?next=${encodeURIComponent(`/product/${encodeURIComponent(product.slug)}#reviews`)}`}
          calendarMode={calendarMode}
        />
      </Container>
    </>
  );
}
