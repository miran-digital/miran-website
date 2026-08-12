"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Container } from "@miran/ui";
import {
  createEmptyGuestCart,
  getGuestCart,
  subscribeToGuestCart,
  type GuestCart,
} from "@/features/cart/guest-cart";
import styles from "./checkout.module.css";

type CheckoutStep = "address" | "delivery" | "review";
type Address = {
  fullName: string;
  email: string;
  phone: string;
  addressLine: string;
  city: string;
  postcode: string;
};

const emptyAddress: Address = {
  fullName: "",
  email: "",
  phone: "",
  addressLine: "",
  city: "",
  postcode: "",
};

function formatMoney(amountMinor: number, currency: string) {
  const formatter = new Intl.NumberFormat("fa-IR", {
    style: "currency",
    currency,
  });
  const minorDigits = formatter.resolvedOptions().maximumFractionDigits ?? 0;
  return formatter.format(amountMinor / 10 ** minorDigits);
}

export function CheckoutPage() {
  const [cart, setCart] = useState<GuestCart>(createEmptyGuestCart);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<CheckoutStep>("address");
  const [address, setAddress] = useState<Address>(emptyAddress);
  const [delivery, setDelivery] = useState("standard");

  useEffect(() => {
    const sync = () => {
      setCart(getGuestCart());
      setReady(true);
    };
    sync();
    return subscribeToGuestCart(sync);
  }, []);

  const currency = cart.lines[0]?.currency ?? "GBP";
  const hasMixedCurrencies = cart.lines.some(
    (line) => line.currency !== currency,
  );
  const subtotalMinor = useMemo(
    () =>
      cart.lines.reduce(
        (total, line) => total + line.unitPriceMinor * line.quantity,
        0,
      ),
    [cart.lines],
  );

  function updateAddress(field: keyof Address, value: string) {
    setAddress((current) => ({ ...current, [field]: value }));
  }

  function submitAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (event.currentTarget.reportValidity()) setStep("delivery");
  }

  if (!ready) {
    return (
      <main className={styles.page}>
        <Container size="wide">
          <div className={styles.state} role="status">
            در حال آماده‌سازی Checkout…
          </div>
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
          <a href="/">خانه</a>
          <span aria-hidden="true">/</span>
          <a href="/cart">سبد خرید</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Checkout</span>
        </nav>
        <header className={styles.header}>
          <p>خرید امن</p>
          <h1>تکمیل سفارش</h1>
          <p>
            اطلاعات این نسخه آزمایشی فقط در حافظه همین صفحه نگه‌داری می‌شود و
            ارسال نخواهد شد.
          </p>
        </header>

        <ol className={styles.steps} aria-label="مراحل Checkout">
          <li data-active={step === "address"}>۱. نشانی</li>
          <li data-active={step === "delivery"}>۲. تحویل</li>
          <li data-active={step === "review"}>۳. مرور سفارش</li>
        </ol>

        <div className={styles.layout}>
          <section className={styles.panel} aria-live="polite">
            {step === "address" ? (
              <form className={styles.form} onSubmit={submitAddress}>
                <div className={styles.sectionHeading}>
                  <h2>اطلاعات تماس و نشانی</h2>
                  <p>همه فیلدهای این مرحله الزامی‌اند.</p>
                </div>
                <label>
                  <span>نام و نام خانوادگی</span>
                  <input
                    required
                    autoComplete="name"
                    value={address.fullName}
                    onChange={(event) =>
                      updateAddress("fullName", event.target.value)
                    }
                  />
                </label>
                <div className={styles.twoColumns}>
                  <label>
                    <span>ایمیل</span>
                    <input
                      required
                      type="email"
                      autoComplete="email"
                      dir="ltr"
                      value={address.email}
                      onChange={(event) =>
                        updateAddress("email", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span>شماره تماس</span>
                    <input
                      required
                      type="tel"
                      autoComplete="tel"
                      dir="ltr"
                      value={address.phone}
                      onChange={(event) =>
                        updateAddress("phone", event.target.value)
                      }
                    />
                  </label>
                </div>
                <label>
                  <span>نشانی</span>
                  <textarea
                    required
                    autoComplete="street-address"
                    rows={3}
                    value={address.addressLine}
                    onChange={(event) =>
                      updateAddress("addressLine", event.target.value)
                    }
                  />
                </label>
                <div className={styles.twoColumns}>
                  <label>
                    <span>شهر</span>
                    <input
                      required
                      autoComplete="address-level2"
                      value={address.city}
                      onChange={(event) =>
                        updateAddress("city", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span>کد پستی</span>
                    <input
                      required
                      autoComplete="postal-code"
                      dir="ltr"
                      value={address.postcode}
                      onChange={(event) =>
                        updateAddress("postcode", event.target.value)
                      }
                    />
                  </label>
                </div>
                <button type="submit">ادامه به روش تحویل</button>
              </form>
            ) : null}

            {step === "delivery" ? (
              <div className={styles.form}>
                <div className={styles.sectionHeading}>
                  <h2>روش تحویل</h2>
                  <p>قیمت و زمان قطعی بعداً از سرویس ارسال دریافت خواهد شد.</p>
                </div>
                <label className={styles.option}>
                  <input
                    type="radio"
                    name="delivery"
                    value="standard"
                    checked={delivery === "standard"}
                    onChange={(event) => setDelivery(event.target.value)}
                  />
                  <span>
                    <strong>ارسال استاندارد</strong>
                    <small>
                      قابل رهگیری؛ زمان و هزینه پس از اتصال Logistics
                    </small>
                  </span>
                </label>
                <label className={styles.option}>
                  <input
                    type="radio"
                    name="delivery"
                    value="priority"
                    checked={delivery === "priority"}
                    onChange={(event) => setDelivery(event.target.value)}
                  />
                  <span>
                    <strong>ارسال سریع</strong>
                    <small>در صورت پشتیبانی نشانی و فروشنده</small>
                  </span>
                </label>
                <div className={styles.actions}>
                  <button type="button" onClick={() => setStep("address")}>
                    بازگشت
                  </button>
                  <button type="button" onClick={() => setStep("review")}>
                    مرور سفارش
                  </button>
                </div>
              </div>
            ) : null}

            {step === "review" ? (
              <div className={styles.review}>
                <div className={styles.sectionHeading}>
                  <h2>مرور نهایی</h2>
                  <p>پیش از اتصال پرداخت، اطلاعات را کنترل کنید.</p>
                </div>
                <section>
                  <h3>تحویل به</h3>
                  <p>{address.fullName}</p>
                  <p>{address.addressLine}</p>
                  <p>
                    {address.city}، {address.postcode}
                  </p>
                  <button type="button" onClick={() => setStep("address")}>
                    ویرایش نشانی
                  </button>
                </section>
                <section>
                  <h3>روش تحویل</h3>
                  <p>
                    {delivery === "priority" ? "ارسال سریع" : "ارسال استاندارد"}
                  </p>
                  <button type="button" onClick={() => setStep("delivery")}>
                    ویرایش روش تحویل
                  </button>
                </section>
                <div className={styles.paymentBoundary} role="note">
                  <strong>پرداخت هنوز متصل نیست</strong>
                  <p>
                    پس از انتخاب درگاه و backend سفارش، پرداخت امن و ثبت سفارش
                    در این بخش فعال می‌شود.
                  </p>
                </div>
                <button type="button" disabled>
                  پرداخت و ثبت سفارش
                </button>
              </div>
            ) : null}
          </section>

          <aside className={styles.summary} aria-labelledby="checkout-summary">
            <h2 id="checkout-summary">خلاصه سبد</h2>
            <ul>
              {cart.lines.map((line) => (
                <li key={line.productId}>
                  <span>
                    {line.title} × {line.quantity.toLocaleString("fa-IR")}
                  </span>
                  <strong>
                    {formatMoney(
                      line.unitPriceMinor * line.quantity,
                      line.currency,
                    )}
                  </strong>
                </li>
              ))}
            </ul>
            <div className={styles.total}>
              <span>جمع کالاها</span>
              <strong>
                {hasMixedCurrencies
                  ? "نیازمند بازبینی"
                  : formatMoney(subtotalMinor, currency)}
              </strong>
            </div>
            <p>
              هزینه ارسال و مالیات پس از اتصال سرویس‌های مربوط محاسبه می‌شود.
            </p>
          </aside>
        </div>
      </Container>
    </main>
  );
}
