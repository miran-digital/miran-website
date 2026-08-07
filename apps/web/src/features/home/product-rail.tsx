import { Container, ProductCard } from '@miran/ui';
import type { HomeProductRail } from './merchandising-content';
import styles from './merchandising.module.css';
import gridStyles from './merchandising-grid.module.css';

type ProductRailProps = {
  section: HomeProductRail;
  tone?: 'default' | 'accent';
};

export function ProductRail({ section, tone = 'default' }: ProductRailProps) {
  return (
    <section className={`${styles.section} ${tone === 'accent' ? styles.sectionAccent : ''}`} aria-labelledby={`${section.id}-title`}>
      <Container size="wide">
        <div className={styles.heading}>
          <div>
            <p className={styles.kicker}>Miran Shop</p>
            <h2 id={`${section.id}-title`}>{section.title}</h2>
            {section.description ? <p className={styles.description}>{section.description}</p> : null}
          </div>
          <a className={styles.moreLink} href={section.href}>{section.linkLabel}</a>
        </div>

        <div className={gridStyles.productGrid}>
          {section.products.map((product) => {
            const optionalProps = {
              ...(product.previousPrice ? { previousPrice: product.previousPrice } : {}),
              ...(product.eyebrow ? { eyebrow: product.eyebrow } : {}),
              ...(product.badge ? { badge: product.badge } : {})
            };

            return (
              <ProductCard
                key={product.id}
                href={product.href}
                title={product.title}
                price={product.price}
                locale="en-GB"
                media={<div className={gridStyles.productMedia} aria-hidden="true">{product.mediaLabel}</div>}
                {...optionalProps}
              />
            );
          })}
        </div>
      </Container>
    </section>
  );
}
