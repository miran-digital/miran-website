import { Container, ProductCard } from '@miran/ui';
import type { CSSProperties } from 'react';
import type { HomeProductRail } from './merchandising-content';

type ProductRailProps = {
  section: HomeProductRail;
  tone?: 'default' | 'accent';
};

const sectionStyle: CSSProperties = { paddingBlock: '2rem' };
const accentStyle: CSSProperties = { background: 'linear-gradient(180deg,#fff7ed 0%,#fff 100%)' };
const headingStyle: CSSProperties = { display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: '1rem', marginBlockEnd: '1.25rem' };
const productGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(14rem,1fr))', gap: '1rem' };
const mediaStyle: CSSProperties = { display: 'grid', width: '100%', height: '100%', placeItems: 'center', background: 'linear-gradient(135deg,#f8fafc,#e2e8f0)', color: '#475569', fontWeight: 800 };

export function ProductRail({ section, tone = 'default' }: ProductRailProps) {
  return (
    <section style={tone === 'accent' ? { ...sectionStyle, ...accentStyle } : sectionStyle} aria-labelledby={`${section.id}-title`}>
      <Container size="wide">
        <div style={headingStyle}>
          <div>
            <p className="foundation-kicker">Miran Shop</p>
            <h2 id={`${section.id}-title`}>{section.title}</h2>
            {section.description ? <p>{section.description}</p> : null}
          </div>
          <a href={section.href}>{section.linkLabel}</a>
        </div>

        <div style={productGridStyle}>
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
                media={<div style={mediaStyle} aria-hidden="true">{product.mediaLabel}</div>}
                {...optionalProps}
              />
            );
          })}
        </div>
      </Container>
    </section>
  );
}
