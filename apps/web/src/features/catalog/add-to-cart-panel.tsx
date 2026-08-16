"use client";

import { useState } from "react";
import { addCartLinePreferServer } from "@/features/cart/persistent-cart";
import type { CatalogProductDetail } from "./catalog-gateway";
import styles from "./product-detail.module.css";

type AddToCartPanelProps = {
  product: CatalogProductDetail;
};

export function AddToCartPanel({ product }: AddToCartPanelProps) {
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function addToCart() {
    if (saving || !product.inStock) return;
    setSaving(true);
    setMessage("");
    try {
      const result = await addCartLinePreferServer({
        productId: product.id,
        slug: product.slug,
        title: product.title,
        mediaLabel: product.mediaLabel,
        unitPriceMinor: product.price.amountMinor,
        currency: product.price.currency,
        quantity,
      });
      setMessage(
        result.mode === "server"
          ? `${quantity.toLocaleString("fa-IR")} عدد به سبد حساب شما اضافه شد؛ اکنون ${result.itemCount.toLocaleString("fa-IR")} کالا دارید.`
          : `${quantity.toLocaleString("fa-IR")} عدد به سبد مهمان اضافه شد؛ اکنون ${result.itemCount.toLocaleString("fa-IR")} کالا دارید.`,
      );
    } catch {
      setMessage("افزودن کالا به سبد انجام نشد؛ دوباره تلاش کنید.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.purchaseActions}>
      <label>
        <span>تعداد</span>
        <select
          value={quantity}
          disabled={!product.inStock || saving}
          onChange={(event) => setQuantity(Number(event.target.value))}
        >
          {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
            <option key={value} value={value}>
              {value.toLocaleString("fa-IR")}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!product.inStock || saving}
        onClick={() => void addToCart()}
      >
        {!product.inStock ? "فعلاً ناموجود" : saving ? "در حال افزودن…" : "افزودن به سبد خرید"}
      </button>
      <p className={styles.cartStatus} role="status" aria-live="polite">
        {message}
        {message ? <a href="/cart"> مشاهده سبد خرید</a> : null}
      </p>
    </div>
  );
}
