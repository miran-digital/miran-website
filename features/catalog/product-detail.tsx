import { Badge, Container, ProductCard } from "@/components/ui";
import { AddToCartPanel } from "./add-to-cart-panel";
import type { CatalogProductDetail, CatalogProductSummary } from "./catalog-gateway";
import { ProductGallery } from "./product-gallery";
import { WishlistButton } from "@/features/wishlist/wishlist-button";
import styles from "./product-detail.module.css";
import { OfferCountdown } from "@/components/ui/offer-countdown";
import { formatCalendarDateTime } from "@/lib/jalali";
import type { ReactNode } from "react";

type ProductDetailProps = {
  product: CatalogProductDetail;
  relatedProducts: readonly CatalogProductSummary[];
};

function ratingLabel(product: CatalogProductDetail) {
  return product.ratingAverage === null || product.ratingAverage === undefined
    ? "بدون امتیاز"
    : product.ratingAverage.toLocaleString("fa-IR", { maximumFractionDigits: 1 });
}

function structuredContent(body: string) {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let index = 0;
  let key = 0;
  while (index < lines.length) {
    const raw = lines[index] ?? "";
    const line = raw.trim();
    if (!line) {
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      nodes.push(<h3 key={`h-${key++}`}>{heading[2]}</h3>);
      index += 1;
      continue;
    }
    if (/^[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = (lines[index] ?? "").trim().match(/^[-*•]\s+(.+)$/);
        if (!item) break;
        items.push(item[1] ?? "");
        index += 1;
      }
      nodes.push(<ul key={`ul-${key++}`}>{items.map((item) => <li key={item}>{item}</li>)}</ul>);
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = (lines[index] ?? "").trim().match(/^\d+[.)]\s+(.+)$/);
        if (!item) break;
        items.push(item[1] ?? "");
        index += 1;
      }
      nodes.push(<ol key={`ol-${key++}`}>{items.map((item) => <li key={item}>{item}</li>)}</ol>);
      continue;
    }
    const paragraph: string[] = [raw.trim()];
    index += 1;
    while (index < lines.length) {
      const nextRaw = lines[index] ?? "";
      const next = nextRaw.trim();
      if (!next || /^(#{1,3})\s+/.test(next) || /^[-*•]\s+/.test(next) || /^\d+[.)]\s+/.test(next)) break;
      paragraph.push(nextRaw.trim());
      index += 1;
    }
    nodes.push(<p key={`p-${key++}`}>{paragraph.join("\n")}</p>);
  }
  return nodes;
}

