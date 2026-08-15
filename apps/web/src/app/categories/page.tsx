import type { Metadata } from "next";
import { Container } from "@miran/ui";
import { getRealCatalogCategories } from "@/features/catalog/real-catalog-data";
import styles from "@/features/catalog/discovery.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "دسته‌بندی‌ها",
  description: "مرور تمام دسته‌بندی‌های محصولات Miran Shop.",
  alternates: { canonical: "/categories" },
};

export default async function CategoriesPage() {
  const categories = await getRealCatalogCategories();
  return (
    <main className={styles.page}>
      <Container size="wide">
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <a href="/">خانه</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">دسته‌بندی‌ها</span>
        </nav>
        <header className={styles.header}>
          <p>کشف محصولات</p>
          <h1>همه دسته‌بندی‌ها</h1>
          <p>دسته‌هایی که مدیر منتشر کرده است مستقیماً از Database نمایش داده می‌شوند.</p>
        </header>
        <div className={styles.categoryGrid}>
          {categories.map((category) => (
            <a
              key={category.slug}
              className={styles.categoryCard}
              href={`/category/${encodeURIComponent(category.slug)}`}
            >
              <h2>{category.name}</h2>
              <p>{category.description || "مشاهده محصولات این دسته"}</p>
            </a>
          ))}
        </div>
      </Container>
    </main>
  );
}
