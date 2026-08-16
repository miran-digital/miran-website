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
import {
  clearServerCart,
  removeServerCartLine,
  setServerCartLine,
  subscribeToServerCart,
  syncGuestCartToServer,
  type ServerCart,
  type ServerCartLine,
} from "./persistent-cart";
import styles from "./cart.module.css";

function toman(irr: number) {
  return `${Math.round(irr / 10).toLocaleString("fa-IR")} تومان`;
}

function formatGuestMoney(amount: number, currency: string) {
  if (currency === "IRR") return toman(amount);
  try {
    return new Intl.NumberFormat("fa-IR", { style: "currency", currency }).format(amount);
  } catch {
    return amount.toLocaleString("fa-IR");
  }
}

function GuestLineItem({ line }: { line: GuestCartLine }) {
  return (
    <article className={styles.line}>
      <a className={styles.media} href={`/product/${encodeURIComponent(line.slug)}`}>
        {line.mediaLabel}
      </a>
      <div className={styles.lineBody}>
        <div>
          <h2><a href={`/product/${encodeURIComponent(line.slug)}`}>{line.title}</a></h2>
          <p>قیمت موقت مهمان: {formatGuestMoney(line.unitPriceMinor, line.currency)}</p>
        </div>
        <label>
          <span>تعداد</span>
          <select
            value={line.quantity}
            onChange={(event) => updateGuestCartLine(line.productId, Number(event.target.value))}
          >
            {Array.from({ length: guestCartQuantityLimit }, (_, index) => index + 1).map((quantity) => (
              <option key={quantity} value={quantity}>{quantity.toLocaleString("fa-IR")}</option>
            ))}
          </select>
        </label>
        <strong>{formatGuestMoney(line.unitPriceMinor * line.quantity, line.currency)}</strong>
        <button type="button" onClick={() => removeGuestCartLine(line.productId)}>حذف</button>
      </div>
    </article>
  );
}

function ServerLineItem({
  line,
  onChange,
  disabled,
}: {
  line: ServerCartLine;
  onChange: (quantity: number) => void;
  disabled: boolean;
}) {
  return (
    <article className={styles.line}>
      <a className={styles.media} href={`/product/${encodeURIComponent(line.slug)}`}>
        {line.primaryImageUrl ? "تصویر" : "Miran"}
      </a>
      <div className={styles.lineBody}>
        <div>
          <h2><a href={`/product/${encodeURIComponent(line.slug)}`}>{line.title}</a></h2>
          <p>قیمت واقعی Server: {toman(line.pricing.finalIrr)}</p>
          {!line.available ? <p className={styles.warning}>موجودی برای این تعداد کافی نیست.</p> : null}
        </div>
        <label>
          <span>تعداد</span>
          <select
            value={line.quantity}
            disabled={disabled}
            onChange={(event) => onChange(Number(event.target.value))}
          >
            {Array.from(
              { length: Math.max(1, Math.min(10, line.availableQuantity || line.quantity)) },
              (_, index) => index + 1,
            ).map((quantity) => (
              <option key={quantity} value={quantity}>{quantity.toLocaleString("fa-IR")}</option>
            ))}
          </select>
        </label>
        <strong>{toman(line.pricing.finalIrr * line.quantity)}</strong>
        <button type="button" disabled={disabled} onClick={() => onChange(0)}>حذف</button>
      </div>
    </article>
  );
}

