import { Container } from "@/components/ui";
import { ProductRail } from "@/features/home/product-rail";
import type { HomeProductRail } from "@/features/home/merchandising-content";
import {
  AmazingOffersRail,
  type AmazingDisplayProduct,
} from "@/features/offers/amazing-offers";
import type {
  CatalogCategory,
  CatalogCategoryBrand,
  CatalogProductSummary,
} from "./catalog-gateway";
import styles from "./parent-category-showcase.module.css";

function toAmazingProduct(
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

function toProductRail(
  category: CatalogCategory,
  products: readonly CatalogProductSummary[],
): HomeProductRail {
  return {
    id: `category-${category.slug}`,
    title: `منتخب ${category.name}`,
    description: `ترکیبی از محصولات و زیردسته‌های ${category.name}`,
    href: `#all-${category.slug}`,
    linkLabel: "مشاهده همه محصولات",
    products: products.map((product) => ({
      id: product.id,
      title: product.title,
      href: product.href,
      mediaLabel: product.mediaLabel,
      ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
      eyebrow: product.brandName,
      ...(product.badge ? { badge: product.badge } : {}),
      ...(product.offerEndsAt ? { offerEndsAt: product.offerEndsAt } : {}),
      price: product.price,
      ...(product.previousPrice ? { previousPrice: product.previousPrice } : {}),
    })),
  };
}

export function ParentCategoryShowcase({
  category,
  brands,
  products,
  offers,
}: {
  category: CatalogCategory;
  brands: readonly CatalogCategoryBrand[];
  products: readonly CatalogProductSummary[];
  offers: readonly CatalogProductSummary[];
}) {
  const activeOffers = offers
    .filter((product) => product.categorySlugs.includes(category.slug))
    .map(toAmazingProduct);
  const sectionEndsAt = activeOffers
    .map((product) => product.offerEndsAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0];

  return (
    <div className={styles.showcase}>
      <section className={styles.categoryHeader} aria-labelledby="parent-category-title">
        <Container size="wide">
          <nav aria-label="مسیر صفحه">
            <a href="/">خانه</a>
            <span>/</span>
            <span aria-current="page">{category.name}</span>
          </nav>
          <div>
            <h1 id="parent-category-title">{category.name}</h1>
            <p>{category.description}</p>
          </div>
        </Container>
      </section>

      {brands.length > 0 ? (
        <section className={styles.brands} aria-labelledby="category-brand-title">
          <Container size="wide">
            <header>
              <p>خرید براساس برند</p>
              <h2 id="category-brand-title">برندهای {category.name}</h2>
            </header>
            <div>
              {brands.map((brand) => (
                <a key={brand.id} href={`/brand/${encodeURIComponent(brand.id)}`}>
                  <span aria-hidden="true">{brand.name.slice(0, 1)}</span>
                  <strong>{brand.name}</strong>
                  <small>
                    {brand.productCount > 0
                      ? `${brand.productCount.toLocaleString("fa-IR")} کالا`
                      : "مشاهده برند"}
                  </small>
                </a>
              ))}
            </div>
          </Container>
        </section>
      ) : null}

      {activeOffers.length > 0 ? (
        <AmazingOffersRail
          title={`شگفت‌انگیز ${category.name}`}
          subtitle="پیشنهادهای زمان‌دار همین دسته"
          href={`/offers?category=${encodeURIComponent(category.slug)}`}
          linkLabel="همه شگفت‌انگیزهای دسته"
          backgroundColor="#ef3340"
          textColor="#ffffff"
          products={activeOffers}
          {...(sectionEndsAt ? { endsAt: sectionEndsAt } : {})}
        />
      ) : (
        <Container size="wide">
          <section className={styles.emptyAmazing}>
            <span aria-hidden="true">٪</span>
            <div>
              <h2>شگفت‌انگیز {category.name}</h2>
              <p>محصول زمان‌دار این دسته پس از فعال‌سازی مدیر، همین‌جا نمایش داده می‌شود.</p>
            </div>
            <a href={`/offers?category=${encodeURIComponent(category.slug)}`}>
              صفحهٔ شگفت‌انگیز دسته
            </a>
          </section>
        </Container>
      )}

      {products.length > 0 ? (
        <ProductRail section={toProductRail(category, products)} />
      ) : (
        <Container size="wide">
          <section className={styles.empty}>
            <span aria-hidden="true">＋</span>
            <div>
              <h2>این دستهٔ مادر آماده است</h2>
              <p>
                مدیر می‌تواند از پنل، زیردسته، تصویر و محصول‌های {category.name}{" "}
                را اضافه کند.
              </p>
            </div>
          </section>
        </Container>
      )}
    </div>
  );
}
