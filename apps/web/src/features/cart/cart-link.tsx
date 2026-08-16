"use client";

import { useEffect, useState } from "react";
import { getGuestCartItemCount, subscribeToGuestCart } from "./guest-cart";
import {
  subscribeToServerCart,
  syncGuestCartToServer,
} from "./persistent-cart";
import styles from "./cart-link.module.css";

export function CartLink() {
  const [itemCount, setItemCount] = useState(0);

  useEffect(() => {
    let active = true;
    const syncGuestCount = () => setItemCount(getGuestCartItemCount());
    syncGuestCount();

    void syncGuestCartToServer()
      .then((cart) => {
        if (active && cart) setItemCount(cart.itemCount);
      })
      .catch(() => {
        if (active) syncGuestCount();
      });

    const unsubscribeGuest = subscribeToGuestCart(() => {
      if (active) syncGuestCount();
    });
    const unsubscribeServer = subscribeToServerCart((cart) => {
      if (active && cart) setItemCount(cart.itemCount);
    });
    return () => {
      active = false;
      unsubscribeGuest();
      unsubscribeServer();
    };
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
