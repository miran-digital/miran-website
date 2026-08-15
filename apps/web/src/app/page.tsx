import { BrandSection } from "@/features/home/brand-section";
import { CategorySection } from "@/features/home/category-section";
import { getHomeContent } from "@/features/home/home-content";
import { HeroSection } from "@/features/home/hero-section";
import { ProductRail } from "@/features/home/product-rail";
import {
  getRealHomeCategories,
  getRealHomeRails,
} from "@/features/home/real-home-data";
import { TrustSection } from "@/features/home/trust-section";
import {
  ManagedBanners,
  ManagedSection,
} from "@/features/admin/managed-storefront";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [content, categories, rails] = await Promise.all([
    getHomeContent(),
    getRealHomeCategories(),
    getRealHomeRails(),
  ]);

  return (
    <main>
      <ManagedSection section="hero">
        <HeroSection content={content.hero} />
      </ManagedSection>
      <ManagedBanners />
      <CategorySection categories={categories} />
      {rails.map((section, index) => (
        <ProductRail
          key={section.id}
          section={section}
          tone={index === 0 && section.id === "database-amazing" ? "accent" : "default"}
        />
      ))}
      <ManagedSection section="brands">
        <BrandSection content={content.brands} />
      </ManagedSection>
      <ManagedSection section="trust">
        <TrustSection services={content.trustServices} />
      </ManagedSection>
    </main>
  );
}
