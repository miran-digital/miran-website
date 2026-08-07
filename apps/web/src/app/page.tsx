import { CategorySection } from '@/features/home/category-section';
import { getHomeContent } from '@/features/home/home-content';
import { HeroSection } from '@/features/home/hero-section';
import { getHomeMerchandisingContent } from '@/features/home/merchandising-content';
import { ProductRail } from '@/features/home/product-rail';
import { SpecialOffersSection } from '@/features/home/special-offers-section';

export default async function HomePage() {
  const [content, merchandising] = await Promise.all([
    getHomeContent(),
    getHomeMerchandisingContent()
  ]);

  return (
    <main>
      <HeroSection content={content.hero} />
      <CategorySection categories={content.categories} />
      <SpecialOffersSection section={merchandising.specialOffers} />
      {merchandising.productSections.map((section) => (
        <ProductRail key={section.id} section={section} />
      ))}
      <ProductRail section={merchandising.trending} />
    </main>
  );
}
