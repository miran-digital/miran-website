"use client";

import { useEffect, useState } from "react";
import type { CustomerAddress } from "./address-types";

type HeaderAddressProps = {
  signedIn: boolean;
  signInHref: string;
};

export function HeaderAddress({ signedIn, signInHref }: HeaderAddressProps) {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    fetch("/api/account/addresses", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const payload = (await response.json()) as { addresses?: CustomerAddress[] };
        if (active) setAddresses(payload.addresses ?? []);
      })
      .catch(() => {
        if (active) setStatus("دریافت نشانی‌ها ممکن نشد.");
      });
    return () => {
      active = false;
    };
  }, [signedIn]);

  if (!signedIn) {
    return <a href={signInHref}>⌖ انتخاب آدرس</a>;
  }

  const selected = addresses.find((address) => address.isDefault);
  const label = selected
    ? `${selected.province}، ${selected.city}`
    : "انتخاب آدرس";

  async function selectDefault(id: string) {
    setBusyId(id);
    setStatus("در حال تغییر نشانی پیش‌فرض…");
    try {
      const response = await fetch("/api/account/addresses", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const payload = (await response.json()) as {
        addresses?: CustomerAddress[];
        error?: string;
      };
      if (!response.ok || !payload.addresses) {
        throw new Error(payload.error || "تغییر نشانی ممکن نشد.");
      }
      setAddresses(payload.addresses);
      setStatus("نشانی پیش‌فرض تغییر کرد.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "تغییر نشانی ممکن نشد.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <details className="header-address">
      <summary title="انتخاب نشانی ارسال">⌖ {label}</summary>
      <div className="header-address__menu">
        {addresses.length ? (
          <ul>
            {addresses.map((address) => (
              <li key={address.id}>
                <button
                  type="button"
                  aria-pressed={address.isDefault}
                  disabled={Boolean(busyId)}
                  onClick={() => void selectDefault(address.id)}
                >
                  <strong>{address.label}</strong>
                  <span>{address.province}، {address.city}</span>
                  {address.isDefault ? <small>نشانی پیش‌فرض</small> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>هنوز نشانی ثبت نشده است.</p>
        )}
        <a href="/account#addresses">مدیریت و افزودن نشانی</a>
        {status ? <small aria-live="polite">{status}</small> : null}
      </div>
    </details>
  );
}
