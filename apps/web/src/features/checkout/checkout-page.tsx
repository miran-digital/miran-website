"use client";

import { useEffect, useRef, useState } from "react";
import { Container } from "@miran/ui";
import {
  subscribeToServerCart,
  syncGuestCartToServer,
  type ServerCart,
} from "@/features/cart/persistent-cart";
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

type ShippingMethod = {
  id: string;
  code: string;
  name: string;
  description: string;
  priceIrr: number;
  freeOverIrr: number | null;
  appliedPriceIrr: number;
  minDeliveryDays: number | null;
  maxDeliveryDays: number | null;
  active: boolean;
};

type CreatedOrder = {
  id: string;
  status: "PENDING_PAYMENT" | "PAID" | "CANCELLED" | "PAYMENT_FAILED";
  subtotalIrr: number;
  discountIrr: number;
  shippingIrr: number;
  totalIrr: number;
  shippingMethodCode: string | null;
  shippingMethodName: string | null;
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

function deliveryLabel(method: ShippingMethod) {
  if (method.minDeliveryDays === null && method.maxDeliveryDays === null) return "زمان تحویل توسط مدیر فروشگاه تعیین نشده است.";
  if (method.minDeliveryDays === method.maxDeliveryDays && method.minDeliveryDays !== null) {
    return `${method.minDeliveryDays.toLocaleString("fa-IR")} روز کاری`;
  }
  if (method.minDeliveryDays !== null && method.maxDeliveryDays !== null) {
    return `${method.minDeliveryDays.toLocaleString("fa-IR")} تا ${method.maxDeliveryDays.toLocaleString("fa-IR")} روز کاری`;
  }
  return method.description || "ارسال قابل رهگیری";
}

export function CheckoutPage() {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<CheckoutStep>("address");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [cart, setCart] = useState<ServerCart | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [selectedShippingCode, setSelectedShippingCode] = useState("");
  const [shippingLoading, setShippingLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const idempotencyKey = useRef(createIdempotencyKey());

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeToServerCart((next) => {
      if (active && next) setCart(next);
    });

    async function load() {
      setLoading(true);
      setMessage("");
      try {
        const meResponse = await fetch("/api/auth/me", { cache: "no-store" });
        const meData = (await meResponse.json()) as { user?: CurrentUser | null };
        const currentUser = meResponse.ok ? meData.user ?? null : null;
        if (!active) return;
        setUser(currentUser);
        if (!currentUser) return;

        const [syncedCart, addressResponse] = await Promise.all([
          syncGuestCartToServer(),
          fetch("/api/addresses", { cache: "no-store" }),
        ]);
        if (!active) return;
        if (syncedCart) setCart(syncedCart);
        if (addressResponse.ok) {
          const data = (await addressResponse.json()) as { addresses: Address[] };
          setAddresses(data.addresses);
          const preferred = data.addresses.find((address) => Boolean(address.is_default)) ?? data.addresses[0];
          setSelectedAddressId(preferred?.id || "");
        }
      } catch {
        if (active) setMessage("آماده‌سازی Checkout انجام نشد؛ سبد شما حذف نشده است.");
      } finally {
        if (active) {
          setLoading(false);
          setReady(true);
        }
      }
    }

    void load();
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user || !cart || !selectedAddressId) {
      setShippingMethods([]);
      setSelectedShippingCode("");
      return;
    }
    let active = true;
    async function loadShipping() {
      setShippingLoading(true);
      setMessage("");
      try {
        const query = new URLSearchParams({
          addressId: selectedAddressId,
          merchandiseTotalIrr: String(cart?.totalIrr ?? 0),
        });
        const response = await fetch(`/api/shipping/methods?${query.toString()}`, { cache: "no-store" });
        const data = (await response.json()) as { methods?: ShippingMethod[]; message?: string };
        if (!response.ok) throw new Error(data.message || "shipping failed");
        if (!active) return;
        const methods = data.methods ?? [];
        setShippingMethods(methods);
        setSelectedShippingCode((current) =>
          methods.some((method) => method.code === current) ? current : methods[0]?.code || "",
        );
      } catch {
        if (active) {
          setShippingMethods([]);
          setSelectedShippingCode("");
          setMessage("روش ارسال فعالی برای این نشانی دریافت نشد.");
        }
      } finally {
        if (active) setShippingLoading(false);
      }
    }
    void loadShipping();
    return () => {
      active = false;
    };
  }, [user, cart, selectedAddressId]);

  const selectedAddress = addresses.find((address) => address.id === selectedAddressId) ?? null;
  const selectedShipping = shippingMethods.find((method) => method.code === selectedShippingCode) ?? null;
  const invalidCart = Boolean(cart?.lines.some((line) => !line.available));
  const estimatedTotalIrr = (cart?.totalIrr ?? 0) + (selectedShipping?.appliedPriceIrr ?? 0);
  const canCreateOrder =
    Boolean(user) &&
    Boolean(cart?.lines.length) &&
    !invalidCart &&
    Boolean(selectedAddress) &&
    Boolean(selectedShipping) &&
    !loading &&
    !shippingLoading &&
    !order;

  async function createOrder() {
    if (!canCreateOrder || !selectedAddress || !selectedShipping) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/checkout/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          addressId: selectedAddress.id,
          shippingMethodCode: selectedShipping.code,
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const data = (await response.json()) as { order?: CreatedOrder; message?: string };
      if (!response.ok || !data.order) {
        setMessage(data.message ?? "ثبت سفارش انجام نشد.");
        return;
      }
      setOrder(data.order);
      setMessage("سفارش واقعی ثبت شد و موجودی تا پایان مهلت پرداخت رزرو است.");
    } catch {
      setMessage("ثبت سفارش انجام نشد؛ سبد شما حفظ شده است.");
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
      const data = (await response.json()) as { payment?: PaymentStart; message?: string; error?: string };
      if (!response.ok || !data.payment?.redirectUrl) {
        setMessage(
          data.error === "PAYMENT_NOT_CONFIGURED"
            ? "زرین‌پال در کد آماده است اما Merchant ID این محیط هنوز تنظیم نشده است."
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

  if (!ready || loading && !user) {
    return (
      <main className={styles.page}>
        <Container size="wide"><div className={styles.state} role="status">در حال آماده‌سازی Checkout…</div></Container>
      </main>
    );
  }

  if (!user) {
    return (
      <main className={styles.page}>
        <Container size="wide">
          <div className={styles.state}>
            <h1>برای ثبت سفارش وارد حساب شوید</h1>
            <p>سبد مهمان شما حفظ می‌شود و پس از ورود فقط شناسه کالا و تعداد با Cart واقعی Server ادغام می‌شود.</p>
            <a href="/account?returnTo=/checkout">ورود یا ثبت‌نام</a>
          </div>
        </Container>
      </main>
    );
  }

  if (!cart || cart.lines.length === 0) {
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
          <p>Checkout واقعی Miran</p>
          <h1>تکمیل سفارش</h1>
          <p>قیمت کالا، تخفیف، موجودی و هزینه ارسال همگی هنگام ساخت Order داخل Backend دوباره محاسبه می‌شوند.</p>
        </header>

        <ol className={styles.steps} aria-label="مراحل Checkout">
          <li data-active={step === "address"}>۱. نشانی</li>
          <li data-active={step === "delivery"}>۲. روش ارسال</li>
          <li data-active={step === "review"}>۳. ثبت و پرداخت</li>
        </ol>

        <div className={styles.layout}>
          <section className={styles.panel} aria-live="polite">
            {step === "address" ? (
              <div className={styles.form}>
                <div className={styles.sectionHeading}>
                  <h2>نشانی ذخیره‌شده</h2>
                  <p>Backend مالکیت نشانی را هنگام Quote ارسال و ساخت Order دوباره بررسی می‌کند.</p>
                </div>
                {addresses.length === 0 ? (
                  <div className={styles.state}>
                    <p>هنوز نشانی در حساب شما ثبت نشده است.</p>
                    <a href="/account">افزودن نشانی</a>
                  </div>
                ) : (
                  addresses.map((address) => (
                    <label className={styles.option} key={address.id}>
                      <input
                        type="radio"
                        name="address"
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
                <button type="button" disabled={!selectedAddressId || shippingLoading} onClick={() => setStep("delivery")}>
                  ادامه به روش ارسال
                </button>
              </div>
            ) : null}

            {step === "delivery" ? (
              <div className={styles.form}>
                <div className={styles.sectionHeading}>
                  <h2>روش ارسال واقعی</h2>
                  <p>فقط روش‌هایی نمایش داده می‌شوند که مدیر در Database فعال کرده است؛ هیچ هزینه ساختگی اضافه نمی‌شود.</p>
                </div>
                {shippingLoading ? <p>در حال دریافت روش‌های ارسال…</p> : null}
                {!shippingLoading && shippingMethods.length === 0 ? (
                  <div className={styles.paymentBoundary} role="alert">
                    <strong>روش ارسال فعال وجود ندارد</strong>
                    <p>مدیر فروشگاه باید حداقل یک روش ارسال و مبلغ واقعی آن را در پنل مدیریت تعریف کند.</p>
                  </div>
                ) : null}
                {shippingMethods.map((method) => (
                  <label className={styles.option} key={method.id}>
                    <input
                      type="radio"
                      name="shipping"
                      value={method.code}
                      checked={selectedShippingCode === method.code}
                      onChange={() => setSelectedShippingCode(method.code)}
                    />
                    <span>
                      <strong>{method.name} — {method.appliedPriceIrr === 0 ? "رایگان" : toman(method.appliedPriceIrr)}</strong>
                      <small>{method.description || deliveryLabel(method)} · {deliveryLabel(method)}</small>
                      {method.freeOverIrr !== null ? <small>ارسال رایگان از {toman(method.freeOverIrr)}</small> : null}
                    </span>
                  </label>
                ))}
                <div className={styles.actions}>
                  <button type="button" onClick={() => setStep("address")}>بازگشت</button>
                  <button type="button" disabled={!selectedShipping} onClick={() => setStep("review")}>مرور نهایی</button>
                </div>
              </div>
            ) : null}

            {step === "review" ? (
              <div className={styles.review}>
                <div className={styles.sectionHeading}>
                  <h2>مرور نهایی و رزرو موجودی</h2>
                  <p>عدد نهایی این صفحه فقط نمایش Quote است؛ مبلغ قطعی دوباره داخل Transaction ساخت Order محاسبه می‌شود.</p>
                </div>

                {selectedAddress ? (
                  <section>
                    <h3>تحویل به</h3>
                    <p>{selectedAddress.full_name}</p>
                    <p>{selectedAddress.province}، {selectedAddress.city}، {selectedAddress.address_line}</p>
                    <button type="button" onClick={() => setStep("address")}>تغییر نشانی</button>
                  </section>
                ) : null}

                {selectedShipping ? (
                  <section>
                    <h3>ارسال</h3>
                    <p>{selectedShipping.name} — {selectedShipping.appliedPriceIrr === 0 ? "رایگان" : toman(selectedShipping.appliedPriceIrr)}</p>
                    <p>{deliveryLabel(selectedShipping)}</p>
                    <button type="button" onClick={() => setStep("delivery")}>تغییر روش ارسال</button>
                  </section>
                ) : null}

                {invalidCart ? (
                  <div className={styles.paymentBoundary} role="alert">
                    <strong>سبد نیازمند اصلاح است</strong>
                    <p>موجودی حداقل یکی از کالاها برای تعداد انتخاب‌شده کافی نیست.</p>
                    <a href="/cart">بازگشت به سبد</a>
                  </div>
                ) : null}

                {order ? (
                  <div className={styles.paymentBoundary} role="status">
                    <strong>Order واقعی ساخته شد</strong>
                    <p>شماره سفارش: <bdi dir="ltr">{order.id}</bdi></p>
                    <p>روش ارسال: {order.shippingMethodName ?? "—"}</p>
                    <p>هزینه ارسال: {toman(order.shippingIrr)}</p>
                    <p>مبلغ قابل پرداخت: {toman(order.totalIrr)}</p>
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
                  <strong>پرداخت فقط با Verify موفق نهایی می‌شود</strong>
                  <p>بازگشت مرورگر از درگاه به‌تنهایی سفارش را Paid نمی‌کند؛ Backend Authority و مبلغ Order را با زرین‌پال Verify می‌کند.</p>
                </div>
              </div>
            ) : null}

            {message ? <p role="status">{message}</p> : null}
          </section>

          <aside className={styles.summary} aria-labelledby="checkout-summary">
            <h2 id="checkout-summary">خلاصه Server</h2>
            <ul>
              {cart.lines.map((line) => (
                <li key={line.productId}>
                  <span>{line.title} × {line.quantity.toLocaleString("fa-IR")}</span>
                  <strong>{toman(line.pricing.finalIrr * line.quantity)}</strong>
                </li>
              ))}
            </ul>
            <div className={styles.total}><span>کالاها</span><strong>{toman(cart.totalIrr)}</strong></div>
            {cart.discountIrr > 0 ? <p>تخفیف کالاها: {toman(cart.discountIrr)}</p> : null}
            <p>ارسال: {selectedShipping ? (selectedShipping.appliedPriceIrr === 0 ? "رایگان" : toman(selectedShipping.appliedPriceIrr)) : "انتخاب نشده"}</p>
            <div className={styles.total}><span>جمع Quote</span><strong>{toman(estimatedTotalIrr)}</strong></div>
            <p>مبلغ قطعی Order فقط از Database و داخل Backend ساخته می‌شود.</p>
          </aside>
        </div>
      </Container>
    </main>
  );
}
