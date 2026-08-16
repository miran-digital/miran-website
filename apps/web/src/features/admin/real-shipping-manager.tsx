"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Container } from "@miran/ui";
import styles from "./real-product-manager.module.css";

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
  sortOrder: number;
};

function toman(irr: number) {
  return `${Math.round(irr / 10).toLocaleString("fa-IR")} تومان`;
}

function tomanToIrr(value: FormDataEntryValue | null) {
  const tomanValue = Number(value);
  return Number.isSafeInteger(tomanValue) && tomanValue >= 0 ? tomanValue * 10 : null;
}

export function RealShippingManager() {
  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/shipping-methods", { cache: "no-store" });
      const data = (await response.json()) as { methods?: ShippingMethod[]; message?: string };
      if (!response.ok) throw new Error(data.message || "load failed");
      setMethods(data.methods ?? []);
    } catch {
      setMessage("دریافت روش‌های ارسال انجام نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createMethod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const priceIrr = tomanToIrr(data.get("priceToman"));
    const freeOverIrr = data.get("freeOverToman") ? tomanToIrr(data.get("freeOverToman")) : null;
    if (priceIrr === null || (data.get("freeOverToman") && freeOverIrr === null)) {
      setMessage("مبلغ ارسال معتبر نیست.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/shipping-methods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: String(data.get("code") || ""),
          name: String(data.get("name") || ""),
          description: String(data.get("description") || ""),
          priceIrr,
          freeOverIrr,
          minDeliveryDays: data.get("minDays") ? Number(data.get("minDays")) : null,
          maxDeliveryDays: data.get("maxDays") ? Number(data.get("maxDays")) : null,
          sortOrder: Number(data.get("sortOrder") || 0),
          active: true,
        }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(body.message ?? "ساخت روش ارسال انجام نشد.");
        return;
      }
      form.reset();
      setMessage("روش ارسال واقعی ذخیره شد.");
      await load();
    } catch {
      setMessage("ساخت روش ارسال انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/shipping-methods/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "به‌روزرسانی روش ارسال انجام نشد.");
        return;
      }
      await load();
    } catch {
      setMessage("به‌روزرسانی روش ارسال انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("این روش ارسال حذف شود؟ Orderهای قبلی Snapshot خود را حفظ می‌کنند.")) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/shipping-methods/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("delete failed");
      await load();
      setMessage("روش ارسال حذف شد.");
    } catch {
      setMessage("حذف روش ارسال انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="shipping-manager-title">
      <Container size="wide">
        <div className={styles.panel}>
          <div className={styles.heading}>
            <p>Logistics</p>
            <h2 id="shipping-manager-title">مدیریت واقعی روش‌های ارسال</h2>
            <p className={styles.note}>مبالغ این فرم تومان هستند؛ Backend همه مبالغ را به‌صورت عدد صحیح ریال ذخیره می‌کند.</p>
          </div>

          <div className={styles.grid}>
            <form className={styles.form} onSubmit={createMethod}>
              <h3>روش ارسال جدید</h3>
              <label>کد<input name="code" dir="ltr" required maxLength={40} placeholder="STANDARD" /></label>
              <label>نام<input name="name" required maxLength={120} placeholder="ارسال استاندارد" /></label>
              <label>توضیح<input name="description" maxLength={500} placeholder="ارسال قابل رهگیری" /></label>
              <label>هزینه ارسال (تومان)<input name="priceToman" type="number" min="0" step="1" required /></label>
              <label>ارسال رایگان از (تومان)<input name="freeOverToman" type="number" min="0" step="1" /></label>
              <label>حداقل روز کاری<input name="minDays" type="number" min="0" max="365" /></label>
              <label>حداکثر روز کاری<input name="maxDays" type="number" min="0" max="365" /></label>
              <label>ترتیب نمایش<input name="sortOrder" type="number" min="0" max="10000" defaultValue="0" /></label>
              <button type="submit" disabled={loading}>{loading ? "در حال ذخیره…" : "ذخیره روش ارسال"}</button>
            </form>

            <div className={styles.card}>
              <h3>روش‌های ثبت‌شده</h3>
              {methods.length === 0 ? <p>هنوز روش ارسال واقعی ثبت نشده است.</p> : null}
              {methods.map((method) => (
                <article className={styles.card} key={method.id}>
                  <h3>{method.name}</h3>
                  <p className={styles.meta}><bdi dir="ltr">{method.code}</bdi></p>
                  <p>هزینه: {toman(method.priceIrr)}</p>
                  <p>{method.freeOverIrr === null ? "بدون آستانه ارسال رایگان" : `رایگان از ${toman(method.freeOverIrr)}`}</p>
                  <p>
                    زمان: {method.minDeliveryDays ?? "—"} تا {method.maxDeliveryDays ?? "—"} روز کاری
                  </p>
                  <p className={styles.status}>{method.active ? "فعال" : "غیرفعال"}</p>
                  <div className={styles.actions}>
                    <button type="button" disabled={loading} onClick={() => void patch(method.id, { active: !method.active })}>
                      {method.active ? "غیرفعال کردن" : "فعال کردن"}
                    </button>
                    <button type="button" disabled={loading} onClick={() => void remove(method.id)}>حذف</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
          {message ? <p className={styles.status} role="status">{message}</p> : null}
        </div>
      </Container>
    </section>
  );
}
