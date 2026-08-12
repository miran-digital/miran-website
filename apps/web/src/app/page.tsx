import { BrandSection } from "@/features/home/brand-section";
import { getHomeContent } from "@/features/home/home-content";
import { HeroSection } from "@/features/home/hero-section";
import { getHomeMerchandisingContent } from "@/features/home/merchandising-content";
import { TrustSection } from "@/features/home/trust-section";
import {
  ManagedBanners,
  ManagedCategories,
  ManagedProductRail,
  ManagedSection,
} from "@/features/admin/managed-storefront";

export default async function HomePage() {
  const [content, merchandising] = await Promise.all([
    getHomeContent(),
    getHomeMerchandisingContent(),
  ]);

  return (
    <main>
      <ManagedSection section="hero">
        <HeroSection content={content.hero} />
      </ManagedSection>
      <ManagedBanners />
      <ManagedCategories categories={content.categories} />
      <ManagedProductRail
        section={merchandising.specialOffers}
        sectionKey="specialOffers"
        tone="accent"
      />
      {merchandising.productSections.map((section) => {
        const managedSection =
          section.id === "digital-picks" ? "digitalPicks" : "homePicks";
        return (
          <ManagedProductRail
            key={section.id}
            section={section}
            sectionKey={managedSection}
          />
        );
      })}
      <ManagedProductRail
        section={merchandising.trending}
        sectionKey="trending"
      />
      <ManagedSection section="brands">
        <BrandSection content={content.brands} />
      </ManagedSection>
      <ManagedSection section="trust">
        <TrustSection services={content.trustServices} />
      </ManagedSection>
    </main>
  );
}
