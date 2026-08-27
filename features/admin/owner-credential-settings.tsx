"use client";

import { useEffect, useState, type FormEvent } from "react";
import styles from "./owner-credential-settings.module.css";

type CredentialStatus = {
  configured: boolean;
  username: string;
  authMethod: "chatgpt" | "owner_password";
};

export function OwnerCredentialSettings() {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/credentials", { cache: "no-store" })
      .then(readStatus)
      .then((value) => { if (active) setStatus(value); })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "خواندن تنظیمات ورود ممکن نشد."); });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    if (password !== confirmation) {
      setMessage("تکرار رمز با رمز جدید یکسان نیست.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/credentials", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: data.get("username"),
          password,
          currentPassword: data.get("currentPassword"),
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        configured?: boolean;
        username?: string;
        reauthenticationRequired?: boolean;
        error?: string;
      };
      if (!response.ok || payload.configured !== true || !payload.username) {
        throw new Error(payload.error || "ذخیره ورود مالک ممکن نشد.");
      }
      if (payload.reauthenticationRequired) {
        window.location.assign("/admin/logout");
        return;
      }
      setStatus({ configured: true, username: payload.username, authMethod: "chatgpt" });
      for (const fieldName of ["password", "confirmation", "currentPassword"]) {
        const field = form.elements.namedItem(fieldName);
        if (field instanceof HTMLInputElement) field.value = "";
      }
      setMessage("ورود مستقل مالک فعال شد. از این پس می‌توانید از صفحه ورود مالک استفاده کنید.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ذخیره ورود مالک ممکن نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="owner-credential-title">
      <h2 id="owner-credential-title">ورود مستقل مالک با نام کاربری و رمز</h2>
      <p>رمز فقط به‌صورت هش‌شده نگهداری می‌شود. مدیران به این تنظیم دسترسی ندارند و ورود مشتریان نیز جدا می‌ماند.</p>
      {status ? (
        <form className={styles.form} onSubmit={save}>
          <label>نام کاربری مالک
            <input name="username" dir="ltr" autoComplete="username" required minLength={4} maxLength={40} defaultValue={status.username} placeholder="miran-owner" />
          </label>
          {status.configured && status.authMethod === "owner_password" ? (
            <label>رمز فعلی
              <input name="currentPassword" dir="ltr" type="password" autoComplete="current-password" required minLength={12} maxLength={128} />
            </label>
          ) : null}
          <label>{status.configured ? "رمز جدید" : "رمز مالک"}
            <input name="password" dir="ltr" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
          </label>
          <label>تکرار رمز
            <input name="confirmation" dir="ltr" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
          </label>
          <small>حداقل ۱۲ نویسه شامل حرف کوچک، حرف بزرگ، عدد و نشانه.</small>
          {message ? <p className={styles.message} role="status">{message}</p> : null}
          <button type="submit" disabled={busy}>{busy ? "در حال ذخیره…" : status.configured ? "تغییر نام کاربری یا رمز" : "فعال‌سازی ورود مستقل مالک"}</button>
          {status.configured ? <a href="/admin/login" target="_blank" rel="noreferrer">بازکردن صفحه ورود مالک</a> : null}
        </form>
      ) : <p>{message || "در حال خواندن تنظیمات…"}</p>}
    </section>
  );
}

async function readStatus(response: Response) {
  const payload = await response.json().catch(() => ({})) as Partial<CredentialStatus> & { error?: string };
  if (!response.ok || typeof payload.configured !== "boolean" || typeof payload.username !== "string" || (payload.authMethod !== "chatgpt" && payload.authMethod !== "owner_password")) {
    throw new Error(payload.error || "خواندن تنظیمات ورود ممکن نشد.");
  }
  return payload as CredentialStatus;
}
