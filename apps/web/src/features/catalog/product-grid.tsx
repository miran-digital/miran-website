import { ProductCard } from "@miran/ui";
import type { CatalogProductSummary } from "./catalog-gateway";
import styles from "./discovery.module.css";

export function ProductGrid({
  products,
  emptyMessage = "محصولی پیدا نشد.",
}: {
  products: readonly CatalogProductSummary[];
  emptyMessage?: string;
}) {
  if (products.length === 0) {
    return (
      <div className={styles.empty} role="status">
        <h2>نتیجه‌ای وجود ندارد</h2>
        <p>{emptyMessage}</p>
        <a href="/categories">مرور دسته‌بندی‌ها</a>
      </div>
    );
  }

  return (
    <div className={styles.productGrid}>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          href={product.href}
          title={product.title}
          media={<span className={styles.media}>{product.mediaLabel}</span>}
          eyebrow={
            product.inStock
              ? product.brandName
              : `${product.brandName} · ناموجود`
          }
          price={product.price}
          {...(product.badge === undefined ? {} : { badge: product.badge })}
          {...(product.previousPrice === undefined
            ? {}
            : { previousPrice: product.previousPrice })}
        />
      ))}
    </div>
  );
}
