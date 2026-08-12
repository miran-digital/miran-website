"use client";

import { useEffect, useState } from "react";
import { getGuestCartItemCount, subscribeToGuestCart } from "./guest-cart";
import styles from "./cart-link.module.css";

export function CartLink() {
  const [itemCount, setItemCount] = useState(0);

  useEffect(() => {
    const syncCount = () => setItemCount(getGuestCartItemCount());
    syncCount();
    return subscribeToGuestCart(syncCount);
  }, []);

  return (
    <a className={styles.link} href="/cart">
      <span>سبد خرید</span>
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
