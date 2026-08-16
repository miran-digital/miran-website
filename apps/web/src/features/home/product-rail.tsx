import { Container, ProductCard } from "@miran/ui";
import type { HomeProductRail } from "./merchandising-content";
import { WishlistButton } from "@/features/wishlist/wishlist-button";
import styles from "./merchandising.module.css";

type ProductRailProps = {
  section: HomeProductRail;
  tone?: "default" | "accent";
};

export function ProductRail({ section, tone = "default" }: ProductRailProps) {
  const sectionClassName =
    `${styles.section} ${tone === "accent" ? styles.sectionAccent : ""}`.trim();

  return (
    <section
      className={sectionClassName}
      aria-labelledby={`${section.id}-title`}
    >
      <Container size="wide">
        <div className={styles.heading}>
          <div>
            <p className={styles.kicker}>Miran Shop</p>
            <h2 id={`${section.id}-title`}>{section.title}</h2>
            {section.description ? (
              <p className={styles.description}>{section.description}</p>
            ) : null}
          </div>
          <a className={styles.moreLink} href={section.href}>
            {section.linkLabel}
          </a>
        </div>

        <div className={styles.rail}>
          {section.products.map((product) => {
            const imageUrl = (product as typeof product & { imageUrl?: string }).imageUrl;
            const optionalProps = {
              ...(product.previousPrice
                ? { previousPrice: product.previousPrice }
                : {}),
              ...(product.eyebrow ? { eyebrow: product.eyebrow } : {}),
              ...(product.badge ? { badge: product.badge } : {}),
            };

            return (
              <div className={styles.item} key={product.id}>
                <ProductCard
                  href={product.href}
                  title={product.title}
                  action={
                    <WishlistButton
                      productId={product.id}
                      title={product.title}
                    />
                  }
                  price={product.price}
                  locale="fa-IR"
                  media={
                    <div className={styles.media}>
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span aria-hidden="true">{product.mediaLabel}</span>
                      )}
                    </div>
                  }
                  {...optionalProps}
                />
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
