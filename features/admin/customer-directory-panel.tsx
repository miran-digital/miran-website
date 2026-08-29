"use client";

import { useEffect, useState } from "react";
import type { AdminCustomerSummary } from "@/db/customer-account-repository";
import { formatCalendarDateTime, type CalendarMode } from "@/lib/jalali";
import styles from "./customer-directory-panel.module.css";

export function CustomerDirectoryPanel({
  calendarMode,
  canDelete,
}: {
  calendarMode: CalendarMode;
  canDelete: boolean;
}) {
  const [customers, setCustomers] = useState<AdminCustomerSummary[]>([]);
  const [supabaseAdminReady, setSupabaseAdminReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busyEmail, setBusyEmail] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/customers", { cache: "no-store" })
      .then(readPayload)
      .then((payload) => {
        if (!active) return;
        setCustomers(payload.customers);
        setSupabaseAdminReady(payload.supabaseAdminReady);
        setMessage(payload.warning ?? "");
        setLoadFailed(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadFailed(true);
        setMessage(error instanceof Error ? error.message : "خواندن فهرست مشتریان ممکن نشد.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function removeCustomer(customer: AdminCustomerSummary, deleteAuth: boolean) {
    if (!canDelete || busyEmail) return;
    if (customer.orderCount > 0) {
      setMessage("ابتدا سفارش‌های این مشتری را از بخش سفارش‌ها حذف کنید.");
      return;
    }
    const prompt = deleteAuth
      ? `حساب ورود «${customer.email}» و تمام اطلاعات فروشگاه او برای همیشه حذف شود؟`
      : `اطلاعات فروشگاه «${customer.email}» پاک شود؟ حساب ورود Supabase جداگانه باقی می‌ماند.`;
    if (!window.confirm(prompt)) return;
    setBusyEmail(customer.email);
    setMessage("");
    try {
      const response = await fetch("/api/admin/customers", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: customer.email, deleteAuth }),
      });
      const payload = await response.json().catch(() => ({})) as { deleted?: boolean; error?: string };
      if (!response.ok || payload.deleted !== true) throw new Error(payload.error || "حذف مشتری ممکن نشد.");
      setCustomers((items) => items.filter((item) => item.email !== customer.email));
      setMessage(deleteAuth ? "حساب ورود و اطلاعات مشتری حذف شد." : "اطلاعات مشتری از فروشگاه پاک شد.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "حذف مشتری ممکن نشد.");
    } finally {
      setBusyEmail("");
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="customer-directory-title">
      <header>
        <div><p>Customers</p><h1 id="customer-directory-title">ایمیل‌ها و حساب‌های مشتریان</h1></div>
        <strong>{customers.length.toLocaleString("fa-IR")} مشتری</strong>
      </header>
      {!supabaseAdminReady ? (
        <div className={styles.notice}>
          <p>ایمیل‌های ثبت‌شده و شناخته‌شده فروشگاه نمایش داده می‌شوند. حذف مستقیم هویت ورود تا زمان اتصال امن دسترسی مدیریتی Supabase فعال نیست.</p>
          <a href="https://supabase.com/dashboard/project/xnfgwhlijifhrytzvciu/auth/users" target="_blank" rel="noreferrer">حذف حساب ورود در Supabase</a>
        </div>
      ) : null}
      {message ? <p className={styles.message} role={loadFailed ? "alert" : "status"}>{message}</p> : null}
      {loading ? <p>در حال خواندن مشتریان…</p> : null}
      {!loading && !loadFailed && customers.length === 0 ? <p>هنوز ایمیل مشتری ثبت نشده است.</p> : null}
      <div className={styles.list}>
        {customers.map((customer) => (
          <article key={customer.email}>
            <div className={styles.identity}>
              <strong>{customer.fullName || "مشتری بدون نام"}</strong>
              <span dir="ltr">{customer.email}</span>
              <small>{customer.provider === "supabase" ? (customer.emailConfirmedAt ? "ایمیل تأییدشده" : "در انتظار تأیید ایمیل") : "شناخته‌شده از اطلاعات فروشگاه"}</small>
            </div>
            <dl>
              <div><dt>سفارش</dt><dd>{customer.orderCount.toLocaleString("fa-IR")}</dd></div>
              <div><dt>نشانی</dt><dd>{customer.addressCount.toLocaleString("fa-IR")}</dd></div>
              <div><dt>تیکت</dt><dd>{customer.ticketCount.toLocaleString("fa-IR")}</dd></div>
              <div><dt>دیدگاه</dt><dd>{customer.reviewCount.toLocaleString("fa-IR")}</dd></div>
            </dl>
            {customer.registeredAt ? <small>ثبت: {formatCalendarDateTime(customer.registeredAt, calendarMode)}</small> : null}
            {canDelete ? (
              <div className={styles.actions}>
                {supabaseAdminReady ? <button type="button" disabled={busyEmail === customer.email || customer.orderCount > 0} onClick={() => void removeCustomer(customer, true)}>حذف کامل حساب</button> : null}
                <button type="button" disabled={busyEmail === customer.email || customer.orderCount > 0} onClick={() => void removeCustomer(customer, false)}>پاک‌سازی اطلاعات فروشگاه</button>
              </div>
            ) : null}
            {customer.orderCount > 0 ? <small className={styles.blocker}>برای حذف مشتری، ابتدا سفارش‌های او حذف شوند.</small> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

async function readPayload(response: Response) {
  const payload = await response.json().catch(() => ({})) as {
    customers?: AdminCustomerSummary[];
    supabaseAdminReady?: boolean;
    warning?: string;
    error?: string;
  };
  if (!response.ok || !Array.isArray(payload.customers)) {
    throw new Error(payload.error || "خواندن فهرست مشتریان ممکن نشد.");
  }
  return {
    customers: payload.customers,
    supabaseAdminReady: payload.supabaseAdminReady === true,
    warning: payload.warning,
  };
}
