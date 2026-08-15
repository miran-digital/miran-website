"use client";

import { FormEvent, useEffect, useState } from "react";
import { AddressBook } from "./address-book";

type User = { id: string; email: string; role: string };
type Mode = "login" | "register";

export function AccountAuthForm() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as { user: User | null };
        return data.user;
      })
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as {
        user?: User;
        message?: string;
      };
      if (!response.ok || !data.user) {
        setMessage(data.message ?? "عملیات انجام نشد.");
        return;
      }
      setUser(data.user);
      setPassword("");
      setMessage(
        mode === "login" ? "ورود با موفقیت انجام شد." : "حساب شما ساخته شد.",
      );
    } catch {
      setMessage("ارتباط با سرور برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setLoading(true);
    setMessage("");
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      setPassword("");
      setMessage("از حساب خارج شدید.");
    } finally {
      setLoading(false);
    }
  }

  if (loading && !user) {
    return <p role="status">در حال بررسی نشست امن شما…</p>;
  }

  if (user) {
    return (
      <div>
        <h2>حساب فعال</h2>
        <p>
          با ایمیل <bdi dir="ltr">{user.email}</bdi> وارد شده‌اید.
        </p>
        <button type="button" onClick={logout} disabled={loading}>
          {loading ? "در حال خروج…" : "خروج از حساب"}
        </button>
        {message ? <p role="status">{message}</p> : null}
        <AddressBook />
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <h2 id="account-login-title">
        {mode === "login" ? "ورود امن" : "ساخت حساب"}
      </h2>
      <p>
        نشست شما با Cookie امن HttpOnly مدیریت می‌شود و رمز عبور در مرورگر ذخیره
        نمی‌شود.
      </p>
      <label>
        <span>ایمیل</span>
        <input
          type="email"
          autoComplete="email"
          dir="ltr"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          disabled={loading}
        />
      </label>
      <label>
        <span>رمز عبور</span>
        <input
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          dir="ltr"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={10}
          required
          disabled={loading}
        />
      </label>
      <button type="submit" disabled={loading}>
        {loading
          ? "در حال پردازش…"
          : mode === "login"
            ? "ورود"
            : "ثبت‌نام"}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setMessage("");
        }}
        disabled={loading}
      >
        {mode === "login"
          ? "حساب ندارید؟ ثبت‌نام"
          : "قبلاً ثبت‌نام کرده‌اید؟ ورود"}
      </button>
      {message ? <p role="alert">{message}</p> : null}
    </form>
  );
}
