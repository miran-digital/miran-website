"use client";

import { useState } from "react";
import { addGuestCartLine } from "@/features/cart/guest-cart";
import type { CatalogProductDetail } from "./catalog-gateway";
import { formatMoney as formatIranMoney } from "@/lib/money";
import styles from "./product-detail.module.css";

type AddToCartPanelProps = {
  product: CatalogProductDetail;
};

export function AddToCartPanel({ product }: AddToCartPanelProps) {
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [selection, setSelection] = useState("base");
  const selectedVariant = selection.startsWith("variant:")
    ? product.variants.find((variant) => variant.id === selection.slice(8))
    : undefined;
  const selectedSellerOffer = selection.startsWith("seller:")
    ? product.sellerOffers.find((offer) => offer.id === selection.slice(7))
    : undefined;
  const selectedPrice = selectedVariant?.price ?? selectedSellerOffer?.price ?? product.price;
  const selectedAvailable = selectedVariant?.availableQuantity ??
    selectedSellerOffer?.availableQuantity ?? product.availableQuantity ?? 0;
  const maximumQuantity = Math.max(
    1,
    Math.min(10, selectedAvailable),
  );
  const selectionAvailable = selectedAvailable > 0;

  function addToCart() {
    const itemCount = addGuestCartLine({
      productId: product.id,
      slug: product.slug,
      title: product.title,
      mediaLabel: product.mediaLabel,
      unitPriceMinor: selectedPrice.amountMinor,
      currency: selectedPrice.currency,
      quantity,
      ...(selectedVariant ? { variantId: selectedVariant.id, selectionLabel: `تنوع: ${selectedVariant.title}` } : {}),
      ...(selectedSellerOffer ? { sellerOfferId: selectedSellerOffer.id, selectionLabel: `فروشنده: ${selectedSellerOffer.sellerName}` } : {}),
    });
    setMessage(
      `${quantity.toLocaleString("fa-IR")} عدد به سبد اضافه شد؛ اکنون ${itemCount.toLocaleString("fa-IR")} کالا در سبد مهمان دارید.`,
    );
  }

  return (
    <div className={styles.purchaseActions}>
      {product.variants.length || product.sellerOffers.length ? (
        <label className={styles.purchaseSelection}>
          <span>انتخاب فروش و تنوع</span>
          <select value={selection} onChange={(event) => { setSelection(event.target.value); setQuantity(1); }}>
            <option value="base">فروش مستقیم Miran — {formatIranMoney(product.price.amountMinor, product.price.currency)}</option>
            {product.variants.map((variant) => (
              <option key={variant.id} value={`variant:${variant.id}`} disabled={variant.availableQuantity < 1}>
                {variant.title} — {formatIranMoney(variant.price.amountMinor, variant.price.currency)}
              </option>
            ))}
            {product.sellerOffers.map((offer) => (
              <option key={offer.id} value={`seller:${offer.id}`} disabled={offer.availableQuantity < 1}>
                {offer.sellerName} — {formatIranMoney(offer.price.amountMinor, offer.price.currency)}
              </option>
            ))}
          </select>
          {selectedSellerOffer ? <small>{selectedSellerOffer.guaranteeLabel || "ضمانت طبق پرونده فروشنده"} · {selectedSellerOffer.deliveryLabel || "ارسال فروشنده"}</small> : null}
        </label>
      ) : null}
      <label>
        <span>تعداد</span>
        <select
          value={quantity}
          disabled={!selectionAvailable}
          onChange={(event) => setQuantity(Number(event.target.value))}
        >
          {Array.from({ length: maximumQuantity }, (_, index) => index + 1).map((value) => (
            <option key={value} value={value}>
              {value.toLocaleString("fa-IR")}
            </option>
          ))}
        </select>
      </label>
      <button type="button" disabled={!selectionAvailable} onClick={addToCart}>
        {selectionAvailable ? "افزودن به سبد خرید" : "فعلاً ناموجود"}
      </button>
      <p className={styles.cartStatus} role="status" aria-live="polite">
        {message}
        {message ? <a href="/cart"> مشاهده سبد خرید</a> : null}
      </p>
    </div>
  );
}