export function CartPage() {
  const [guestCart, setGuestCart] = useState<GuestCart>(createEmptyGuestCart);
  const [serverCart, setServerCart] = useState<ServerCart | null>(null);
  const [mode, setMode] = useState<"loading" | "guest" | "server">("loading");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const syncGuest = () => setGuestCart(getGuestCart());
    syncGuest();
    const unsubscribeGuest = subscribeToGuestCart(syncGuest);
    const unsubscribeServer = subscribeToServerCart((cart) => {
      if (active && cart) {
        setServerCart(cart);
        setMode("server");
      }
    });

    void syncGuestCartToServer()
      .then((cart) => {
        if (!active) return;
        if (cart) {
          setServerCart(cart);
          setMode("server");
        } else {
          setMode("guest");
        }
      })
      .catch(() => {
        if (active) {
          setMode("guest");
          setMessage("اتصال سبد حساب برقرار نشد؛ سبد مهمان شما حفظ شده است.");
        }
      });

    return () => {
      active = false;
      unsubscribeGuest();
      unsubscribeServer();
    };
  }, []);

  const guestItemCount = useMemo(
    () => guestCart.lines.reduce((total, line) => total + line.quantity, 0),
    [guestCart.lines],
  );
  const guestTotalIrr = useMemo(
    () =>
      guestCart.lines.every((line) => line.currency === "IRR")
        ? guestCart.lines.reduce((total, line) => total + line.unitPriceMinor * line.quantity, 0)
        : null,
    [guestCart.lines],
  );

  async function updateServerLine(productId: string, quantity: number) {
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      const next = quantity === 0
        ? await removeServerCartLine(productId)
        : await setServerCartLine(productId, quantity);
      setServerCart(next);
    } catch {
      setMessage("به‌روزرسانی سبد انجام نشد؛ قیمت و موجودی قبلی تغییر نکرد.");
    } finally {
      setSaving(false);
    }
  }

  async function clearCart() {
    if (mode === "guest") {
      clearGuestCart();
      return;
    }
    if (mode === "server") {
      setSaving(true);
      try {
        setServerCart(await clearServerCart());
      } finally {
        setSaving(false);
      }
    }
  }

  const empty = mode === "server" ? serverCart?.lines.length === 0 : guestCart.lines.length === 0;
  const itemCount = mode === "server" ? serverCart?.itemCount ?? 0 : guestItemCount;

  return (
    <main className={styles.page}>
      <Container size="wide">
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <a href="/">خانه</a><span aria-hidden="true">/</span><span aria-current="page">سبد خرید</span>
        </nav>
        <header className={styles.header}>
          <p>Miran Shop</p>
          <h1>سبد خرید شما</h1>
          <p>
            {mode === "loading"
              ? "در حال همگام‌سازی سبد خرید…"
              : mode === "server"
                ? `${itemCount.toLocaleString("fa-IR")} کالا در سبد ذخیره‌شده حساب شماست.`
                : `${itemCount.toLocaleString("fa-IR")} کالا در سبد مهمان شماست؛ پس از ورود، فقط شناسه و تعداد با Server ادغام می‌شود.`}
          </p>
        </header>

        {message ? <p className={styles.warning} role="status">{message}</p> : null}

        {mode === "loading" ? (
          <div className={styles.loading} role="status">در حال بارگذاری سبد خرید…</div>
        ) : empty ? (
          <section className={styles.empty} aria-labelledby="empty-cart-title">
            <span aria-hidden="true">سبد</span>
            <h2 id="empty-cart-title">سبد خرید شما خالی است</h2>
            <p>از میان محصولات واقعی Miran Shop انتخاب کنید و اینجا برگردید.</p>
            <a href="/categories">مشاهده محصولات</a>
          </section>
        ) : (
          <div className={styles.layout}>
            <section className={styles.lines} aria-label="کالاهای سبد خرید">
              <div className={styles.linesHeader}>
                <h2>کالاها</h2>
                <button type="button" disabled={saving} onClick={() => void clearCart()}>پاک کردن سبد</button>
              </div>
              {mode === "server"
                ? serverCart?.lines.map((line) => (
                    <ServerLineItem
                      key={line.productId}
                      line={line}
                      disabled={saving}
                      onChange={(quantity) => void updateServerLine(line.productId, quantity)}
                    />
                  ))
                : guestCart.lines.map((line) => <GuestLineItem key={line.productId} line={line} />)}
            </section>

            <aside className={styles.summary} aria-labelledby="summary-title">
              <h2 id="summary-title">خلاصه سفارش</h2>
              <dl>
                <div><dt>تعداد کالا</dt><dd>{itemCount.toLocaleString("fa-IR")}</dd></div>
                <div>
                  <dt>جمع کالاها</dt>
                  <dd>
                    {mode === "server"
                      ? toman(serverCart?.totalIrr ?? 0)
                      : guestTotalIrr === null
                        ? "پس از ورود بازبینی می‌شود"
                        : toman(guestTotalIrr)}
                  </dd>
                </div>
                {mode === "server" && (serverCart?.discountIrr ?? 0) > 0 ? (
                  <div><dt>تخفیف</dt><dd>{toman(serverCart?.discountIrr ?? 0)}</dd></div>
                ) : null}
                <div><dt>هزینه ارسال</dt><dd>در Checkout از روش واقعی ارسال محاسبه می‌شود</dd></div>
              </dl>
              {mode === "server" && serverCart?.lines.some((line) => !line.available) ? (
                <p className={styles.warning} role="alert">برای ادامه، تعداد کالاهای ناموجود را اصلاح کنید.</p>
              ) : null}
              <a className={styles.checkoutAction} href="/checkout">ادامه فرایند خرید</a>
              <p className={styles.checkoutNote}>
                قیمت، موجودی و هزینه ارسال در Server دوباره محاسبه می‌شوند.
              </p>
            </aside>
          </div>
        )}
      </Container>
    </main>
  );
}
