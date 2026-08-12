"use client";

import { useEffect, useState } from "react";
import {
  getGuestWishlistItemCount,
  subscribeToGuestWishlist,
} from "./guest-wishlist";
import styles from "./wishlist.module.css";

export function WishlistLink() {
  const [itemCount, setItemCount] = useState(0);
  useEffect(() => {
    const sync = () => setItemCount(getGuestWishlistItemCount());
    sync();
    return subscribeToGuestWishlist(sync);
  }, []);

  return (
    <a className={styles.link} href="/wishlist">
      <span>علاقه‌مندی‌ها</span>
      {itemCount > 0 ? (
        <span className={styles.count} aria-label={`${itemCount} کالا`}>
          {itemCount.toLocaleString("fa-IR")}
        </span>
      ) : null}
    </a>
  );
}
