import { Container } from "@/components/ui";
import { OfferCountdown } from "@/components/ui/offer-countdown";
import {
  formatMoney,
  formatRialReference,
  normalizeLegacyPriceToRial,
} from "@/lib/money";
import styles from "./amazing-offers.module.css";

export type AmazingDisplayProduct = {
  id: string;
  title: string;
  href: string;
  mediaLabel: string;
  imageUrl?: string;
  eyebrow?: string;
  price: { amountMinor: number; currency: string };
  previousPrice?: { amountMinor: number; currency: string };
  offerEndsAt?: string;
  inStock?: boolean;
};

function getDiscountPercent(product: AmazingDisplayProduct) {
  const previous = product.previousPrice;
  if (
    !previous ||
    previous.currency !== product.price.currency ||
    previous.amountMinor <= product.price.amountMinor ||
    previous.amountMinor <= 0
  ) {
    return 0;
  }
  return Math.round(
    ((previous.amountMinor - product.price.amountMinor) /
      previous.amountMinor) *
      100,
  );
}

export function AmazingProductCard({
  product,
  showTimer = true,
}: {
  product: AmazingDisplayProduct;
  showTimer?: boolean;
}) {
  const discount = getDiscountPercent(product);
  const priceRial = normalizeLegacyPriceToRial(
    product.price.amountMinor,
    product.price.currency,
  );
  return (
    <article className={styles.productCard}>
      <a href={product.href} aria-label={product.title}>
        <span className={styles.amazingLabel}>پیشنهاد شگفت‌انگیز</span>
        <span className={styles.productMedia}>
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.title} loading="lazy" />
          ) : (
            <b>{product.mediaLabel}</b>
          )}
        </span>
        {product.eyebrow ? (
          <small className={styles.eyebrow}>{product.eyebrow}</small>
        ) : null}
        <h3>{product.title}</h3>
        {product.inStock === false ? (
          <span className={styles.outOfStock}>ناموجود</span>
        ) : null}
        <span className={styles.priceRow}>
          {discount > 0 ? (
            <b className={styles.discount}>
              ٪{discount.toLocaleString("fa-IR")}
            </b>
          ) : null}
          <strong>
            {formatMoney(product.price.amountMinor, product.price.currency)}
          </strong>
        </span>
        {product.previousPrice ? (
          <del>
            {formatMoney(
              product.previousPrice.amountMinor,
              product.previousPrice.currency,
            )}
          </del>
        ) : null}
        <small className={styles.rialReference}>
          معادل {formatRialReference(priceRial)}
        </small>
        {showTimer && product.offerEndsAt ? (
          <OfferCountdown endsAt={product.offerEndsAt} />
        ) : null}
      </a>
    </article>
  );
}

export function AmazingOffersRail({
  title,
  subtitle,
  href,
  linkLabel,
  backgroundColor,
  textColor,
  products,
  endsAt,
  showTimer = true,
}: {
  title: string;
  subtitle: string;
  href: string;
  linkLabel: string;
  backgroundColor: string;
  textColor: string;
  products: readonly AmazingDisplayProduct[];
  endsAt?: string;
  showTimer?: boolean;
}) {
  if (products.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby="amazing-home-title">
      <Container size="wide">
        <div
          className={styles.offerShell}
          style={{ backgroundColor, color: textColor }}
        >
          <aside className={styles.intro}>
            <span className={styles.percentMark} aria-hidden="true">
              ٪
            </span>
            <h2 id="amazing-home-title">{title}</h2>
            <p>{subtitle}</p>
            {showTimer && endsAt ? <OfferCountdown endsAt={endsAt} /> : null}
            <a href={href}>{linkLabel} ←</a>
          </aside>
          <div className={styles.rail}>
            {products.map((product) => (
              <AmazingProductCard
                key={product.id}
                product={product}
                showTimer={showTimer}
              />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
