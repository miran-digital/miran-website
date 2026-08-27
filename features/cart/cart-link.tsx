"use client";

import { useEffect, useState } from "react";
import { getGuestCartItemCount, subscribeToGuestCart } from "./guest-cart";
import styles from "./cart-link.module.css";

export function CartLink({ compact = false }: { compact?: boolean }) {
  const [itemCount, setItemCount] = useState(0);

  useEffect(() => {
    const syncCount = () => setItemCount(getGuestCartItemCount());
    syncCount();
    return subscribeToGuestCart(syncCount);
  }, []);

  return (
    <a className={`${styles.link} ${compact ? styles.compact : ""}`} href="/cart" aria-label="سبد خرید">
      <svg className={styles.icon} aria-hidden="true" viewBox="0 0 24 24">
        <path d="M3 4h2l2.1 10.1a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L20 8H6M10 20h.01M17 20h.01" />
      </svg>
      <span className={styles.label}>سبد خرید</span>
      {itemCount > 0 ? (
        <span
          className={styles.count}
          aria-label={`${itemCount.toLocaleString("fa-IR")} کالا`}
        >
          {itemCount.toLocaleString("fa-IR")}
        </span>
      ) : null}
    </a>
  );
}
