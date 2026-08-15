import type { Metadata } from "next";
import { Container } from "@miran/ui";
import { ProductGrid } from "@/features/catalog/product-grid";
import { searchRealCatalogProducts } from "@/features/catalog/real-search-data";
import styles from "@/features/catalog/discovery.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: string | undefined) {
  const page = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function buildSearchHref(query: string, page: number) {
  const params = new URLSearchParams({ q: query });
  if (page > 1) params.set("page", String(page));
  return `/search?${params.toString()}`;
}

export const metadata: Metadata = {
  title: "جست‌وجوی محصولات",
  description: "جست‌وجو در محصولات Miran Shop.",
  robots: { index: false, follow: true },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const query = (firstValue(raw.q) ?? "").trim().slice(0, 100);
  const result = await searchRealCatalogProducts({
    query,
    page: parsePage(firstValue(raw.page)),
    pageSize: 12,
  });

  return (
    <main className={styles.page}>
      <Container size="wide">
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <a href="/">خانه</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">جست‌وجو</span>
        </nav>
        <header className={styles.header}>
          <p>پیدا کردن کالا</p>
          <h1>{query ? `نتایج «${query}»` : "جست‌وجوی محصولات"}</h1>
          <p>
            {query
              ? `${result.totalProducts.toLocaleString("fa-IR")} محصول واقعی پیدا شد.`
              : "نام کالا یا برند را وارد کنید."}
          </p>
        </header>
        <form className={styles.searchForm} action="/search" method="get">
          <label className="sr-only" htmlFor="catalog-search-query">
            عبارت جست‌وجو
          </label>
          <input
            id="catalog-search-query"
            name="q"
            type="search"
            defaultValue={query}
            maxLength={100}
            placeholder="مثلاً موبایل یا نام برند"
          />
          <button type="submit">جست‌وجو</button>
        </form>
        {query ? (
          <>
            <ProductGrid
              products={result.products}
              emptyMessage="عبارت دیگری امتحان کنید یا دسته‌بندی‌ها را مرور کنید."
            />
            {result.totalPages > 1 ? (
              <nav className={styles.pagination} aria-label="صفحه‌بندی جست‌وجو">
                {result.page > 1 ? (
                  <a href={buildSearchHref(query, result.page - 1)}>صفحه قبل</a>
                ) : null}
                <span>
                  صفحه {result.page.toLocaleString("fa-IR")} از{" "}
                  {result.totalPages.toLocaleString("fa-IR")}
                </span>
                {result.page < result.totalPages ? (
                  <a href={buildSearchHref(query, result.page + 1)}>صفحه بعد</a>
                ) : null}
              </nav>
            ) : null}
          </>
        ) : null}
      </Container>
    </main>
  );
}
