"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

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

const emptyForm = {
  label: "خانه",
  fullName: "",
  phone: "",
  province: "",
  city: "",
  addressLine: "",
  postalCode: "",
  isDefault: false,
};

export function AddressBook() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/addresses", { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = (await response.json()) as { addresses: Address[] };
      setAddresses(data.addresses);
    } catch {
      setMessage("دریافت نشانی‌ها انجام نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function addAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/addresses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "ثبت نشانی انجام نشد.");
        return;
      }
      setForm(emptyForm);
      setMessage("نشانی ذخیره شد.");
      await load();
    } catch {
      setMessage("ثبت نشانی انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function setDefault(id: string) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/addresses", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error("default failed");
      await load();
      setMessage("نشانی پیش‌فرض تغییر کرد.");
    } catch {
      setMessage("تغییر نشانی پیش‌فرض انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/addresses?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "حذف نشانی انجام نشد.");
        return;
      }
      await load();
      setMessage("نشانی حذف شد.");
    } catch {
      setMessage("حذف نشانی انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="address-book-title">
      <h3 id="address-book-title">نشانی‌های تحویل</h3>
      {loading && addresses.length === 0 ? <p role="status">در حال دریافت نشانی‌ها…</p> : null}
      {addresses.length === 0 && !loading ? <p>هنوز نشانی ثبت نشده است.</p> : null}
      {addresses.map((address) => (
        <article key={address.id}>
          <strong>
            {address.label} {address.is_default ? "— پیش‌فرض" : ""}
          </strong>
          <p>
            {address.full_name}، {address.province}، {address.city}، {address.address_line}
          </p>
          <p>
            کدپستی: <bdi dir="ltr">{address.postal_code}</bdi> — تلفن: <bdi dir="ltr">{address.phone}</bdi>
          </p>
          {!address.is_default ? (
            <button type="button" onClick={() => void setDefault(address.id)} disabled={loading}>
              انتخاب به‌عنوان پیش‌فرض
            </button>
          ) : null}
          <button type="button" onClick={() => void remove(address.id)} disabled={loading}>
            حذف نشانی
          </button>
        </article>
      ))}

      <form onSubmit={addAddress}>
        <h3>افزودن نشانی</h3>
        <label>
          <span>عنوان نشانی</span>
          <input value={form.label} onChange={(event) => update("label", event.target.value)} required />
        </label>
        <label>
          <span>نام و نام خانوادگی تحویل‌گیرنده</span>
          <input value={form.fullName} onChange={(event) => update("fullName", event.target.value)} required />
        </label>
        <label>
          <span>شماره تماس</span>
          <input dir="ltr" value={form.phone} onChange={(event) => update("phone", event.target.value)} required />
        </label>
        <label>
          <span>استان</span>
          <input value={form.province} onChange={(event) => update("province", event.target.value)} required />
        </label>
        <label>
          <span>شهر</span>
          <input value={form.city} onChange={(event) => update("city", event.target.value)} required />
        </label>
        <label>
          <span>نشانی کامل</span>
          <input value={form.addressLine} onChange={(event) => update("addressLine", event.target.value)} required />
        </label>
        <label>
          <span>کدپستی</span>
          <input dir="ltr" value={form.postalCode} onChange={(event) => update("postalCode", event.target.value)} required />
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.isDefault}
            onChange={(event) => update("isDefault", event.target.checked)}
          />
          <span>این نشانی پیش‌فرض باشد</span>
        </label>
        <button type="submit" disabled={loading}>ثبت نشانی</button>
      </form>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
