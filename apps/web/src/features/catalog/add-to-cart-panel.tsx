"use client";

import { useState } from "react";
import { addGuestCartLine } from "@/features/cart/guest-cart";
import type { CatalogProductDetail } from "./catalog-gateway";
import styles from "./product-detail.module.css";

type AddToCartPanelProps = {
  product: CatalogProductDetail;
};

export function AddToCartPanel({ product }: AddToCartPanelProps) {
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");

  function addToCart() {
    const itemCount = addGuestCartLine({
      productId: product.id,
      slug: product.slug,
      title: product.title,
      mediaLabel: product.mediaLabel,
      unitPriceMinor: product.price.amountMinor,
      currency: product.price.currency,
      quantity,
    });
    setMessage(
      `${quantity.toLocaleString("fa-IR")} عدد به سبد اضافه شد؛ اکنون ${itemCount.toLocaleString("fa-IR")} کالا در سبد مهمان دارید.`,
    );
  }

  return (
    <div className={styles.purchaseActions}>
      <label>
        <span>تعداد</span>
        <select
          value={quantity}
          disabled={!product.inStock}
          onChange={(event) => setQuantity(Number(event.target.value))}
        >
          {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
            <option key={value} value={value}>
              {value.toLocaleString("fa-IR")}
            </option>
          ))}
        </select>
      </label>
      <button type="button" disabled={!product.inStock} onClick={addToCart}>
        {product.inStock ? "افزودن به سبد خرید" : "فعلاً ناموجود"}
      </button>
      <p className={styles.cartStatus} role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
