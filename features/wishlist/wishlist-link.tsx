"use client";

import { useEffect, useState } from "react";
import {
  getGuestWishlistItemCount,
  subscribeToGuestWishlist,
} from "./guest-wishlist";
import styles from "./wishlist.module.css";

export function WishlistLink({ compact = false }: { compact?: boolean }) {
  const [itemCount, setItemCount] = useState(0);
  useEffect(() => {
    const sync = () => setItemCount(getGuestWishlistItemCount());
    sync();
    return subscribeToGuestWishlist(sync);
  }, []);

  return (
    <a className={`${styles.link} ${compact ? styles.compact : ""}`} href="/wishlist" aria-label="علاقه‌مندی‌ها">
      <svg className={styles.linkIcon} aria-hidden="true" viewBox="0 0 24 24">
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
      </svg>
      <span className={styles.linkLabel}>علاقه‌مندی‌ها</span>
      {itemCount > 0 ? (
        <span className={styles.count} aria-label={`${itemCount} کالا`}>
          {itemCount.toLocaleString("fa-IR")}
        </span>
      ) : null}
    </a>
  );
}
