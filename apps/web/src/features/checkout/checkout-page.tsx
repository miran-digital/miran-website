"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Container } from "@miran/ui";
import {
  createEmptyGuestCart,
  getGuestCart,
  subscribeToGuestCart,
  type GuestCart,
} from "@/features/cart/guest-cart";
import styles from "./checkout.module.css";

type CheckoutStep = "address" | "delivery" | "review";

type CurrentUser = {
  id: string;
  email: string;
  role: string;
};

type Address = {
  id: string;
  label: string;
  full_name: string;
  phone: string;
  province: string;
  city: string;
  address_line: string;
  postal_code: string;
  is_default: number;
};

type ServerProduct = {
  id: string;
  slug: string;
  title: string;
  pricing: {
    baseIrr: number;
    finalIrr: number;
    discountIrr: number;
  };
  currency: "IRR";
  inStock: boolean;
  availableQuantity: number;
};

type ResolvedLine = {
  productId: string;
  quantity: number;
  product: ServerProduct | null;
  error: string | null;
};

type CreatedOrder = {
  id: string;
  status: "PENDING_PAYMENT" | "PAID" | "CANCELLED" | "PAYMENT_FAILED";
  subtotal_irr: number;
  discount_irr: number;
  total_irr: number;
};

type PaymentStart = {
  paymentId: string;
  orderId: string;
  authority: string;
  redirectUrl: string;
  reused: boolean;
};

function toman(irr: number) {
  return `${Math.round(irr / 10).toLocaleString("fa-IR")} تومان`;
}

