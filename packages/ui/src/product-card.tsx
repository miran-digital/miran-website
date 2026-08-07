import type { ReactNode } from 'react';
import { Badge } from './badge';
import { Card } from './card';

export type Money = {
  amountMinor: number;
  currency: string;
};

type ProductCardProps = {
  href: string;
  title: string;
  media: ReactNode;
  price: Money;
  previousPrice?: Money;
  eyebrow?: string;
  badge?: string;
  locale?: string;
};

function formatMoney(money: Money, locale: string) {
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency });
  const minorDigits = formatter.resolvedOptions().maximumFractionDigits ?? 0;
  return formatter.format(money.amountMinor / 10 ** minorDigits);
}

export function ProductCard({ href, title, media, price, previousPrice, eyebrow, badge, locale = 'fa-IR' }: ProductCardProps) {
  return (
    <Card className="miran-product-card" padding="none">
      <a className="miran-product-card__link" href={href}>
        <div className="miran-product-card__media">{media}</div>
        <div className="miran-product-card__body">
          <div className="miran-product-card__meta">
            {eyebrow ? <span>{eyebrow}</span> : null}
            {badge ? <Badge tone="brand">{badge}</Badge> : null}
          </div>
          <h3 className="miran-product-card__title">{title}</h3>
          <div className="miran-product-card__price-row">
            <strong>{formatMoney(price, locale)}</strong>
            {previousPrice ? <del>{formatMoney(previousPrice, locale)}</del> : null}
          </div>
        </div>
      </a>
    </Card>
  );
}
