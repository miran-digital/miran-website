import { Container, ProductCard } from "@miran/ui";
import type { CatalogListingResult, CatalogSort } from "./catalog-gateway";
import { WishlistButton } from "@/features/wishlist/wishlist-button";
import {
  buildCategoryListingHref,
  hasActiveListingFilters,
  type CategoryListingState,
} from "./listing-state";
import styles from "./category-listing.module.css";

type CategoryListingProps = {
  listing: CatalogListingResult;
  state: CategoryListingState;
};

const sortOptions: readonly { value: CatalogSort; label: string }[] = [
  { value: "featured", label: "پیشنهاد Miran" },
  { value: "newest", label: "جدیدترین" },
  { value: "price-asc", label: "قیمت: کم به زیاد" },
  { value: "price-desc", label: "قیمت: زیاد به کم" },
];

function FilterFields({ listing, state }: CategoryListingProps) {
  return (
    <>
      <fieldset className={styles.fieldset}>
        <legend>برند</legend>
        <div className={styles.checkList}>
          {listing.brandFacets.map((brand) => (
            <label key={brand.id} className={styles.checkRow}>
              <span>
                <input
                  name="brand"
                  value={brand.id}
                  type="checkbox"
                  defaultChecked={state.brandIds.includes(brand.id)}
                />
                {brand.label}
              </span>
              <small>{brand.count.toLocaleString("fa-IR")}</small>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>محدوده قیمت</legend>
        <div className={styles.priceGrid}>
          <label>
            <span>از (£)</span>
            <input
              name="minPrice"
              type="number"
              min="0"
              step="1"
              defaultValue={
                state.minPriceMinor === undefined
                  ? ""
                  : state.minPriceMinor / 100
              }
            />
          </label>
          <label>
            <span>تا (£)</span>
            <input
              name="maxPrice"
              type="number"
              min="0"
              step="1"
              defaultValue={
                state.maxPriceMinor === undefined
                  ? ""
                  : state.maxPriceMinor / 100
              }
            />
          </label>
        </div>
      </fieldset>

      <label className={styles.stockOnly}>
        <input
          name="inStock"
          value="1"
          type="checkbox"
          defaultChecked={state.inStockOnly}
        />
        فقط کالاهای موجود
      </label>

      {state.sort !== "featured" ? (
        <input type="hidden" name="sort" value={state.sort} />
      ) : null}
      <div className={styles.filterActions}>
        <button type="submit">اعمال فیلترها</button>
        {hasActiveListingFilters(state) ? (
          <a href={`/category/${listing.category.slug}`}>پاک کردن</a>
        ) : null}
      </div>
    </>
  );
}

function FilterForm({ listing, state }: CategoryListingProps) {
  return (
    <form
      method="get"
      action={`/category/${listing.category.slug}`}
      className={styles.filters}
    >
      <FilterFields listing={listing} state={state} />
    </form>
  );
}

function SortForm({ listing, state }: CategoryListingProps) {
  return (
    <form
      method="get"
      action={`/category/${listing.category.slug}`}
      className={styles.sortForm}
    >
      {state.brandIds.map((brandId) => (
        <input key={brandId} type="hidden" name="brand" value={brandId} />
      ))}
      {state.inStockOnly ? (
        <input type="hidden" name="inStock" value="1" />
      ) : null}
      {state.minPriceMinor !== undefined ? (
        <input
          type="hidden"
          name="minPrice"
          value={state.minPriceMinor / 100}
        />
      ) : null}
      {state.maxPriceMinor !== undefined ? (
        <input
          type="hidden"
          name="maxPrice"
          value={state.maxPriceMinor / 100}
        />
      ) : null}
      <label htmlFor="catalog-sort">مرتب‌سازی</label>
      <select id="catalog-sort" name="sort" defaultValue={state.sort}>
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button type="submit">اعمال</button>
    </form>
  );
}

function Pagination({ listing, state }: CategoryListingProps) {
  if (listing.totalPages <= 1) return null;
  const pages = Array.from(
    { length: listing.totalPages },
    (_, index) => index + 1,
  );

  return (
    <nav className={styles.pagination} aria-label="صفحه‌بندی محصولات">
      {listing.page > 1 ? (
        <a
          href={buildCategoryListingHref(listing.category.slug, state, {
            page: listing.page - 1,
          })}
        >
          صفحه قبل
        </a>
      ) : (
        <span />
      )}
      <div className={styles.pageNumbers}>
        {pages.map((page) => (
          <a
            key={page}
            href={buildCategoryListingHref(listing.category.slug, state, {
              page,
            })}
            aria-current={page === listing.page ? "page" : undefined}
          >
            {page.toLocaleString("fa-IR")}
          </a>
        ))}
      </div>
      {listing.page < listing.totalPages ? (
        <a
          href={buildCategoryListingHref(listing.category.slug, state, {
            page: listing.page + 1,
          })}
        >
          صفحه بعد
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function CategoryListing({ listing, state }: CategoryListingProps) {
  return (
    <main className={styles.page}>
      <Container size="wide">
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <a href="/">خانه</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{listing.category.name}</span>
        </nav>

        <header className={styles.header}>
          <p>دسته‌بندی</p>
          <h1>{listing.category.name}</h1>
          <p>{listing.category.description}</p>
        </header>

        <details className={styles.mobileFilters}>
          <summary>فیلتر محصولات</summary>
          <FilterForm listing={listing} state={state} />
        </details>

        <div className={styles.layout}>
          <aside className={styles.sidebar} aria-label="فیلتر محصولات">
            <h2>فیلترها</h2>
            <FilterForm listing={listing} state={state} />
          </aside>

          <section className={styles.results} aria-labelledby="listing-heading">
            <div className={styles.toolbar}>
              <div>
                <h2 id="listing-heading">محصولات</h2>
                <p>{listing.totalProducts.toLocaleString("fa-IR")} کالا</p>
              </div>
              <SortForm listing={listing} state={state} />
            </div>

            {listing.products.length > 0 ? (
              <div className={styles.productGrid}>
                {listing.products.map((product) => (
                  <ProductCard
                    key={product.id}
                    href={product.href}
                    title={product.title}
                    action={
                      <WishlistButton
                        productId={product.id}
                        title={product.title}
                      />
                    }
                    media={
                      <span className={styles.media}>{product.mediaLabel}</span>
                    }
                    eyebrow={
                      product.inStock
                        ? product.brandName
                        : `${product.brandName} · ناموجود`
                    }
                    {...(product.badge === undefined
                      ? {}
                      : { badge: product.badge })}
                    price={product.price}
                    {...(product.previousPrice === undefined
                      ? {}
                      : { previousPrice: product.previousPrice })}
                  />
                ))}
              </div>
            ) : (
              <div className={styles.empty} role="status">
                <h3>محصولی با این فیلترها پیدا نشد</h3>
                <p>فیلترها را تغییر دهید یا همه فیلترها را پاک کنید.</p>
                <a href={`/category/${listing.category.slug}`}>
                  نمایش همه محصولات
                </a>
              </div>
            )}
            <Pagination listing={listing} state={state} />
          </section>
        </div>
      </Container>
    </main>
  );
}