export function ProductDetail({ product, relatedProducts }: ProductDetailProps) {
  const englishTitle = product.englishTitle?.trim() ? product.englishTitle : null;
  const roundedRating = Math.max(0, Math.min(5, Math.round(product.ratingAverage ?? 0)));
  const purchasable =
    product.inStock ||
    product.variants.some((variant) => variant.availableQuantity > 0) ||
    product.sellerOffers.some((offer) => offer.availableQuantity > 0);
  const contentSections = product.contentSections.filter((section) => section.body.trim());
  const specificationGroups = product.specificationGroups.filter((group) => group.items.length > 0);

  return (
    <main className={styles.page}>
      <Container size="wide">
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <a href="/">خانه</a>
          <span aria-hidden="true">/</span>
          <a href={`/category/${product.primaryCategory.slug}`}>{product.primaryCategory.name}</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{product.title}</span>
        </nav>

        <div className={styles.productLayout}>
          <ProductGallery items={product.media} mediaLabel={product.mediaLabel} />

          <section className={styles.summary} aria-labelledby="product-title">
            <div className={styles.meta}>
              <a className={styles.brandLink} href={`/brand/${encodeURIComponent(product.brandId)}`}>
                {product.brandName}
              </a>
              <span className={styles.metaActions}>
                {product.badge ? <Badge tone="brand">{product.badge}</Badge> : null}
                <WishlistButton productId={product.id} title={product.title} />
              </span>
            </div>

            <h1 id="product-title">{product.title}</h1>
            {englishTitle ? (
              <p className={styles.englishTitle} dir="ltr" lang="en">{product.englishTitle}</p>
            ) : null}

            <div className={styles.engagementRow} aria-label="امتیاز و تعامل محصول">
              <span className={styles.ratingStars} aria-hidden="true">
                {"★".repeat(roundedRating)}{"☆".repeat(5 - roundedRating)}
              </span>
              <strong>{ratingLabel(product)}</strong>
              <a href="#reviews">{product.reviewCount.toLocaleString("fa-IR")} دیدگاه</a>
              <span>{product.questionCount.toLocaleString("fa-IR")} پرسش</span>
            </div>

            <div className={styles.productFacts}>
              <span>کد کالا: <bdi>{product.sku || product.id}</bdi></span>
              <span data-in-stock={purchasable}>{purchasable ? "موجود و آماده ارسال" : "در حال حاضر ناموجود"}</span>
            </div>

            {product.shortDescription ? <p className={styles.description}>{product.shortDescription}</p> : null}

            {product.offerEndsAt ? (
              <div className={styles.offerSchedule}>
                <OfferCountdown endsAt={product.offerEndsAt} />
                <small>پایان پیشنهاد: {formatCalendarDateTime(product.offerEndsAt, product.calendarMode)}</small>
              </div>
            ) : null}

            <AddToCartPanel product={product} />

            {product.highlights.length > 0 ? (
              <section className={styles.keyFeatures} aria-labelledby="key-features-heading">
                <h2 id="key-features-heading">ویژگی‌های برجسته</h2>
                <ul className={styles.highlights}>
                  {product.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
                </ul>
              </section>
            ) : null}
          </section>
        </div>

        <nav className={styles.sectionNav} aria-label="بخش‌های صفحه محصول">
          {contentSections.length > 0 ? <a href="#product-content">توضیحات</a> : null}
          {specificationGroups.length > 0 ? <a href="#product-specs">مشخصات</a> : null}
          <a href="#reviews">دیدگاه‌ها</a>
        </nav>

        {contentSections.length > 0 || specificationGroups.length > 0 ? (
          <section className={styles.details} aria-label="اطلاعات محصول">
            {contentSections.length > 0 ? (
              <div className={styles.contentSections} id="product-content">
                {contentSections.map((section) => (
                  <article key={section.id} className={styles.descriptionCard}>
                    {section.title ? <h2>{section.title}</h2> : null}
                    <div className={styles.richProductText}>{structuredContent(section.body)}</div>
                  </article>
                ))}
              </div>
            ) : null}
            {specificationGroups.length > 0 ? (
              <div className={styles.specificationGroups} id="product-specs">
                {specificationGroups.map((group, groupIndex) => (
                  <section key={`${group.title}-${groupIndex}`} className={styles.specificationCard}>
                    {group.title ? <h2>{group.title}</h2> : null}
                    <dl className={styles.specifications}>
                      {group.items.map((item) => (
                        <div key={`${item.label}-${item.value}`}>
                          <dt>{item.label}</dt>
                          <dd>{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {relatedProducts.length > 0 ? (
          <section className={styles.related} aria-labelledby="related-heading">
            <div className={styles.relatedHeader}>
              <div>
                <p>پیشنهادهای مشابه</p>
                <h2 id="related-heading">محصولات مرتبط</h2>
              </div>
              <a href={`/category/${product.primaryCategory.slug}`}>مشاهده همه</a>
            </div>
            <div className={styles.relatedGrid}>
              {relatedProducts.map((item) => (
                <ProductCard
                  key={item.id}
                  href={item.href}
                  title={item.title}
                  action={<WishlistButton productId={item.id} title={item.title} />}
                  media={item.imageUrl ? (
                    <img src={item.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <span className={styles.relatedMedia}>{item.mediaLabel}</span>
                  )}
                  eyebrow={item.inStock ? item.brandName : `${item.brandName} · ناموجود`}
                  price={item.price}
                  {...(item.badge === undefined ? {} : { badge: item.badge })}
                  {...(item.previousPrice === undefined ? {} : { previousPrice: item.previousPrice })}
                  {...(item.offerEndsAt === undefined ? {} : { offerEndsAt: item.offerEndsAt })}
                />
              ))}
            </div>
          </section>
        ) : null}
      </Container>
    </main>
  );
}
