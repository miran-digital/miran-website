"use client";

import { useEffect, useMemo, useState } from "react";
import { Container } from "@miran/ui";
import {
  clearGuestCart,
  createEmptyGuestCart,
  getGuestCart,
  guestCartQuantityLimit,
  removeGuestCartLine,
  subscribeToGuestCart,
  updateGuestCartLine,
  type GuestCart,
  type GuestCartLine,
} from "./guest-cart";
import styles from "./cart.module.css";

function formatMoney(amountMinor: number, currency: string) {
  const formatter = new Intl.NumberFormat("fa-IR", {
    style: "currency",
    currency,
  });
  const minorDigits = formatter.resolvedOptions().maximumFractionDigits ?? 0;
  return formatter.format(amountMinor / 10 ** minorDigits);
}

function CartLineItem({ line }: { line: GuestCartLine }) {
  return (
    <article className={styles.line}>
      <a
        className={styles.media}
        href={`/product/${encodeURIComponent(line.slug)}`}
        aria-label={`مشاهده ${line.title}`}
      >
        {line.mediaLabel}
      </a>
      <div className={styles.lineBody}>
        <div>
          <h2>
            <a href={`/product/${encodeURIComponent(line.slug)}`}>
              {line.title}
            </a>
          </h2>
          <p>قیمت واحد: {formatMoney(line.unitPriceMinor, line.currency)}</p>
        </div>
        <label>
          <span>تعداد</span>
          <select
            value={line.quantity}
            onChange={(event) =>
              updateGuestCartLine(line.productId, Number(event.target.value))
            }
          >
            {Array.from(
              { length: guestCartQuantityLimit },
              (_, index) => index + 1,
            ).map((quantity) => (
              <option key={quantity} value={quantity}>
                {quantity.toLocaleString("fa-IR")}
              </option>
            ))}
          </select>
        </label>
        <strong>
          {formatMoney(line.unitPriceMinor * line.quantity, line.currency)}
        </strong>
        <button
          type="button"
          onClick={() => removeGuestCartLine(line.productId)}
          aria-label={`حذف ${line.title} از سبد خرید`}
        >
          حذف
        </button>
      </div>
    </article>
  );
}

export function CartPage() {
  const [cart, setCart] = useState<GuestCart>(createEmptyGuestCart);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const syncCart = () => {
      setCart(getGuestCart());
      setReady(true);
    };
    syncCart();
    return subscribeToGuestCart(syncCart);
  }, []);

  const currency = cart.lines[0]?.currency ?? "GBP";
  const hasMixedCurrencies = cart.lines.some(
    (line) => line.currency !== currency,
  );
  const itemCount = useMemo(
    () => cart.lines.reduce((total, line) => total + line.quantity, 0),
    [cart.lines],
  );
  const subtotalMinor = useMemo(
    () =>
      cart.lines.reduce(
        (total, line) => total + line.unitPriceMinor * line.quantity,
        0,
      ),
    [cart.lines],
  );

  return (
    <main className={styles.page}>
      <Container size="wide">
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <a href="/">خانه</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">سبد خرید</span>
        </nav>
        <header className={styles.header}>
          <p>Miran Shop</p>
          <h1>سبد خرید شما</h1>
          <p>
            {ready
              ? `${itemCount.toLocaleString("fa-IR")} کالا در سبد شماست.`
              : "در حال آماده‌سازی سبد خرید…"}
          </p>
        </header>

        {!ready ? (
          <div className={styles.loading} role="status">
            در حال بارگذاری سبد خرید…
          </div>
        ) : cart.lines.length === 0 ? (
          <section className={styles.empty} aria-labelledby="empty-cart-title">
            <span aria-hidden="true">سبد</span>
            <h2 id="empty-cart-title">سبد خرید شما خالی است</h2>
            <p>از میان محصولات Miran Shop انتخاب کنید و اینجا برگردید.</p>
            <a href="/category/digital">مشاهده محصولات</a>
          </section>
        ) : (
          <div className={styles.layout}>
            <section className={styles.lines} aria-label="کالاهای سبد خرید">
              <div className={styles.linesHeader}>
                <h2>کالاها</h2>
                <button type="button" onClick={clearGuestCart}>
                  پاک کردن سبد
                </button>
              </div>
              {cart.lines.map((line) => (
                <CartLineItem key={line.productId} line={line} />
              ))}
            </section>

            <aside className={styles.summary} aria-labelledby="summary-title">
              <h2 id="summary-title">خلاصه سفارش</h2>
              <dl>
                <div>
                  <dt>تعداد کالا</dt>
                  <dd>{itemCount.toLocaleString("fa-IR")}</dd>
                </div>
                <div>
                  <dt>جمع کالاها</dt>
                  <dd>
                    {hasMixedCurrencies
                      ? "نیازمند بازبینی"
                      : formatMoney(subtotalMinor, currency)}
                  </dd>
                </div>
                <div>
                  <dt>هزینه ارسال</dt>
                  <dd>پس از انتخاب آدرس</dd>
                </div>
              </dl>
              {hasMixedCurrencies ? (
                <p className={styles.warning} role="alert">
                  کالاهای این سبد ارز یکسان ندارند و باید پیش از ادامه بازبینی
                  شوند.
                </p>
              ) : null}
              {hasMixedCurrencies ? (
                <span className={styles.checkoutDisabled}>
                  ادامه فرایند خرید
                </span>
              ) : (
                <a className={styles.checkoutAction} href="/checkout">
                  ادامه فرایند خرید
                </a>
              )}
              <p id="checkout-note" className={styles.checkoutNote}>
                در مرحله بعد نشانی و روش تحویل را مرور می‌کنید.
              </p>
            </aside>
          </div>
        )}
      </Container>
    </main>
  );
}
