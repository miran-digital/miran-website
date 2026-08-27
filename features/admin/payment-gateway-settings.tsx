"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { PaymentProviderAdminConfig } from "@/lib/payment-provider-config";
import styles from "./admin.module.css";

export function PaymentGatewaySettings() {
  const [config, setConfig] = useState<PaymentProviderAdminConfig | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/payment-providers", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { config?: PaymentProviderAdminConfig; error?: string };
        if (!response.ok || !payload.config) throw new Error(payload.error || "خواندن تنظیمات درگاه ممکن نشد.");
        if (active) setConfig(payload.config);
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : "خواندن تنظیمات درگاه ممکن نشد.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/payment-providers", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: data.get("gatewayEnabled") === "on",
          sandbox: data.get("gatewaySandbox") === "on",
          merchantId: String(data.get("merchantId") ?? "").trim(),
        }),
      });
      const payload = await response.json() as { config?: PaymentProviderAdminConfig; error?: string };
      if (!response.ok || !payload.config) throw new Error(payload.error || "ذخیره تنظیمات درگاه ممکن نشد.");
      setConfig(payload.config);
      const merchantInput = form.elements.namedItem("merchantId");
      if (merchantInput instanceof HTMLInputElement) merchantInput.value = "";
      setMessage("تنظیمات درگاه با موفقیت و به‌صورت رمزگذاری‌شده ذخیره شد.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ذخیره تنظیمات درگاه ممکن نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.campaignForm} key={`${config?.enabled}-${config?.sandbox}-${config?.configured}`} onSubmit={save}>
      <fieldset>
        <legend>درگاه پرداخت آنلاین</legend>
        <p>در حال حاضر اتصال کامل زرین‌پال آماده است. اطلاعات پذیرنده فقط در سمت سرور و به‌صورت رمزگذاری‌شده نگهداری می‌شود.</p>
        {busy && !config ? <p role="status">در حال بررسی تنظیمات درگاه…</p> : null}
        <label><input name="gatewayEnabled" type="checkbox" defaultChecked={config?.enabled} /> فعال‌سازی زرین‌پال برای مشتری</label>
        <label><input name="gatewaySandbox" type="checkbox" defaultChecked={config?.sandbox} /> حالت آزمایشی</label>
        <label>شناسه پذیرنده زرین‌پال
          <input name="merchantId" type="password" dir="ltr" autoComplete="new-password" maxLength={80} placeholder={config?.configured ? `ثبت شده ${config.credentialHint}` : "شناسه ۳۶ نویسه‌ای"} />
        </label>
        <small>{config?.configured ? "شناسه قبلی حفظ می‌شود؛ فقط برای تغییر، مقدار جدید وارد کنید." : "تا شناسه معتبر ثبت نشود، درگاه در فروشگاه نمایش داده نمی‌شود."}</small>
        <button type="submit" disabled={busy || config?.encryptionReady === false}>{busy ? "در حال ذخیره…" : "ذخیره امن درگاه"}</button>
        <p>درگاه‌های مستقیم بانک‌های ایرانی هرکدام قرارداد و روش اتصال جدا دارند؛ پس از انتخاب بانک، اتصال همان بانک بدون تغییر ساختار سفارش اضافه می‌شود.</p>
        {message ? <p role="status">{message}</p> : null}
      </fieldset>
    </form>
  );
}
