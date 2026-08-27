import type { ReactNode } from "react";
import { Badge } from "./badge";
import { Card } from "./card";
import { OfferCountdown } from "./offer-countdown";
import { formatMoney, formatRialReference, normalizeLegacyPriceToRial } from "@/lib/money";

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
  offerEndsAt?: string;
  locale?: string;
  action?: ReactNode;
};

export function ProductCard({
  href,
  title,
  media,
  price,
  previousPrice,
  eyebrow,
  badge,
  offerEndsAt,
  locale = "fa-IR",
  action,
}: ProductCardProps) {
  const priceRial = normalizeLegacyPriceToRial(
    price.amountMinor,
    price.currency,
  );
  const previousPriceRial = previousPrice
    ? normalizeLegacyPriceToRial(
        previousPrice.amountMinor,
        previousPrice.currency,
      )
    : 0;
  const discountPercentage = previousPriceRial > priceRial
    ? Math.round(((previousPriceRial - priceRial) / previousPriceRial) * 100)
    : 0;
  return (
    <Card className="miran-product-card" padding="none">
      <div className="miran-product-card__shell">
        <a className="miran-product-card__link" href={href}>
          <div className="miran-product-card__media">{media}</div>
          <div className="miran-product-card__body">
            <div className="miran-product-card__meta">
              {eyebrow ? <span>{eyebrow}</span> : null}
              {badge ? <Badge tone="brand">{badge}</Badge> : null}
            </div>
            <h3 className="miran-product-card__title">{title}</h3>
            <div className="miran-product-card__price-row">
              <strong>{formatMoney(price.amountMinor, price.currency, locale)}</strong>
              {previousPrice ? (
                <del>{formatMoney(previousPrice.amountMinor, previousPrice.currency, locale)}</del>
              ) : null}
              {discountPercentage > 0 ? (
                <span className="miran-product-card__discount">
                  {discountPercentage.toLocaleString("fa-IR")}٪
                </span>
              ) : null}
            </div>
            <small className="miran-product-card__rial">
              معادل {formatRialReference(priceRial, locale)}
            </small>
            {offerEndsAt ? <OfferCountdown endsAt={offerEndsAt} /> : null}
          </div>
        </a>
        {action ? (
          <div className="miran-product-card__action">{action}</div>
        ) : null}
      </div>
    </Card>
  );
}