function createIdempotencyKey() {
  return typeof crypto.randomUUID === "function"
    ? `checkout-${crypto.randomUUID()}`
    : `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CheckoutPage() {
  const [cart, setCart] = useState<GuestCart>(createEmptyGuestCart);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<CheckoutStep>("address");
  const [delivery, setDelivery] = useState("standard");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [resolvedLines, setResolvedLines] = useState<ResolvedLine[]>([]);
  const [message, setMessage] = useState("");
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const idempotencyKey = useRef(createIdempotencyKey());

  useEffect(() => {
    const sync = () => {
      setCart(getGuestCart());
      setReady(true);
    };
    sync();
    return subscribeToGuestCart(sync);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let active = true;

    async function loadServerState() {
      setLoading(true);
      setMessage("");
      try {
        const meResponse = await fetch("/api/auth/me", { cache: "no-store" });
        const meData = (await meResponse.json()) as { user?: CurrentUser | null };
        const currentUser = meResponse.ok ? meData.user ?? null : null;
        if (!active) return;
        setUser(currentUser);

        if (currentUser) {
          const addressResponse = await fetch("/api/addresses", { cache: "no-store" });
          if (addressResponse.ok) {
            const addressData = (await addressResponse.json()) as { addresses: Address[] };
            if (active) {
              setAddresses(addressData.addresses);
              const preferred =
                addressData.addresses.find((address) => Boolean(address.is_default)) ??
                addressData.addresses[0];
              setSelectedAddressId((current) => current || preferred?.id || "");
            }
          }
        } else if (active) {
          setAddresses([]);
          setSelectedAddressId("");
        }

        const lines = await Promise.all(
          cart.lines.map(async (line): Promise<ResolvedLine> => {
            try {
              const response = await fetch(
                `/api/catalog/products/${encodeURIComponent(line.productId)}`,
                { cache: "no-store" },
              );
              if (!response.ok) {
                return {
                  productId: line.productId,
                  quantity: line.quantity,
                  product: null,
                  error: "این کالا در Catalog واقعی پیدا نشد.",
                };
              }
              const data = (await response.json()) as { product: ServerProduct };
              if (!data.product.inStock || data.product.availableQuantity < line.quantity) {
                return {
                  productId: line.productId,
                  quantity: line.quantity,
                  product: data.product,
                  error: "موجودی این کالا برای تعداد انتخاب‌شده کافی نیست.",
                };
              }
              return {
                productId: line.productId,
                quantity: line.quantity,
                product: data.product,
                error: null,
              };
            } catch {
              return {
                productId: line.productId,
                quantity: line.quantity,
                product: null,
                error: "بررسی این کالا با Backend انجام نشد.",
              };
            }
          }),
        );
        if (active) setResolvedLines(lines);
      } catch {
        if (active) setMessage("آماده‌سازی Checkout واقعی انجام نشد.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadServerState();
    return () => {
      active = false;
    };
  }, [cart.lines, ready]);

  const invalidLines = resolvedLines.filter((line) => line.error);
  const validLines = resolvedLines.filter(
    (line): line is ResolvedLine & { product: ServerProduct } =>
      Boolean(line.product) && !line.error,
  );

  const totals = useMemo(() => {
    return validLines.reduce(
      (result, line) => {
        result.baseIrr += line.product.pricing.baseIrr * line.quantity;
        result.discountIrr += line.product.pricing.discountIrr * line.quantity;
        result.finalIrr += line.product.pricing.finalIrr * line.quantity;
        return result;
      },
      { baseIrr: 0, discountIrr: 0, finalIrr: 0 },
    );
  }, [validLines]);

  const selectedAddress = addresses.find((address) => address.id === selectedAddressId) ?? null;
  const canCreateOrder =
    Boolean(user) &&
    Boolean(selectedAddress) &&
    cart.lines.length > 0 &&
    resolvedLines.length === cart.lines.length &&
    invalidLines.length === 0 &&
    !loading &&
    !order;

  async function createOrder() {
    if (!canCreateOrder || !selectedAddress) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/checkout/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          addressId: selectedAddress.id,
          idempotencyKey: idempotencyKey.current,
          items: validLines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
          })),
        }),
      });
      const data = (await response.json()) as {
        order?: CreatedOrder;
        message?: string;
      };
      if (!response.ok || !data.order) {
        setMessage(data.message ?? "ثبت سفارش انجام نشد.");
        return;
      }
      setOrder(data.order);
      setMessage("سفارش ثبت و موجودی آن برای پرداخت رزرو شد.");
    } catch {
      setMessage("ثبت سفارش انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function startPayment() {
    if (!order || order.status !== "PENDING_PAYMENT") return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/payments/zarinpal/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const data = (await response.json()) as {
        payment?: PaymentStart;
        message?: string;
        error?: string;
      };
      if (!response.ok || !data.payment?.redirectUrl) {
        setMessage(
          data.error === "PAYMENT_NOT_CONFIGURED"
            ? "درگاه زرین‌پال آماده است اما Merchant ID واقعی هنوز در Environment سرور تنظیم نشده است."
            : data.message ?? "شروع پرداخت انجام نشد.",
        );
        return;
      }
      window.location.assign(data.payment.redirectUrl);
    } catch {
      setMessage("ارتباط با درگاه پرداخت برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <main className={styles.page}>
        <Container size="wide">
          <div className={styles.state} role="status">در حال آماده‌سازی Checkout…</div>
        </Container>
      </main>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <main className={styles.page}>
        <Container size="wide">
          <div className={styles.state}>
            <h1>سبد خرید خالی است</h1>
            <p>برای ادامه ابتدا یک کالا به سبد خرید اضافه کنید.</p>
            <a href="/categories">مشاهده محصولات</a>
          </div>
        </Container>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <Container size="wide">
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <a href="/">خانه</a><span aria-hidden="true">/</span>
          <a href="/cart">سبد خرید</a><span aria-hidden="true">/</span>
          <span aria-current="page">تکمیل سفارش</span>
        </nav>

        <header className={styles.header}>
          <p>Checkout Server-authoritative</p>
          <h1>تکمیل سفارش</h1>
          <p>
            قیمت، تخفیف و موجودی دوباره از Backend دریافت می‌شوند و پرداخت زرین‌پال فقط مبلغ ذخیره‌شده روی Order را Verify می‌کند.
          </p>
        </header>

        {!user ? (
          <div className={styles.state}>
            <h2>برای ثبت سفارش وارد حساب شوید</h2>
            <p>سبد شما حذف نمی‌شود؛ پس از ورود می‌توانید Checkout را ادامه دهید.</p>
            <a href="/account?returnTo=/checkout">ورود یا ثبت‌نام</a>
          </div>
        ) : null}

        {user ? (
          <>
            <ol className={styles.steps} aria-label="مراحل Checkout">
              <li data-active={step === "address"}>۱. نشانی</li>
              <li data-active={step === "delivery"}>۲. تحویل</li>
              <li data-active={step === "review"}>۳. ثبت و پرداخت</li>
            </ol>

            <div className={styles.layout}>
              <section className={styles.panel} aria-live="polite">
                {step === "address" ? (
                  <div className={styles.form}>
                    <div className={styles.sectionHeading}>
                      <h2>نشانی ذخیره‌شده</h2>
                      <p>Order فقط با نشانی متعلق به همین حساب قابل ثبت است.</p>
                    </div>
                    {addresses.length === 0 ? (
                      <div className={styles.state}>
                        <p>هنوز نشانی واقعی در حساب شما ثبت نشده است.</p>
                        <a href="/account">افزودن نشانی در حساب</a>
                      </div>
                    ) : (
                      addresses.map((address) => (
                        <label className={styles.option} key={address.id}>
                          <input
                            type="radio"
                            name="address"
                            value={address.id}
                            checked={selectedAddressId === address.id}
                            onChange={() => setSelectedAddressId(address.id)}
                          />
                          <span>
                            <strong>{address.label}{address.is_default ? " — پیش‌فرض" : ""}</strong>
                            <small>{address.full_name}، {address.province}، {address.city}، {address.address_line}، {address.postal_code}</small>
                          </span>
                        </label>
                      ))
                    )}
                    <button type="button" disabled={!selectedAddressId || loading} onClick={() => setStep("delivery")}>
                      ادامه به روش تحویل
                    </button>
                  </div>
                ) : null}

                {step === "delivery" ? (
                  <div className={styles.form}>
                    <div className={styles.sectionHeading}>
                      <h2>روش تحویل</h2>
                      <p>هزینه و SLA نهایی بعداً از Logistics Service خوانده می‌شود؛ مبلغ ساختگی به Order اضافه نمی‌کنیم.</p>
                    </div>
                    <label className={styles.option}>
                      <input type="radio" name="delivery" value="standard" checked={delivery === "standard"} onChange={(event) => setDelivery(event.target.value)} />
                      <span><strong>ارسال استاندارد</strong><small>قابل رهگیری؛ هزینه نهایی بعد از اتصال Logistics.</small></span>
                    </label>
                    <label className={styles.option}>
                      <input type="radio" name="delivery" value="priority" checked={delivery === "priority"} onChange={(event) => setDelivery(event.target.value)} />
                      <span><strong>ارسال سریع</strong><small>پس از اتصال Logistics و بررسی محدوده فعال می‌شود.</small></span>
                    </label>
                    <div className={styles.actions}>
                      <button type="button" onClick={() => setStep("address")}>بازگشت</button>
                      <button type="button" onClick={() => setStep("review")}>مرور نهایی</button>
                    </div>
                  </div>
                ) : null}

                {step === "review" ? (
                  <div className={styles.review}>
                    <div className={styles.sectionHeading}>
                      <h2>مرور، رزرو موجودی و پرداخت</h2>
                      <p>ابتدا Order واقعی ساخته می‌شود؛ سپس زرین‌پال برای همان Order و همان مبلغ Database شروع می‌شود.</p>
                    </div>

                    {selectedAddress ? (
                      <section>
                        <h3>تحویل به</h3>
                        <p>{selectedAddress.full_name}</p>
                        <p>{selectedAddress.province}، {selectedAddress.city}، {selectedAddress.address_line}</p>
                        <p><bdi dir="ltr">{selectedAddress.postal_code}</bdi></p>
                        <button type="button" onClick={() => setStep("address")}>تغییر نشانی</button>
                      </section>
                    ) : null}

                    {invalidLines.length > 0 ? (
                      <div className={styles.paymentBoundary} role="alert">
                        <strong>سبد نیازمند اصلاح است</strong>
                        {invalidLines.map((line) => (
                          <p key={line.productId}>{line.product?.title ?? line.productId}: {line.error}</p>
                        ))}
                      </div>
                    ) : null}

                    {order ? (
                      <div className={styles.paymentBoundary} role="status">
                        <strong>Order واقعی ساخته شد</strong>
                        <p>شماره سفارش: <bdi dir="ltr">{order.id}</bdi></p>
                        <p>وضعیت: {order.status}</p>
                        <p>مبلغ قابل پرداخت: {toman(order.total_irr)}</p>
                        <p>موجودی برای این سفارش رزرو شده است؛ سبد تا تأیید پرداخت پاک نمی‌شود.</p>
                        {order.status === "PENDING_PAYMENT" ? (
                          <button type="button" disabled={loading} onClick={() => void startPayment()}>
                            {loading ? "در حال اتصال به زرین‌پال…" : "پرداخت امن با زرین‌پال"}
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <button type="button" disabled={!canCreateOrder} onClick={() => void createOrder()}>
                        {loading ? "در حال ثبت…" : "ثبت سفارش و رزرو موجودی"}
                      </button>
                    )}

                    <div className={styles.paymentBoundary} role="note">
                      <strong>پرداخت فقط پس از Verify موفق ثبت می‌شود</strong>
                      <p>بازگشت از درگاه به‌تنهایی کافی نیست؛ Backend Authority و مبلغ Order را دوباره با زرین‌پال Verify می‌کند.</p>
                    </div>
                  </div>
                ) : null}
                {message ? <p role="status">{message}</p> : null}
              </section>

              <aside className={styles.summary} aria-labelledby="checkout-summary">
                <h2 id="checkout-summary">خلاصه Server</h2>
                <ul>
                  {resolvedLines.map((line) => (
                    <li key={line.productId}>
                      <span>{line.product?.title ?? line.productId} × {line.quantity.toLocaleString("fa-IR")}</span>
                      <strong>{line.product ? toman(line.product.pricing.finalIrr * line.quantity) : "نامعتبر"}</strong>
                    </li>
                  ))}
                </ul>
                <div className={styles.total}>
                  <span>جمع کالاها</span>
                  <strong>{toman(totals.finalIrr)}</strong>
                </div>
                {totals.discountIrr > 0 ? <p>سود شما از تخفیف: {toman(totals.discountIrr)}</p> : null}
                <p>قیمت نهایی هنگام ساخت Order و Verify پرداخت از Database خوانده می‌شود.</p>
              </aside>
            </div>
          </>
        ) : null}
      </Container>
    </main>
  );
}
