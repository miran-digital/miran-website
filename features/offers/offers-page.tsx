import { Container } from "@/components/ui";
import type {
  CatalogCategory,
  CatalogProductSummary,
} from "@/features/catalog/catalog-gateway";
import {
  AmazingProductCard,
  type AmazingDisplayProduct,
} from "./amazing-offers";
import styles from "./offers-page.module.css";

export type OffersSearchParams = Record<
  string,
  string | string[] | undefined
>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function toDisplayProduct(
  product: CatalogProductSummary,
): AmazingDisplayProduct {
  return {
    id: product.id,
    title: product.title,
    href: product.href,
    mediaLabel: product.mediaLabel,
    ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
    eyebrow: product.brandName,
    price: product.price,
    ...(product.previousPrice ? { previousPrice: product.previousPrice } : {}),
    ...(product.offerEndsAt ? { offerEndsAt: product.offerEndsAt } : {}),
    inStock: product.inStock,
  };
}

function discountPercent(product: CatalogProductSummary) {
  if (
    !product.previousPrice ||
    product.previousPrice.currency !== product.price.currency ||
    product.previousPrice.amountMinor <= product.price.amountMinor
  ) {
    return 0;
  }
  return (
    (product.previousPrice.amountMinor - product.price.amountMinor) /
    product.previousPrice.amountMinor
  );
}

function buildCategoryHref(slug: string | undefined) {
  return slug ? `/offers?category=${encodeURIComponent(slug)}` : "/offers";
}

