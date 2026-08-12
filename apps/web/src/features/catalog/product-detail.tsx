import { Badge, Container, ProductCard } from "@miran/ui";
import { AddToCartPanel } from "./add-to-cart-panel";
import type {
  CatalogMoney,
  CatalogProductDetail,
  CatalogProductSummary,
} from "./catalog-gateway";
import { ProductGallery } from "./product-gallery";
import { WishlistButton } from "@/features/wishlist/wishlist-button";
import styles from "./product-detail.module.css";

type ProductDetailProps = {
  product: CatalogProductDetail;
  relatedProducts: readonly CatalogProductSummary[];
};

function formatMoney(money: CatalogMoney) {
  const formatter = new Intl.NumberFormat("fa-IR", {
    style: "currency",
    currency: money.currency,
  });
  const minorDigits = formatter.resolvedOptions().maximumFractionDigits ?? 0;
  return formatter.format(money.amountMinor / 10 ** minorDigits);
}

function getDiscountPercentage(product: CatalogProductDetail) {
  if (!product.previousPrice || product.previousPrice.amountMinor <= 0)
    return 0;
  return Math.round(
    ((product.previousPrice.amountMinor - product.price.amountMinor) /
      product.previousPrice.amountMinor) *
      100,
  );
}

export function ProductDetail({
  product,
  relatedProducts,
}: ProductDetailProps) {
  const discount = getDiscountPercentage(product);

  return (
    <main className={styles.page}>
      <Container size="wide">
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <a href="/">خانه</a>
          <span aria-hidden="true">/</span>
          <a href={`/category/${product.primaryCategory.slug}`}>
            {product.primaryCategory.name}
          </a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{product.title}</span>
        </nav>

        <div className={styles.productLayout}>
          <ProductGallery
            items={product.media}
            mediaLabel={product.mediaLabel}
          />

          <section className={styles.summary} aria-labelledby="product-title">
            <div className={styles.meta}>
              <span>{product.brandName}</span>
              <span className={styles.metaActions}>
                {product.badge ? (
                  <Badge tone="brand">{product.badge}</Badge>
                ) : null}
                <WishlistButton productId={product.id} title={product.title} />
              </span>
            </div>
            <h1 id="product-title">{product.title}</h1>
            <p className={styles.description}>{product.description}</p>

            <div
              className={styles.availability}
              data-in-stock={product.inStock}
            >
              {product.inStock ? "موجود و آماده ارسال" : "در حال حاضر ناموجود"}
            </div>

            <div className={styles.priceBlock}>
              <strong>{formatMoney(product.price)}</strong>
              {product.previousPrice ? (
                <>
                  <del>{formatMoney(product.previousPrice)}</del>
                  <span>{discount.toLocaleString("fa-IR")}٪ تخفیف</span>
                </>
              ) : null}
            </div>

            <AddToCartPanel product={product} />

            <ul className={styles.highlights}>
              {product.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          </section>
        </div>

        <section className={styles.details} aria-labelledby="details-heading">
          <div>
            <p>معرفی محصول</p>
            <h2 id="details-heading">جزئیات و مشخصات</h2>
            <p>{product.description}</p>
          </div>
          <dl className={styles.specifications}>
            {product.specifications.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {relatedProducts.length > 0 ? (
          <section className={styles.related} aria-labelledby="related-heading">
            <div className={styles.relatedHeader}>
              <div>
                <p>پیشنهادهای مشابه</p>
                <h2 id="related-heading">محصولات مرتبط</h2>
              </div>
              <a href={`/category/${product.primaryCategory.slug}`}>
                مشاهده همه
              </a>
            </div>
            <div className={styles.relatedGrid}>
              {relatedProducts.map((item) => (
                <ProductCard
                  key={item.id}
                  href={item.href}
                  title={item.title}
                  action={
                    <WishlistButton productId={item.id} title={item.title} />
                  }
                  media={
                    <span className={styles.relatedMedia}>
                      {item.mediaLabel}
                    </span>
                  }
                  eyebrow={
                    item.inStock
                      ? item.brandName
                      : `${item.brandName} · ناموجود`
                  }
                  price={item.price}
                  {...(item.badge === undefined ? {} : { badge: item.badge })}
                  {...(item.previousPrice === undefined
                    ? {}
                    : { previousPrice: item.previousPrice })}
                />
              ))}
            </div>
          </section>
        ) : null}
      </Container>
    </main>
  );
}
