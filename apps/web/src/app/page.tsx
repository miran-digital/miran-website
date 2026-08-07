import { CategorySection } from '@/features/home/category-section';
import { getHomeContent } from '@/features/home/home-content';
import { HeroSection } from '@/features/home/hero-section';

export default async function HomePage() {
  const content = await getHomeContent();

  return (
    <main>
      <HeroSection content={content.hero} />
      <CategorySection categories={content.categories} />
    </main>
  );
}
