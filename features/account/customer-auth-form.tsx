"use client";
import { FormEvent, useEffect, useState } from "react";
import { customerPasswordError } from "@/lib/customer-password";
type Mode = "identify" | "login" | "signup" | "confirmation" | "callback" | "reset" | "update";

export function CustomerAuthForm({ next = "/account", callbackOnly = false }: { next?: string; callbackOnly?: boolean }) {
  const [mode, setMode] = useState<Mode>(callbackOnly ? "callback" : "identify");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(callbackOnly);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const accessToken = hash.get("access_token"), refreshToken = hash.get("refresh_token");
    const code = query.get("code");
    const tokenHash = query.get("token_hash") ?? query.get("token");
    const verificationType = query.get("type") ?? hash.get("type") ?? "email";
    const recovery = verificationType === "recovery" || hash.get("type") === "recovery";
    const payload = accessToken && refreshToken
      ? { action: "session", accessToken, refreshToken }
      : code
        ? { action: "exchange", code }
        : tokenHash
          ? { action: "verify", tokenHash, verificationType }
          : null;
    if (!payload) {
      if (callbackOnly || hash.has("error") || hash.has("error_description") || query.has("error")) {
        window.history.replaceState(null, "", window.location.pathname);
        Promise.resolve().then(() => {
          setBusy(false);
          setError("پیوند تأیید معتبر نیست یا منقضی شده است.");
        });
      }
      return;
    }
    Promise.resolve().then(() => {
      setMode("callback");
      setBusy(true);
    });
    fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then((response) => {
        if (!response.ok) throw new Error();
        window.history.replaceState(null, "", window.location.pathname);
        if (recovery) {
          setMode("update");
          setMessage("پیوند تأیید شد؛ رمز جدید را وارد کنید.");
          setBusy(false);
          return;
        }
        window.location.replace(next);
      })
      .catch(() => {
        window.history.replaceState(null, "", window.location.pathname);
        setBusy(false);
        setError("پیوند تأیید معتبر نیست یا منقضی شده است.");
      });
  }, [callbackOnly, next]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    if (mode === "identify") {
      const nextEmail = String(values.get("email") ?? "").trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(nextEmail)) return setError("ایمیل معتبر وارد کنید.");
      setEmail(nextEmail);
      setError("");
      setMessage("");
      setMode("login");
      return;
    }
    const password = values.get("password");
    if (mode === "signup" || mode === "update") {
      const passwordError = customerPasswordError(password);
      if (passwordError) return setError(passwordError);
      if (password !== values.get("confirmPassword")) return setError("تکرار رمز عبور با رمز جدید یکسان نیست.");
    }
    setBusy(true); setError(""); setMessage("");
    const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: mode === "update" ? "updatePassword" : mode, email, password, fullName: values.get("fullName") }) }).catch(() => null);
    const data = await response?.json().catch(() => null) as { error?: string; message?: string } | null;
    setBusy(false);
    if (!response?.ok) return setError(data?.error ?? "ارتباط برقرار نشد؛ دوباره تلاش کنید.");
    if (mode === "login") return window.location.assign(next);
    if (mode === "update") {
      setEmail("");
      setMode("identify");
      return setMessage(data?.message ?? "رمز عبور تغییر کرد؛ اکنون وارد شوید.");
    }
    if (mode === "signup") {
      setMode("confirmation");
      return setMessage(
        data?.message ??
          "درخواست ارسال ایمیل تأیید با موفقیت پذیرفته شد. ایمیل را باز کنید و روی پیوند بزنید؛ مستقیم وارد حساب می‌شوید.",
      );
    }
    setMessage(data?.message ?? "انجام شد.");
  }
  if (mode === "confirmation") return <div className="customer-auth"><p className="customer-auth__success" role="status">{message}</p></div>;
  if (mode === "callback") return <div className="customer-auth">{busy ? <p role="status">در حال ورود به حساب…</p> : null}{error ? <p className="customer-auth__error" role="alert">{error}</p> : null}</div>;
  return <div className="customer-auth">
    <form onSubmit={submit}>
      {mode === "identify" ? <label className="customer-auth__email-field"><span className="sr-only">ایمیل</span><input name="email" type="email" inputMode="email" autoComplete="email" dir="ltr" placeholder="ایمیل" required /></label> : null}
      {mode !== "identify" && mode !== "update" ? <p className="customer-auth__email" dir="ltr">{email}</p> : null}
      {mode === "signup" ? <label>نام و نام خانوادگی<input name="fullName" autoComplete="name" maxLength={100} required /></label> : null}
      {mode !== "identify" && mode !== "reset" ? <label>رمز عبور<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={10} required /></label> : null}
      {mode === "signup" || mode === "update" ? <><label>تکرار رمز عبور<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></label><small>حداقل ۱۰ نویسه شامل حروف بزرگ و کوچک انگلیسی، عدد و نشانه</small></> : null}
      {error ? <p className="customer-auth__error" role="alert">{error}</p> : null}{message ? <p className="customer-auth__success" role="status">{message}</p> : null}
      <button className="customer-auth__submit" disabled={busy}>{busy ? "در حال انجام…" : mode === "identify" ? "ادامه" : mode === "login" ? "ورود" : mode === "signup" ? "ساخت حساب" : mode === "update" ? "ذخیره رمز جدید" : "ارسال پیوند بازیابی"}</button>
    </form>
    {mode === "identify" ? <p className="customer-auth__terms">ورود شما به معنای پذیرش <a href="/terms">شرایط استفاده</a> و <a href="/privacy">حریم خصوصی</a> میران است.</p> : null}
    {mode === "login" ? <div className="customer-auth__links"><button className="customer-auth__link" type="button" onClick={() => setMode("reset")}>رمز عبور را فراموش کرده‌ام</button><button className="customer-auth__link" type="button" onClick={() => setMode("signup")}>ثبت‌نام</button></div> : null}
    {mode !== "identify" && mode !== "update" ? <button className="customer-auth__back" type="button" onClick={() => { setMode("identify"); setError(""); setMessage(""); }}>بازگشت</button> : null}
  </div>;
}

export function CustomerLogoutButton() {
  const [busy, setBusy] = useState(false);
  return <button className="customer-auth__submit" disabled={busy} onClick={async () => { setBusy(true); await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) }); window.location.assign("/"); }}>{busy ? "در حال خروج…" : "خروج امن"}</button>;
}
