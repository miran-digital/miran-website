import { Container } from '@miran/ui';
import type { HomeCategory } from './home-content';
import styles from './home.module.css';

type CategorySectionProps = {
  categories: readonly HomeCategory[];
};

export function CategorySection({ categories }: CategorySectionProps) {
  return (
    <section id="categories" className={styles.categories} aria-labelledby="home-categories-title">
      <Container size="wide">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionKicker}>دسته‌بندی‌های اصلی</p>
            <h2 id="home-categories-title">سریع‌تر به چیزی که می‌خواهید برسید</h2>
          </div>
          <a href="/categories">مشاهده همه دسته‌بندی‌ها</a>
        </div>
        <div className={styles.categoryGrid}>
          {categories.map((category) => (
            <a key={category.id} className={styles.categoryCard} href={category.href}>
              <div className={styles.categoryMedia} aria-hidden="true">
                {category.imageUrl ? <img src={category.imageUrl} alt="" loading="lazy" /> : <span>{category.name.slice(0, 1)}</span>}
              </div>
              <div>
                <h3>{category.name}</h3>
                {category.itemCountLabel ? <p>{category.itemCountLabel}</p> : null}
              </div>
            </a>
          ))}
        </div>
      </Container>
    </section>
  );
}
