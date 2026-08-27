"use client";

import { useState, type FormEvent } from "react";
import styles from "./admin-login-form.module.css";

export function AdminLoginForm({ next }: { next: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: data.get("username"),
          password: data.get("password"),
        }),
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!response.ok || payload.ok !== true) throw new Error(payload.error || "ورود انجام نشد.");
      window.location.assign(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ورود انجام نشد.");
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label>
        نام کاربری مالک
        <input name="username" autoComplete="username" dir="ltr" required minLength={4} maxLength={40} />
      </label>
      <label>
        رمز مالک
        <input name="password" type="password" autoComplete="current-password" dir="ltr" required minLength={12} maxLength={128} />
      </label>
      {message ? <p role="alert">{message}</p> : null}
      <button type="submit" disabled={busy}>{busy ? "در حال بررسی…" : "ورود به مدیریت"}</button>
    </form>
  );
}
