import { Container } from "@/components/ui";
import type { CatalogProductSummary } from "./catalog-gateway";
import { ProductGrid } from "./product-grid";
import styles from "./discovery.module.css";

export function CollectionPage({
  eyebrow,
  title,
  description,
  products,
}: {
  eyebrow: string;
  title: string;
  description: string;
  products: readonly CatalogProductSummary[];
}) {
  return (
    <main className={styles.page}>
      <Container size="wide">
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <a href="/">خانه</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{title}</span>
        </nav>
        <header className={styles.header}>
          <p>{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
          <small>{products.length.toLocaleString("fa-IR")} کالا</small>
        </header>
        <ProductGrid products={products} />
      </Container>
    </main>
  );
}
