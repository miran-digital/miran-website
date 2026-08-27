import { Container } from '@/components/ui';
import type { TrustService } from './home-content';
import styles from './home.module.css';

export function TrustSection({
  services
}: {
  services: readonly TrustService[];
}) {
  return (
    <section className={styles.trust} aria-labelledby="home-trust-title">
      <Container size="wide">
        <div className={styles.trustHeading}>
          <p className={styles.sectionKicker}>خرید با اطمینان</p>
          <h2 id="home-trust-title">
            خدماتی که تجربه خرید را قابل اعتماد می‌کنند
          </h2>
        </div>
        <div className={styles.trustGrid}>
          {services.map((service) => (
            <article className={styles.trustItem} key={service.id}>
              <span className={styles.trustSymbol} aria-hidden="true">
                {service.symbol}
              </span>
              <div>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}

