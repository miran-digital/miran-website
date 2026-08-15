import { BrandSection } from "@/features/home/brand-section";
import { CategorySection } from "@/features/home/category-section";
import { DatabaseBanners } from "@/features/home/database-banners";
import { getHomeContent } from "@/features/home/home-content";
import { HeroSection } from "@/features/home/hero-section";
import { ProductRail } from "@/features/home/product-rail";
import {
  getRealHomeCategories,
  getRealHomeRails,
} from "@/features/home/real-home-data";
import { TrustSection } from "@/features/home/trust-section";
import { getStorefrontCms, sectionVisible } from "@/lib/storefront/cms";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [content, categories, rails, cms] = await Promise.all([
    getHomeContent(),
    getRealHomeCategories(),
    getRealHomeRails(),
    getStorefrontCms(),
  ]);

  return (
    <main>
      {sectionVisible(cms, "hero") ? <HeroSection content={content.hero} /> : null}
      {sectionVisible(cms, "banners") ? <DatabaseBanners banners={cms.banners} /> : null}
      {sectionVisible(cms, "categories") ? <CategorySection categories={categories} /> : null}
      {rails.map((section, index) => {
        const isAmazing = section.id === "database-amazing";
        const key = isAmazing ? "specialOffers" : "products";
        if (!sectionVisible(cms, key)) return null;
        return (
          <ProductRail
            key={section.id}
            section={section}
            tone={index === 0 && isAmazing ? "accent" : "default"}
          />
        );
      })}
      {sectionVisible(cms, "brands") ? <BrandSection content={content.brands} /> : null}
      {sectionVisible(cms, "trust") ? <TrustSection services={content.trustServices} /> : null}
    </main>
  );
}
