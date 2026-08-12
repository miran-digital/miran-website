"use client";

import { useEffect, useMemo, useState } from "react";
import { Container } from "@miran/ui";
import type { CatalogProductSummary } from "@/features/catalog/catalog-gateway";
import { ProductGrid } from "@/features/catalog/product-grid";
import {
  createEmptyGuestWishlist,
  getGuestWishlist,
  subscribeToGuestWishlist,
  type GuestWishlist,
} from "./guest-wishlist";
import styles from "./wishlist.module.css";

export function WishlistPage({
  catalogProducts,
}: {
  catalogProducts: readonly CatalogProductSummary[];
}) {
  const [wishlist, setWishlist] = useState<GuestWishlist>(
    createEmptyGuestWishlist,
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setWishlist(getGuestWishlist());
      setReady(true);
    };
    sync();
    return subscribeToGuestWishlist(sync);
  }, []);

  const products = useMemo(() => {
    const byId = new Map(
      catalogProducts.map((product) => [product.id, product]),
    );
    return wishlist.productIds
      .map((id) => byId.get(id))
      .filter(
        (product): product is CatalogProductSummary => product !== undefined,
      );
  }, [catalogProducts, wishlist.productIds]);

  return (
    <main className={styles.page}>
      <Container size="wide">
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <a href="/">خانه</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">علاقه‌مندی‌ها</span>
        </nav>
        <header className={styles.header}>
          <p>Miran Shop</p>
          <h1>علاقه‌مندی‌های شما</h1>
          <p>
            {ready
              ? `${products.length.toLocaleString("fa-IR")} کالا ذخیره شده است.`
              : "در حال آماده‌سازی فهرست…"}
          </p>
        </header>
        {!ready ? (
          <div className={styles.state} role="status">
            در حال بارگذاری علاقه‌مندی‌ها…
          </div>
        ) : products.length === 0 ? (
          <div className={styles.state}>
            <h2>هنوز کالایی ذخیره نکرده‌اید</h2>
            <p>قلب روی کارت محصولات را انتخاب کنید تا اینجا نمایش داده شوند.</p>
            <a href="/categories">مشاهده محصولات</a>
          </div>
        ) : (
          <ProductGrid products={products} />
        )}
      </Container>
    </main>
  );
}
