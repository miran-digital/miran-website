"use client";

import type { PublicPaymentProvider } from "@/lib/payments/provider-catalog";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Container } from "@/components/ui";
import type { CustomerAddress } from "@/features/account/address-types";
import {
  clearGuestCart,
  createEmptyGuestCart,
  getGuestCart,
  getGuestCartLineKey,
  subscribeToGuestCart,
  type GuestCart,
} from "@/features/cart/guest-cart";
import type {
  DeliveryMethod,
  OrderStatus,
  PaymentStatus,
} from "@/features/orders/order-types";
import { formatCalendarDateTime, type CalendarMode } from "@/lib/jalali";
import { formatMoney, getDeliveryPriceMinor, IRAN_CURRENCY, type DeliveryFeeSettings } from "@/lib/money";
import {
  formatCardNumber,
  isBankTransferConfigured,
  type BankTransferSettings,
} from "@/lib/bank-transfer";
import styles from "./checkout.module.css";

type CheckoutStep = "address" | "delivery" | "review" | "success";
type Coordinates = { latitude: number; longitude: number } | null;
type OrderConfirmation = {
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalMinor: number;
  currency: string;
  createdAt: string;
};

export function CheckoutPage({
  calendarMode,
  deliveryFees,
  bankTransfer,
  customerEmail,
  initialAddresses,
}: {
  calendarMode: CalendarMode;
  deliveryFees: DeliveryFeeSettings;
  bankTransfer: BankTransferSettings;
  customerEmail: string;
  initialAddresses: CustomerAddress[];
}) {
  const initialSelectedId =
    initialAddresses.find((address) => address.isDefault)?.id ??
    initialAddresses[0]?.id ??
    "";
  const [cart, setCart] = useState<GuestCart>(createEmptyGuestCart);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<CheckoutStep>("address");
  const [addresses, setAddresses] = useState(initialAddresses);
  const [selectedAddressId, setSelectedAddressId] = useState(initialSelectedId);
  const [showAddressForm, setShowAddressForm] = useState(initialAddresses.length === 0);
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressStatus, setAddressStatus] = useState(
    initialAddresses.length ? "نشانی پیش‌فرض انتخاب شده است." : "برای ادامه یک نشانی ثبت کنید.",
  );
  const [coordinates, setCoordinates] = useState<Coordinates>(null);
  const [delivery, setDelivery] = useState<DeliveryMethod>("standard");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);
  const [paymentProviders, setPaymentProviders] = useState<PublicPaymentProvider[]>([]);
  const [selectedPaymentProvider, setSelectedPaymentProvider] = useState("");
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState("");
  const paymentEnabled = paymentProviders.length > 0;
  const activePaymentProvider = paymentProviders.some((provider) => provider.id === selectedPaymentProvider)
    ? selectedPaymentProvider : paymentProviders[0]?.id ?? "";
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptStatus, setReceiptStatus] = useState("");
  const [receiptSubmitted, setReceiptSubmitted] = useState(false);
  const [website, setWebsite] = useState("");
  const idempotencyKey = useRef("");

  useEffect(() => {
    const sync = () => {
      setCart(getGuestCart());
      setReady(true);
    };
    sync();
    return subscribeToGuestCart(sync);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/payments/capability", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { providers?: PublicPaymentProvider[]; reason?: string };
        if (!response.ok || !Array.isArray(payload.providers) || payload.reason === "configuration_unavailable") throw new Error("دریافت وضعیت درگاه‌ها موقتاً ممکن نیست.");
        if (!controller.signal.aborted) setPaymentProviders(payload.providers);
      })
      .catch(() => { if (!controller.signal.aborted) setProvidersError("دریافت وضعیت درگاه‌ها موقتاً ممکن نیست."); })
      .finally(() => { if (!controller.signal.aborted) setProvidersLoading(false); });
    return () => controller.abort();
  }, []);

  const selectedAddress = useMemo(
    () => addresses.find((address) => address.id === selectedAddressId) ?? null,
    [addresses, selectedAddressId],
  );
  const currency = cart.lines[0]?.currency ?? IRAN_CURRENCY;
  const hasInvalidCurrency = cart.lines.some(
    (line) => line.currency !== currency || line.currency !== IRAN_CURRENCY,
  );
  const subtotalMinor = useMemo(
    () => cart.lines.reduce(
      (total, line) => total + line.unitPriceMinor * line.quantity,
      0,
    ),
    [cart.lines],
  );
  const deliveryMinor = getDeliveryPriceMinor(currency, delivery, deliveryFees);
  const totalMinor = subtotalMinor + deliveryMinor;

  function requestLocation() {
    if (!("geolocation" in navigator)) {
      setAddressStatus("مرورگر شما دریافت موقعیت را پشتیبانی نمی‌کند؛ نشانی را دستی ثبت کنید.");
      return;
    }
    setAddressStatus("در انتظار اجازه دسترسی به موقعیت…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setAddressStatus("موقعیت آماده است و فقط پس از ذخیره نشانی ثبت می‌شود.");
      },
      () => setAddressStatus("موقعیت دریافت نشد؛ ثبت نشانی دستی همچنان امکان‌پذیر است."),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity() || addressBusy) return;
    const data = new FormData(form);
    setAddressBusy(true);
    setAddressStatus("در حال ذخیره نشانی…");
    try {
      const response = await fetch("/api/account/addresses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: String(data.get("label") ?? ""),
          recipientName: String(data.get("recipientName") ?? ""),
          phone: String(data.get("phone") ?? ""),
          province: String(data.get("province") ?? ""),
          city: String(data.get("city") ?? ""),
          postcode: String(data.get("postcode") ?? ""),
          addressLine: String(data.get("addressLine") ?? ""),
          latitude: coordinates?.latitude ?? null,
          longitude: coordinates?.longitude ?? null,
          isDefault: addresses.length === 0 || data.get("isDefault") === "on",
        }),
      });
      const payload = (await response.json()) as {
        address?: CustomerAddress;
        error?: string;
      };
      if (!response.ok || !payload.address) {
        throw new Error(payload.error || "ذخیره نشانی ممکن نشد.");
      }
      const next = payload.address;
      setAddresses((items) => [
        next,
        ...items
          .filter((item) => item.id !== next.id)
          .map((item) => next.isDefault ? { ...item, isDefault: false } : item),
      ]);
      setSelectedAddressId(next.id);
      setCoordinates(null);
      setShowAddressForm(false);
      form.reset();
      setAddressStatus("نشانی ذخیره و برای این سفارش انتخاب شد.");
    } catch (error) {
      setAddressStatus(error instanceof Error ? error.message : "ذخیره نشانی ممکن نشد.");
    } finally {
      setAddressBusy(false);
    }
  }

  function continueFromAddress() {
    if (!selectedAddress) {
      setAddressStatus("برای ادامه یک نشانی معتبر انتخاب یا ثبت کنید.");
      return;
    }
    setAddressStatus("");
    setStep("delivery");
  }

  async function submitOrder() {
    if (submitting || hasInvalidCurrency || !selectedAddress) return;
    setSubmitting(true);
    setSubmitError("");
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKey.current,
          website,
          addressId: selectedAddress.id,
          deliveryMethod: delivery,
          lines: cart.lines.map((line) => ({
            productId: line.productId,
            slug: line.slug,
            quantity: line.quantity,
            variantId: line.variantId,
            sellerOfferId: line.sellerOfferId,
          })),
        }),
      });
      const payload = (await response.json()) as {
        order?: OrderConfirmation;
        error?: string;
      };
      if (!response.ok || !payload.order) {
        throw new Error(payload.error || "ثبت سفارش ممکن نشد.");
      }
      setConfirmation(payload.order);
      setStep("success");
      clearGuestCart();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "ثبت سفارش ممکن نشد.");
    } finally {
      setSubmitting(false);
    }
  }

  async function startPayment() {
    if (!confirmation || paymentLoading || !activePaymentProvider || receiptBusy || receiptSubmitted) return;
    setPaymentLoading(true);
    setPaymentError("");
    try {
      const response = await fetch("/api/payments/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderNumber: confirmation.orderNumber, provider: activePaymentProvider }),
      });
      const payload = (await response.json()) as { redirectUrl?: string; error?: string };
      if (!response.ok || !payload.redirectUrl) {
        throw new Error(payload.error || "شروع پرداخت ممکن نشد.");
      }
      window.location.assign(payload.redirectUrl);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "شروع پرداخت ممکن نشد.");
      setPaymentLoading(false);
      // Refresh availability only; never retry a payment automatically.
      void fetch("/api/payments/capability", { cache: "no-store" })
        .then((response) => response.json())
        .then((payload: { providers?: PublicPaymentProvider[] }) => { if (Array.isArray(payload.providers)) setPaymentProviders(payload.providers); })
        .catch(() => undefined);
    }
  }

  async function submitReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmation || receiptBusy || receiptSubmitted) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const file = data.get("receipt");
    if (!(file instanceof File) || file.size <= 0) {
      setReceiptStatus("فایل فیش را انتخاب کنید.");
      return;
    }
    if (file.size > 5_000_000) {
      setReceiptStatus("حجم فایل فیش باید حداکثر ۵ مگابایت باشد.");
      return;
    }
    data.set("orderNumber", confirmation.orderNumber);
    setReceiptBusy(true);
    setReceiptStatus("در حال ارسال امن فیش…");
    try {
      const response = await fetch("/api/payments/bank-transfer/receipt", {
        method: "POST",
        body: data,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "ارسال فیش ممکن نشد.");
      setReceiptSubmitted(true);
      setReceiptStatus("فیش با موفقیت ارسال شد و در انتظار بررسی مالک یا مدیر سفارش است. پرداخت هنوز تأیید نشده است.");
      setConfirmation((current) => current ? { ...current, paymentStatus: "pending" } : current);
      form.reset();
    } catch (error) {
      setReceiptStatus(error instanceof Error ? error.message : "ارسال فیش ممکن نشد.");
    } finally {
      setReceiptBusy(false);
    }
  }

  const bankTransferEnabled = isBankTransferConfigured(bankTransfer);

  if (!ready) {
    return <main className={styles.page}><Container size="wide"><div className={styles.state} role="status">در حال آماده‌سازی تسویه‌حساب…</div></Container></main>;
  }

  if (step === "success" && confirmation) {
    return (
      <main className={styles.page}>
        <Container size="wide">
          <div className={`${styles.state} ${styles.success}`} role="status">
            <span aria-hidden="true">✓</span>
            <h1>درخواست سفارش ثبت شد</h1>
            <p>شماره پیگیری: <strong dir="ltr">{confirmation.orderNumber}</strong></p>
            <p>زمان ثبت: <strong>{formatCalendarDateTime(confirmation.createdAt, calendarMode)}</strong></p>
            <p>مبلغ سفارش: <strong>{formatMoney(confirmation.totalMinor, confirmation.currency)}</strong></p>
            <div className={styles.paymentMethods}>
              <h2>انتخاب روش پرداخت</h2>
              {paymentEnabled ? (
                <section className={styles.paymentBoundary}>
                  <strong>پرداخت آنلاین</strong>
                  <p>سفارش تا پایان مهلت پرداخت برای شما رزرو شده است.</p>
                  <fieldset className={styles.providerOptions} disabled={paymentLoading || receiptBusy || receiptSubmitted}>
                    <legend>انتخاب درگاه پرداخت</legend>
                    {paymentProviders.map((provider) => <label className={styles.providerOption} key={provider.id}>
                      <input type="radio" name="paymentProvider" value={provider.id} checked={activePaymentProvider === provider.id} onChange={() => setSelectedPaymentProvider(provider.id)} />
                      <span>{provider.label}{provider.sandbox ? " — آزمایشی؛ بدون پرداخت واقعی" : ""}</span>
                    </label>)}
                  </fieldset>
                  <p>نام درگاه به معنای الزام استفاده از کارت همان بانک نیست.</p>
                  {paymentError ? <p className={styles.error} role="alert">{paymentError}</p> : null}
                  <button type="button" disabled={paymentLoading || receiptBusy || receiptSubmitted} onClick={() => void startPayment()}>
                    {paymentLoading ? "در حال اتصال…" : "پرداخت امن با کارت بانکی"}
                  </button>
                </section>
              ) : (
                <section className={styles.paymentBoundary}>
                  <strong>{providersLoading ? "در حال بررسی درگاه‌های پرداخت…" : providersError || "درگاه پرداخت آنلاین فعالی در دسترس نیست."}</strong>
                  <p>روش کارت‌به‌کارت، در صورت فعال‌بودن، مستقل از درگاه‌های آنلاین در دسترس است.</p>
                  {paymentError ? <p className={styles.error} role="alert">{paymentError}</p> : null}
                </section>
              )}
              {bankTransferEnabled ? (
                <section className={`${styles.paymentBoundary} ${styles.bankTransfer}`}>
                  <strong>پرداخت کارت‌به‌کارت</strong>
                  {bankTransfer.bankName ? <p>بانک: {bankTransfer.bankName}</p> : null}
                  <p>به نام: {bankTransfer.accountHolder}</p>
                  <p className={styles.cardNumber} dir="ltr">{formatCardNumber(bankTransfer.cardNumber)}</p>
                  {bankTransfer.instructions ? <p>{bankTransfer.instructions}</p> : null}
                  <p>پس از واریز، فیش را همین‌جا بفرستید. تأیید نهایی فقط پس از کنترل حساب بانکی توسط مالک یا مدیر سفارش انجام می‌شود.</p>
                  <form className={styles.receiptForm} onSubmit={submitReceipt}>
                    <label>تصویر یا PDF فیش
                      <input name="receipt" type="file" required disabled={receiptBusy || receiptSubmitted} accept="image/jpeg,image/png,image/webp,application/pdf" />
                    </label>
                    <label>شماره پیگیری تراکنش (اختیاری)
                      <input name="transferReference" dir="ltr" maxLength={100} disabled={receiptBusy || receiptSubmitted} />
                    </label>
                    <label>توضیح برای مدیریت (اختیاری)
                      <textarea name="customerNote" rows={3} maxLength={500} disabled={receiptBusy || receiptSubmitted} />
                    </label>
                    <button type="submit" disabled={receiptBusy || receiptSubmitted || paymentLoading}>
                      {receiptBusy ? "در حال ارسال…" : receiptSubmitted ? "فیش ارسال شد" : "ارسال فیش برای بررسی"}
                    </button>
                  </form>
                  {receiptStatus ? <p className={receiptSubmitted ? styles.receiptSuccess : styles.receiptStatus} role="status">{receiptStatus}</p> : null}
                </section>
              ) : null}
              {!paymentEnabled && !bankTransferEnabled ? (
                <section className={styles.paymentBoundary}>
                  <strong>هیچ مبلغی از شما دریافت نشده است.</strong>
                  <p>مالک هنوز هیچ روش پرداختی را فعال نکرده است.</p>
                </section>
              ) : null}
            </div>
            <a href="/account">مشاهده حساب کاربری</a>
            <a href="/">بازگشت به فروشگاه</a>
          </div>
        </Container>
      </main>
    );
  }

  if (cart.lines.length === 0) {
    return <main className={styles.page}><Container size="wide"><div className={styles.state}><h1>سبد خرید خالی است</h1><p>برای ادامه ابتدا یک کالا به سبد خرید اضافه کنید.</p><a href="/categories">مشاهده محصولات</a></div></Container></main>;
  }

  return (
    <main className={styles.page}>
      <Container size="wide">
        <nav className={styles.breadcrumbs} aria-label="مسیر صفحه">
          <a href="/">خانه</a><span aria-hidden="true">/</span><a href="/cart">سبد خرید</a><span aria-hidden="true">/</span><span aria-current="page">تسویه‌حساب</span>
        </nav>
        <header className={styles.header}>
          <p>ثبت امن درخواست</p><h1>تکمیل سفارش</h1>
          <p>نشانی فقط از حساب واردشده انتخاب می‌شود و قیمت و موجودی در سرور دوباره کنترل خواهند شد.</p>
        </header>
        <ol className={styles.steps} aria-label="مراحل تسویه‌حساب">
          <li data-active={step === "address"}>۱. نشانی</li><li data-active={step === "delivery"}>۲. تحویل</li><li data-active={step === "review"}>۳. ثبت درخواست</li>
        </ol>
        <div className={styles.layout}>
          <section className={styles.panel} aria-live="polite">
            {step === "address" ? (
              <div className={styles.form}>
                <div className={styles.sectionHeading}>
                  <h2>انتخاب نشانی حساب</h2>
                  <p>حساب واردشده: <span dir="ltr">{customerEmail}</span></p>
                </div>
                {addresses.length ? (
                  <div className={styles.addressChoices} role="radiogroup" aria-label="نشانی تحویل">
                    {addresses.map((address) => (
                      <label className={styles.addressChoice} key={address.id}>
                        <input
                          type="radio"
                          name="checkoutAddress"
                          value={address.id}
                          checked={selectedAddressId === address.id}
                          onChange={() => {
                            setSelectedAddressId(address.id);
                            setAddressStatus("نشانی انتخاب شد.");
                          }}
                        />
                        <span>
                          <strong>{address.label}{address.isDefault ? " · پیش‌فرض" : ""}</strong>
                          <small>{address.recipientName} · <bdi>{address.phone}</bdi></small>
                          <small>{address.province}، {address.city}، {address.addressLine}</small>
                          {address.postcode ? <small>کدپستی: <bdi>{address.postcode}</bdi></small> : null}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyAddress}>هنوز نشانی ذخیره‌شده‌ای ندارید.</div>
                )}
                <div className={styles.addressToolbar}>
                  <button type="button" onClick={() => setShowAddressForm((value) => !value)}>
                    {showAddressForm ? "بستن فرم نشانی" : "افزودن نشانی جدید"}
                  </button>
                  <a href="/account#addresses">مدیریت دفترچه نشانی</a>
                </div>
                <p className={styles.addressStatus} role="status">{addressStatus}</p>
                {showAddressForm ? (
                  <form className={styles.inlineAddressForm} onSubmit={saveAddress}>
                    <div className={styles.sectionHeading}><h3>نشانی جدید</h3><p>موقعیت مکانی اختیاری است.</p></div>
                    <div className={styles.twoColumns}>
                      <label><span>عنوان نشانی</span><input name="label" maxLength={60} placeholder="خانه یا محل کار" /></label>
                      <label><span>نام تحویل‌گیرنده</span><input name="recipientName" required maxLength={120} autoComplete="name" /></label>
                    </div>
                    <div className={styles.twoColumns}>
                      <label><span>شماره همراه</span><input name="phone" required maxLength={40} inputMode="tel" autoComplete="tel" dir="ltr" /></label>
                      <label><span>کدپستی</span><input name="postcode" maxLength={20} inputMode="numeric" autoComplete="postal-code" dir="ltr" /></label>
                    </div>
                    <div className={styles.twoColumns}>
                      <label><span>استان</span><input name="province" required maxLength={100} autoComplete="address-level1" /></label>
                      <label><span>شهر</span><input name="city" required maxLength={100} autoComplete="address-level2" /></label>
                    </div>
                    <label><span>نشانی کامل</span><textarea name="addressLine" required minLength={8} maxLength={500} rows={3} autoComplete="street-address" /></label>
                    <label className={styles.checkbox}><input name="isDefault" type="checkbox" /> این نشانی پیش‌فرض باشد</label>
                    <div className={styles.inlineAddressActions}>
                      <button type="button" disabled={addressBusy} onClick={requestLocation}>دریافت موقعیت اختیاری</button>
                      <button type="submit" disabled={addressBusy}>{addressBusy ? "در حال ذخیره…" : "ذخیره و انتخاب نشانی"}</button>
                    </div>
                  </form>
                ) : null}
                <label className={styles.honeypot} aria-hidden="true">وب‌سایت<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
                <button type="button" disabled={!selectedAddress || addressBusy} onClick={continueFromAddress}>ادامه به روش تحویل</button>
              </div>
            ) : null}
            {step === "delivery" ? (
              <div className={styles.form}>
                <div className={styles.sectionHeading}><h2>روش تحویل</h2><p>هزینه همین‌جا و پیش از ثبت سفارش نمایش داده می‌شود.</p></div>
                <label className={styles.option}><input type="radio" name="delivery" value="standard" checked={delivery === "standard"} onChange={() => setDelivery("standard")} /><span><strong>ارسال استاندارد</strong><small>{formatMoney(getDeliveryPriceMinor(currency, "standard", deliveryFees), currency)}</small></span></label>
                <label className={styles.option}><input type="radio" name="delivery" value="priority" checked={delivery === "priority"} onChange={() => setDelivery("priority")} /><span><strong>ارسال سریع</strong><small>{formatMoney(getDeliveryPriceMinor(currency, "priority", deliveryFees), currency)}</small></span></label>
                <div className={styles.actions}><button type="button" onClick={() => setStep("address")}>بازگشت</button><button type="button" onClick={() => setStep("review")}>مرور سفارش</button></div>
              </div>
            ) : null}
            {step === "review" && selectedAddress ? (
              <div className={styles.review}>
                <div className={styles.sectionHeading}><h2>مرور نهایی</h2><p>نشانی سفارش به‌صورت مستقل ذخیره می‌شود و تغییرات بعدی دفترچه نشانی آن را عوض نمی‌کند.</p></div>
                <section><h3>تحویل به</h3><p>{selectedAddress.recipientName} · {selectedAddress.label}</p><p>{selectedAddress.addressLine}</p><p>{selectedAddress.province}، {selectedAddress.city}{selectedAddress.postcode ? `، ${selectedAddress.postcode}` : ""}</p><button type="button" onClick={() => setStep("address")}>تغییر نشانی</button></section>
                <section><h3>روش تحویل</h3><p>{delivery === "priority" ? "ارسال سریع" : "ارسال استاندارد"}</p><button type="button" onClick={() => setStep("delivery")}>ویرایش روش تحویل</button></section>
                <div className={styles.paymentBoundary} role="note"><strong>{paymentEnabled || bankTransferEnabled ? "انتخاب روش پرداخت پس از ثبت سفارش" : "ثبت سفارش بدون دریافت وجه"}</strong><p>{paymentEnabled && bankTransferEnabled ? "پس از ثبت می‌توانید درگاه آنلاین یا کارت‌به‌کارت و ارسال فیش را انتخاب کنید." : paymentEnabled ? "پس از ثبت، انتخاب درگاه پرداخت آنلاین در دسترس است." : bankTransferEnabled ? "پس از ثبت، مشخصات کارت و فرم امن ارسال فیش نمایش داده می‌شود." : providersLoading ? "وضعیت درگاه‌ها در حال بررسی است؛ اکنون وجهی دریافت نمی‌شود." : "هیچ روش پرداختی اکنون در دسترس نیست و فقط شماره پیگیری می‌گیرید."}</p></div>
                {submitError ? <p className={styles.error} role="alert">{submitError}</p> : null}
                <button type="button" disabled={submitting || hasInvalidCurrency} onClick={() => void submitOrder()}>{submitting ? "در حال ثبت…" : "ثبت درخواست سفارش"}</button>
              </div>
            ) : null}
          </section>
          <aside className={styles.summary} aria-labelledby="checkout-summary">
            <h2 id="checkout-summary">خلاصه سبد</h2>
            <ul>{cart.lines.map((line) => <li key={getGuestCartLineKey(line)}><span>{line.title}{line.selectionLabel ? ` — ${line.selectionLabel}` : ""} × {line.quantity.toLocaleString("fa-IR")}</span><strong>{formatMoney(line.unitPriceMinor * line.quantity, line.currency)}</strong></li>)}</ul>
            <div className={styles.total}><span>جمع کالاها</span><strong>{hasInvalidCurrency ? "نیازمند بازبینی" : formatMoney(subtotalMinor, currency)}</strong></div>
            <div className={styles.total}><span>ارسال</span><strong>{formatMoney(deliveryMinor, currency)}</strong></div>
            <div className={styles.total}><span>مبلغ سفارش</span><strong>{hasInvalidCurrency ? "—" : formatMoney(totalMinor, currency)}</strong></div>
            <p>مبلغ نهایی در سرور دوباره محاسبه می‌شود و پرداخت فقط در درگاه تأییدشده انجام می‌گیرد.</p>
          </aside>
        </div>
      </Container>
    </main>
  );
}
