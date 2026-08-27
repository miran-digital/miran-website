import { getHomeContent } from "@/features/home/home-content";
import { getHomeMerchandisingContent } from "@/features/home/merchandising-content";
import { TrustSection } from "@/features/home/trust-section";
import { QuickAccess } from "@/features/home/quick-access";
import { ProductRail } from "@/features/home/product-rail";
import { getCatalogRootCategoryShowcases } from "@/features/catalog/catalog-data";
import {
  ManagedBanners,
  ManagedAmazingOffers,
  ManagedCategories,
  ManagedBrands,
  ManagedProductRail,
  ManagedSection,
} from "@/features/admin/managed-storefront";
import { isMockStorefrontAllowed } from "@/lib/storefront-runtime";

export default async function HomePage() {
  const allowMockContent = isMockStorefrontAllowed();
  const [content, merchandising, rootShowcases] = await Promise.all([
    getHomeContent(),
    getHomeMerchandisingContent(),
    getCatalogRootCategoryShowcases(8),
  ]);

  return (
    <main>
      <ManagedSection section="hero">
        <ManagedBanners fallbackHero={allowMockContent ? content.hero : undefined} />
      </ManagedSection>
      <QuickAccess />
      <ManagedAmazingOffers fallback={merchandising.specialOffers} />
      <ManagedCategories categories={content.categories} />
      {rootShowcases
        .filter((showcase) => showcase.products.length > 0)
        .map(({ category, products }, index) => (
          <ProductRail
            key={category.slug}
            tone={index % 2 === 1 ? "accent" : "default"}
            section={{
              id: `home-${category.slug}`,
              title: category.name,
              description: category.description,
              href: `/category/${category.slug}`,
              linkLabel: `مشاهده همهٔ ${category.name}`,
              products: products.map((product) => ({
                id: product.id,
                title: product.title,
                href: product.href,
                mediaLabel: product.mediaLabel,
                ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
                eyebrow: product.brandName,
                ...(product.badge ? { badge: product.badge } : {}),
                ...(product.offerEndsAt
                  ? { offerEndsAt: product.offerEndsAt }
                  : {}),
                price: product.price,
                ...(product.previousPrice
                  ? { previousPrice: product.previousPrice }
                  : {}),
              })),
            }}
          />
        ))}
      <ManagedProductRail
        section={merchandising.trending}
        sectionKey="trending"
      />
      <ManagedSection section="brands">
        <ManagedBrands fallback={content.brands} allowFallback={allowMockContent} />
      </ManagedSection>
      <ManagedSection section="trust">
        <TrustSection services={content.trustServices} />
      </ManagedSection>
    </main>
  );
}
