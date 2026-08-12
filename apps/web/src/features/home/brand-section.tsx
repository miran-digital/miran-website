import { Container } from '@miran/ui';
import type { HomeBrandSection } from './home-content';
import styles from './home.module.css';

export function BrandSection({ content }: { content: HomeBrandSection }) {
  return (
    <section className={styles.brands} aria-labelledby="home-brands-title">
      <Container size="wide">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionKicker}>برندها</p>
            <h2 id="home-brands-title">{content.title}</h2>
            {content.description ? (
              <p className={styles.sectionDescription}>{content.description}</p>
            ) : null}
          </div>
          <a href={content.href}>{content.linkLabel}</a>
        </div>
        <div className={styles.brandGrid}>
          {content.items.map((brand) => (
            <a
              key={brand.id}
              className={styles.brandCard}
              href={brand.href}
              aria-label={`مشاهده محصولات ${brand.name}`}
            >
              {brand.logoUrl ? (
                <img src={brand.logoUrl} alt={brand.name} loading="lazy" />
              ) : (
                <span dir="ltr">{brand.name}</span>
              )}
            </a>
          ))}
        </div>
      </Container>
    </section>
  );
}