export function OffersLandingPage({
  products,
  categories,
  searchParams,
}: {
  products: readonly CatalogProductSummary[];
  categories: readonly CatalogCategory[];
  searchParams: OffersSearchParams;
}) {
  const requestedCategory = first(searchParams.category) ?? "";
  const inStockOnly = first(searchParams.inStock) === "1";
  const requestedSort = first(searchParams.sort);
  const sort =
    requestedSort === "discount" ||
    requestedSort === "ending" ||
    requestedSort === "price-asc"
      ? requestedSort
      : "recommended";
  const offerCategories = categories.filter((category) => !category.parentSlug);
  const activeCategory = offerCategories.some(
    (category) => category.slug === requestedCategory,
  )
    ? requestedCategory
    : "";
  const activeCategoryDetails = offerCategories.find(
    (category) => category.slug === activeCategory,
  );
  const categoryProducts = products.filter(
    (product) =>
      !activeCategory || product.categorySlugs.includes(activeCategory),
  );
  const filteredProducts = products.filter(
    (product) =>
      (!activeCategory || product.categorySlugs.includes(activeCategory)) &&
      (!inStockOnly || product.inStock),
  );
  const sortedProducts = [...filteredProducts].sort((left, right) => {
    if (sort === "discount") {
      return discountPercent(right) - discountPercent(left);
    }
    if (sort === "ending") {
      const leftEnd = left.offerEndsAt
        ? Date.parse(left.offerEndsAt)
        : Number.MAX_SAFE_INTEGER;
      const rightEnd = right.offerEndsAt
        ? Date.parse(right.offerEndsAt)
        : Number.MAX_SAFE_INTEGER;
      return leftEnd - rightEnd;
    }
    if (
      sort === "price-asc" &&
      new Set(filteredProducts.map((product) => product.price.currency)).size ===
        1
    ) {
      return left.price.amountMinor - right.price.amountMinor;
    }
    return left.featuredRank - right.featuredRank;
  });
  const dailyProducts = categoryProducts.slice(0, 3).map(toDisplayProduct);
  const endingProducts = [...categoryProducts]
    .filter((product) => product.offerEndsAt && product.inStock)
    .sort(
      (left, right) =>
        Date.parse(left.offerEndsAt ?? "") -
        Date.parse(right.offerEndsAt ?? ""),
    )
    .slice(0, 8)
    .map(toDisplayProduct);
  const priceSortAllowed =
    new Set(filteredProducts.map((product) => product.price.currency)).size <= 1;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <Container size="wide">
          <nav aria-label="مسیر صفحه">
            <a href="/">خانه</a>
            <span>/</span>
            <span aria-current="page">شگفت‌انگیزها</span>
          </nav>
          <div>
            <span className={styles.heroMark} aria-hidden="true">
              ٪
            </span>
            <div>
              <p>فرصت‌های محدود Miran Shop</p>
              <h1>
                پیشنهاد شگفت‌انگیز
                {activeCategoryDetails ? ` ${activeCategoryDetails.name}` : ""}
              </h1>
              <p>
                قیمت‌های زمان‌دار، موجودی واقعی و شمارش معکوس مستقل برای هر
                محصول.
              </p>
            </div>
          </div>
        </Container>
      </section>

      <Container size="wide" className={styles.content}>
        {dailyProducts.length > 0 ? (
          <section className={styles.daily} aria-labelledby="daily-title">
            <header>
              <div>
                <span>امروز</span>
                <h2 id="daily-title">شگفت‌انگیز روز</h2>
              </div>
              <p>منتخب‌های اصلی با پایان خودکار تخفیف</p>
            </header>
            <div className={styles.dailyGrid}>
              {dailyProducts.map((product) => (
                <AmazingProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        ) : null}

        <nav className={styles.categoryRail} aria-label="دسته‌های شگفت‌انگیز">
          <a
            href={buildCategoryHref(undefined)}
            aria-current={!activeCategory ? "page" : undefined}
          >
            <span>همه</span>
            <b>همه دسته‌ها</b>
          </a>
          {offerCategories.map((category) => (
            <a
              key={category.slug}
              href={buildCategoryHref(category.slug)}
              aria-current={
                activeCategory === category.slug ? "page" : undefined
              }
            >
              <span>{category.name.slice(0, 1)}</span>
              <b>{category.name}</b>
            </a>
          ))}
        </nav>

        {endingProducts.length > 0 ? (
          <section className={styles.ending} aria-labelledby="ending-title">
            <header>
              <span aria-hidden="true">◷</span>
              <div>
                <h2 id="ending-title">شگفت‌انگیزهای رو به اتمام</h2>
                <p>محصولاتی که فرصت خریدشان زودتر تمام می‌شود</p>
              </div>
            </header>
            <div className={styles.endingRail}>
              {endingProducts.map((product) => (
                <AmazingProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        ) : null}

        <section className={styles.allOffers} aria-labelledby="all-offers-title">
          <header>
            <div>
              <p>همهٔ فرصت‌ها</p>
              <h2 id="all-offers-title">تمام پیشنهادهای شگفت‌انگیز</h2>
            </div>
            <strong>{sortedProducts.length.toLocaleString("fa-IR")} کالا</strong>
          </header>
          <div className={styles.catalogLayout}>
            <aside>
              <form method="get" action="/offers">
                <h3>فیلتر و مرتب‌سازی</h3>
                <label>
                  دسته‌بندی
                  <select name="category" defaultValue={activeCategory}>
                    <option value="">همه دسته‌ها</option>
                    {offerCategories.map((category) => (
                      <option key={category.slug} value={category.slug}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  مرتب‌سازی
                  <select name="sort" defaultValue={sort}>
                    <option value="recommended">پیشنهاد Miran</option>
                    <option value="discount">بیشترین تخفیف</option>
                    <option value="ending">رو به اتمام</option>
                    {priceSortAllowed ? (
                      <option value="price-asc">کمترین قیمت</option>
                    ) : null}
                  </select>
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    name="inStock"
                    value="1"
                    defaultChecked={inStockOnly}
                  />
                  فقط کالاهای موجود
                </label>
                <button type="submit">اعمال فیلتر</button>
                {activeCategory || inStockOnly || sort !== "recommended" ? (
                  <a href="/offers">پاک کردن فیلترها</a>
                ) : null}
              </form>
            </aside>
            {sortedProducts.length > 0 ? (
              <div className={styles.productGrid}>
                {sortedProducts.map((product) => (
                  <AmazingProductCard
                    key={product.id}
                    product={toDisplayProduct(product)}
                  />
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                <h3>پیشنهادی با این فیلتر پیدا نشد</h3>
                <p>فیلتر را تغییر دهید یا همهٔ پیشنهادها را ببینید.</p>
                <a href="/offers">نمایش همه پیشنهادها</a>
              </div>
            )}
          </div>
        </section>
      </Container>
    </main>
  );
}
