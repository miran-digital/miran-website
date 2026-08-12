import type { Metadata } from "next";
import { Container } from "@miran/ui";
import { getCatalogBrands } from "@/features/catalog/catalog-data";
import styles from "@/features/catalog/discovery.module.css";

export const metadata: Metadata = {
  title: "برندها",
  description: "مشاهده برندهای موجود در Miran Shop.",
  alternates: { canonical: "/brands" },
};

export default async function BrandsPage() {
  const brands = await getCatalogBrands();
  return (
    <main className={styles.page}>
      <Container size="wide">
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <a href="/">خانه</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">برندها</span>
        </nav>
        <header className={styles.header}>
          <p>انتخاب بر اساس سازنده</p>
          <h1>همه برندها</h1>
          <p>محصولات را بر اساس برند مورد نظر خود مرور کنید.</p>
        </header>
        <div className={styles.brandGrid}>
          {brands.map((brand) => (
            <a
              key={brand.id}
              className={styles.brandCard}
              href={`/brand/${brand.id}`}
            >
              <h2 dir="ltr">{brand.name}</h2>
              <p>{brand.productCount.toLocaleString("fa-IR")} کالا</p>
            </a>
          ))}
        </div>
      </Container>
    </main>
  );
}
