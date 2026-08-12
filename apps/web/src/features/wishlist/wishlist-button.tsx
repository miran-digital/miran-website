"use client";

import { useEffect, useState } from "react";
import {
  guestWishlistHas,
  subscribeToGuestWishlist,
  toggleGuestWishlist,
} from "./guest-wishlist";
import styles from "./wishlist.module.css";

export function WishlistButton({
  productId,
  title,
}: {
  productId: string;
  title: string;
}) {
  const [selected, setSelected] = useState(false);

  useEffect(() => {
    const sync = () => setSelected(guestWishlistHas(productId));
    sync();
    return subscribeToGuestWishlist(sync);
  }, [productId]);

  return (
    <button
      type="button"
      className={styles.button}
      aria-pressed={selected}
      aria-label={
        selected
          ? `حذف ${title} از علاقه‌مندی‌ها`
          : `افزودن ${title} به علاقه‌مندی‌ها`
      }
      title={selected ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها"}
      onClick={() => setSelected(toggleGuestWishlist(productId))}
    >
      <span aria-hidden="true">{selected ? "♥" : "♡"}</span>
    </button>
  );
}
