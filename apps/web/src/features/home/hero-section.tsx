import { Container } from '@miran/ui';
import type { HeroContent } from './home-content';
import styles from './home.module.css';

type HeroSectionProps = {
  content: HeroContent;
};

export function HeroSection({ content }: HeroSectionProps) {
  return (
    <section className={styles.hero} aria-labelledby="home-hero-title">
      <Container size="wide" className={styles.heroGrid}>
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>{content.eyebrow}</p>
          <h1 id="home-hero-title" className={styles.heroTitle}>{content.title}</h1>
          <p className={styles.heroDescription}>{content.description}</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href={content.primaryAction.href}>{content.primaryAction.label}</a>
            {content.secondaryAction ? (
              <a className={styles.secondaryAction} href={content.secondaryAction.href}>{content.secondaryAction.label}</a>
            ) : null}
          </div>
        </div>
        <div className={styles.heroMedia} aria-label={content.mediaLabel}>
          <div className={styles.heroMediaSurface} aria-hidden="true">
            <span>MIRAN</span>
            <strong>Marketplace</strong>
          </div>
          <p className={styles.heroMediaCaption}>{content.mediaLabel}</p>
        </div>
      </Container>
    </section>
  );
}
