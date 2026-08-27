"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { CustomerAddress } from "./address-types";
import styles from "@/app/account/account.module.css";

type Coordinates = { latitude: number; longitude: number } | null;
type AddressField =
  | "recipientName"
  | "phone"
  | "province"
  | "city"
  | "addressLine";
type AddressFieldErrors = Partial<Record<AddressField, string>>;

export function AddressBook() {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [coordinates, setCoordinates] = useState<Coordinates>(null);
  const [status, setStatus] = useState("در حال دریافت نشانی‌ها…");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<AddressFieldErrors>({});

  useEffect(() => {
    let active = true;
    fetch("/api/account/addresses", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          addresses?: CustomerAddress[];
          error?: string;
        };
        if (!response.ok || !payload.addresses) {
          throw new Error(payload.error || "دریافت نشانی‌ها ممکن نشد.");
        }
        if (active) {
          setAddresses(payload.addresses);
          setStatus(payload.addresses.length ? "" : "هنوز نشانی ثبت نشده است.");
        }
      })
      .catch((error: unknown) => {
        if (active) setStatus(error instanceof Error ? error.message : "خطای نامشخص");
      });
    return () => {
      active = false;
    };
  }, []);

  function requestLocation() {
    if (!("geolocation" in navigator)) {
      setStatus("مرورگر شما دریافت موقعیت مکانی را پشتیبانی نمی‌کند.");
      return;
    }
    setStatus("در انتظار اجازه دسترسی به موقعیت…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setStatus("موقعیت به این فرم اضافه شد؛ برای ذخیره، مشخصات نشانی را کامل کنید.");
      },
      () => setStatus("موقعیت دریافت نشد؛ می‌توانید نشانی را دستی ثبت کنید."),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  async function submitAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const errors = validateAddressForm(data);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setStatus("لطفاً موارد مشخص‌شده را کامل کنید.");
      const firstInvalidField = Object.keys(errors)[0];
      const firstInvalidElement = form.elements.namedItem(firstInvalidField);
      if (firstInvalidElement instanceof HTMLElement) firstInvalidElement.focus();
      return;
    }
    setFieldErrors({});
    setBusy(true);
    setStatus("در حال ذخیره نشانی…");
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
          isDefault: data.get("isDefault") === "on",
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
      setCoordinates(null);
      form.reset();
      setStatus("نشانی با موفقیت ذخیره شد.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "ذخیره نشانی ممکن نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function mutateAddress(method: "PATCH" | "DELETE", id: string) {
    if (
      method === "DELETE" &&
      !window.confirm("این نشانی حذف شود؟ این کار قابل بازگشت نیست.")
    ) return;
    setBusy(true);
    setStatus(method === "DELETE" ? "در حال حذف نشانی…" : "در حال تغییر نشانی پیش‌فرض…");
    try {
      const response = await fetch(
        method === "DELETE"
          ? `/api/account/addresses?id=${encodeURIComponent(id)}`
          : "/api/account/addresses",
        {
          method,
          headers: method === "PATCH" ? { "content-type": "application/json" } : undefined,
          body: method === "PATCH" ? JSON.stringify({ id }) : undefined,
        },
      );
      const payload = (await response.json()) as {
        addresses?: CustomerAddress[];
        error?: string;
      };
      if (!response.ok || !payload.addresses) {
        throw new Error(payload.error || "تغییر نشانی ممکن نشد.");
      }
      setAddresses(payload.addresses);
      setStatus(method === "DELETE" ? "نشانی حذف شد." : "نشانی پیش‌فرض تغییر کرد.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "تغییر نشانی ممکن نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.addressSection} id="addresses" aria-labelledby="addresses-title">
      <div className={styles.sectionHeading}>
        <div>
          <p>Address book</p>
          <h2 id="addresses-title">نشانی‌های ارسال</h2>
        </div>
        <button type="button" onClick={requestLocation} disabled={busy}>
          انتخاب موقعیت فعلی
        </button>
      </div>
      <p className={styles.privacyNote}>
        موقعیت فقط با اجازه شما دریافت می‌شود و پس از زدن «ذخیره نشانی» در حساب خودتان ثبت خواهد شد.
      </p>
      <p className={styles.status} aria-live="polite">{status}</p>

      {addresses.length ? (
        <div className={styles.addressList}>
          {addresses.map((address) => (
            <article key={address.id}>
              <div>
                <strong>{address.label}{address.isDefault ? " · پیش‌فرض" : ""}</strong>
                <p>{address.province}، {address.city}، {address.addressLine}</p>
                <small>{address.recipientName} · {address.phone}{address.postcode ? ` · کدپستی ${address.postcode}` : ""}</small>
                {address.latitude !== null ? <small>موقعیت مکانی ثبت شده است.</small> : null}
              </div>
              <div className={styles.addressActions}>
                {!address.isDefault ? (
                  <button type="button" disabled={busy} onClick={() => void mutateAddress("PATCH", address.id)}>انتخاب پیش‌فرض</button>
                ) : null}
                <button type="button" disabled={busy} onClick={() => void mutateAddress("DELETE", address.id)}>حذف</button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <form
        className={styles.addressForm}
        onSubmit={submitAddress}
        noValidate
        onInput={(event) => {
          const name = (event.target as HTMLInputElement | HTMLTextAreaElement)
            .name as AddressField;
          if (!name || !fieldErrors[name]) return;
          setFieldErrors((current) => ({ ...current, [name]: undefined }));
        }}
      >
        <h3>افزودن نشانی</h3>
        <label>عنوان نشانی<input name="label" maxLength={60} placeholder="خانه یا محل کار" /></label>
        <label>
          نام تحویل‌گیرنده
          <input name="recipientName" required maxLength={120} autoComplete="name" aria-invalid={Boolean(fieldErrors.recipientName)} aria-describedby={fieldErrors.recipientName ? "recipientName-error" : undefined} />
          {fieldErrors.recipientName ? <small className={styles.fieldError} id="recipientName-error" role="alert">{fieldErrors.recipientName}</small> : null}
        </label>
        <label>
          شماره همراه
          <input name="phone" required maxLength={40} inputMode="tel" autoComplete="tel" dir="ltr" aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={fieldErrors.phone ? "phone-error" : undefined} />
          {fieldErrors.phone ? <small className={styles.fieldError} id="phone-error" role="alert">{fieldErrors.phone}</small> : null}
        </label>
        <label>
          استان
          <input name="province" required maxLength={100} autoComplete="address-level1" aria-invalid={Boolean(fieldErrors.province)} aria-describedby={fieldErrors.province ? "province-error" : undefined} />
          {fieldErrors.province ? <small className={styles.fieldError} id="province-error" role="alert">{fieldErrors.province}</small> : null}
        </label>
        <label>
          شهر
          <input name="city" required maxLength={100} autoComplete="address-level2" aria-invalid={Boolean(fieldErrors.city)} aria-describedby={fieldErrors.city ? "city-error" : undefined} />
          {fieldErrors.city ? <small className={styles.fieldError} id="city-error" role="alert">{fieldErrors.city}</small> : null}
        </label>
        <label>کدپستی<input name="postcode" maxLength={20} inputMode="numeric" autoComplete="postal-code" dir="ltr" /></label>
        <label className={styles.fullWidth}>
          نشانی کامل
          <textarea name="addressLine" required minLength={8} maxLength={500} rows={3} autoComplete="street-address" aria-invalid={Boolean(fieldErrors.addressLine)} aria-describedby={fieldErrors.addressLine ? "addressLine-error" : undefined} />
          {fieldErrors.addressLine ? <small className={styles.fieldError} id="addressLine-error" role="alert">{fieldErrors.addressLine}</small> : null}
        </label>
        <label className={styles.checkbox}><input name="isDefault" type="checkbox" /> این نشانی پیش‌فرض باشد</label>
        <div className={styles.formFooter}>
          <small>{coordinates ? "موقعیت جغرافیایی آماده ذخیره است." : "ثبت موقعیت جغرافیایی اختیاری است."}</small>
          <button type="submit" disabled={busy}>{busy ? "در حال انجام…" : "ذخیره نشانی"}</button>
        </div>
      </form>
    </section>
  );
}

function validateAddressForm(data: FormData): AddressFieldErrors {
  const errors: AddressFieldErrors = {};
  const recipientName = String(data.get("recipientName") ?? "").trim();
  const phone = String(data.get("phone") ?? "").trim();
  const province = String(data.get("province") ?? "").trim();
  const city = String(data.get("city") ?? "").trim();
  const addressLine = String(data.get("addressLine") ?? "").trim();

  if (!recipientName) errors.recipientName = "لطفاً نام تحویل‌گیرنده را وارد کنید.";
  if (!phone) {
    errors.phone = "لطفاً شماره همراه را وارد کنید.";
  } else if (!/^[+\d۰-۹٠-٩ ()-]{7,40}$/.test(phone)) {
    errors.phone = "شماره همراه واردشده معتبر نیست.";
  }
  if (!province) errors.province = "لطفاً استان را وارد کنید.";
  if (!city) errors.city = "لطفاً شهر را وارد کنید.";
  if (!addressLine) {
    errors.addressLine = "لطفاً نشانی کامل را وارد کنید.";
  } else if (addressLine.length < 8) {
    errors.addressLine = "نشانی کامل باید حداقل ۸ نویسه باشد.";
  }
  return errors;
}
