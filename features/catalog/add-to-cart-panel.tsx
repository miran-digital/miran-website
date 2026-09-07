"use client";

import { useState } from "react";
import { addGuestCartLine } from "@/features/cart/guest-cart";
import type { CatalogMoney, CatalogProductDetail } from "./catalog-gateway";
import {
  formatMoney as formatIranMoney,
  formatRialReference,
  normalizeLegacyPriceToRial,
} from "@/lib/money";
import styles from "./product-detail.module.css";

type AddToCartPanelProps = {
  product: CatalogProductDetail;
};

function discountPercentage(current: CatalogMoney, previous?: CatalogMoney) {
  if (!previous || previous.amountMinor <= current.amountMinor || previous.amountMinor <= 0) return 0;
  return Math.round(((previous.amountMinor - current.amountMinor) / previous.amountMinor) * 100);
}

export function AddToCartPanel({ product }: AddToCartPanelProps) {
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [selection, setSelection] = useState(() => {
    if ((product.availableQuantity ?? 0) > 0) return "base";
    const variant = product.variants.find((item) => item.availableQuantity > 0);
    if (variant) return `variant:${variant.id}`;
    const seller = product.sellerOffers.find((item) => item.availableQuantity > 0);
    return seller ? `seller:${seller.id}` : "base";
  });
  const selectedVariant = selection.startsWith("variant:")
    ? product.variants.find((variant) => variant.id === selection.slice(8))
    : undefined;
  const selectedSellerOffer = selection.startsWith("seller:")
    ? product.sellerOffers.find((offer) => offer.id === selection.slice(7))
    : undefined;
  const selectedPrice = selectedVariant?.price ?? selectedSellerOffer?.price ?? product.price;
  const selectedPreviousPrice = selectedVariant
    ? selectedVariant.previousPrice
    : selectedSellerOffer
      ? undefined
      : product.previousPrice;
  const selectedAvailable = selectedVariant?.availableQuantity ??
    selectedSellerOffer?.availableQuantity ?? product.availableQuantity ?? 0;
  const maximumQuantity = Math.max(1, Math.min(10, selectedAvailable));
  const selectionAvailable = selectedAvailable > 0;
  const discount = discountPercentage(selectedPrice, selectedPreviousPrice);
  const lowStock = selectionAvailable && selectedAvailable <= 3;

  function choose(nextSelection: string) {
    setSelection(nextSelection);
    setQuantity(1);
    setMessage("");
  }

  function addToCart() {
    if (!selectionAvailable) return;
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
    <div className={styles.purchaseCard}>
      <div className={styles.purchasePriceRow}>
        <div>
          {selectedPreviousPrice ? (
            <div className={styles.previousPriceRow}>
              <del>{formatIranMoney(selectedPreviousPrice.amountMinor, selectedPreviousPrice.currency)}</del>
              {discount > 0 ? <span>{discount.toLocaleString("fa-IR")}٪</span> : null}
            </div>
          ) : null}
          <strong className={styles.currentPrice}>
            {formatIranMoney(selectedPrice.amountMinor, selectedPrice.currency)}
          </strong>
          <small className={styles.rialReference}>
            معادل {formatRialReference(normalizeLegacyPriceToRial(selectedPrice.amountMinor, selectedPrice.currency))}
          </small>
        </div>
        <div className={styles.stockState} data-in-stock={selectionAvailable}>
          <strong>{selectionAvailable ? "موجود" : "ناموجود"}</strong>
          {selectionAvailable ? (
            <small>{lowStock ? `فقط ${selectedAvailable.toLocaleString("fa-IR")} عدد باقی مانده` : "آماده ثبت سفارش"}</small>
          ) : (
            <small>این انتخاب فعلاً قابل سفارش نیست</small>
          )}
        </div>
      </div>

      {product.variants.length > 0 ? (
        <fieldset className={styles.optionGroup}>
          <legend>انتخاب تنوع</legend>
          <div className={styles.variantGrid}>
            <button
              type="button"
              className={styles.variantButton}
              aria-pressed={selection === "base"}
              onClick={() => choose("base")}
              disabled={(product.availableQuantity ?? 0) < 1}
            >
              <strong>مدل اصلی</strong>
              <small>{formatIranMoney(product.price.amountMinor, product.price.currency)}</small>
            </button>
            {product.variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                className={styles.variantButton}
                aria-pressed={selection === `variant:${variant.id}`}
                onClick={() => choose(`variant:${variant.id}`)}
                disabled={variant.availableQuantity < 1}
              >
                <strong>{variant.title}</strong>
                <small>{formatIranMoney(variant.price.amountMinor, variant.price.currency)}</small>
                {variant.attributes.length > 0 ? (
                  <span>{variant.attributes.slice(0, 2).map((attribute) => `${attribute.label}: ${attribute.value}${attribute.unit ? ` ${attribute.unit}` : ""}`).join(" · ")}</span>
                ) : null}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {product.sellerOffers.length > 0 ? (
        <fieldset className={styles.optionGroup}>
          <legend>انتخاب فروشنده</legend>
          <div className={styles.sellerList}>
            <button
              type="button"
              className={styles.sellerCard}
              aria-pressed={selection === "base"}
              onClick={() => choose("base")}
              disabled={(product.availableQuantity ?? 0) < 1}
            >
              <span><strong>Miran Shop</strong><small>فروش مستقیم</small></span>
              <span><strong>{formatIranMoney(product.price.amountMinor, product.price.currency)}</strong><small>ارسال توسط Miran</small></span>
            </button>
            {product.sellerOffers.map((offer) => (
              <button
                key={offer.id}
                type="button"
                className={styles.sellerCard}
                aria-pressed={selection === `seller:${offer.id}`}
                onClick={() => choose(`seller:${offer.id}`)}
                disabled={offer.availableQuantity < 1}
              >
                <span><strong>{offer.sellerName}</strong><small>{offer.guaranteeLabel || "ضمانت طبق پرونده فروشنده"}</small></span>
                <span><strong>{formatIranMoney(offer.price.amountMinor, offer.price.currency)}</strong><small>{offer.deliveryLabel || "ارسال فروشنده"}</small></span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className={styles.quantityRow}>
        <label>
          <span>تعداد</span>
          <select
            value={quantity}
            disabled={!selectionAvailable}
            onChange={(event) => setQuantity(Number(event.target.value))}
          >
            {Array.from({ length: maximumQuantity }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>{value.toLocaleString("fa-IR")}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={styles.primaryAddButton}
          disabled={!selectionAvailable}
          onClick={addToCart}
        >
          {selectionAvailable ? "افزودن به سبد خرید" : "فعلاً ناموجود"}
        </button>
      </div>

      <div className={styles.purchaseTrust} aria-label="خدمات خرید">
        <span>✓ تضمین اصالت و سلامت کالا</span>
        <span>✓ ارسال قابل پیگیری</span>
        <span>✓ پشتیبانی پس از خرید</span>
      </div>

      <p className={styles.cartStatus} role="status" aria-live="polite">
        {message}
        {message ? <a href="/cart"> مشاهده سبد خرید</a> : null}
      </p>

      <div className={styles.mobilePurchaseBar} aria-label="خرید سریع محصول">
        <div>
          <small>{selectionAvailable ? "قیمت انتخاب شما" : "ناموجود"}</small>
          <strong>{formatIranMoney(selectedPrice.amountMinor, selectedPrice.currency)}</strong>
        </div>
        <button type="button" disabled={!selectionAvailable} onClick={addToCart}>
          {selectionAvailable ? "افزودن به سبد" : "ناموجود"}
        </button>
      </div>
    </div>
  );
}
