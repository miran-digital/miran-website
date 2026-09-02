"use client";

import { useEffect, useState } from "react";
import { customerProfileHref } from "@/lib/admin-navigation";
import { formatCalendarDateTime, type CalendarMode } from "@/lib/jalali";
import type { CustomerDirectoryPayload, CustomerSort } from "./customer-directory-types";
import styles from "./customer-directory-panel.module.css";

export function CustomerDirectoryPanel({ calendarMode }: { calendarMode: CalendarMode }) {
  const [payload, setPayload] = useState<CustomerDirectoryPayload | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CustomerSort>("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<25 | 50>(25);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [message, setMessage] = useState("");
  const customers = payload?.customers ?? [];

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setLoadFailed(false);
      const params = new URLSearchParams({ q: query, sort, page: String(page), pageSize: String(pageSize) });
      void fetch("/api/admin/customers?" + params, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          const next = await response.json() as CustomerDirectoryPayload & { error?: string };
          if (!response.ok || !Array.isArray(next.customers) || !Number.isSafeInteger(next.total)) {
            throw new Error(next.error || "خواندن فهرست مشتریان ممکن نشد.");
          }
          if (controller.signal.aborted) return;
          setPayload(next);
          setMessage(next.warning ?? "");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setLoadFailed(true);
          setPayload(null);
          setMessage(error instanceof Error ? error.message : "خواندن فهرست مشتریان ممکن نشد.");
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [page, pageSize, query, sort]);

  return (
    <section className={styles.panel} aria-labelledby="customer-directory-title" aria-busy={loading}>
      <h1 className={styles.visuallyHidden} id="customer-directory-title">فهرست مشتریان</h1>
      <div className={styles.toolbar}>
        <label className={styles.search}>جست‌وجوی مشتری
          <input type="search" value={query} maxLength={120} placeholder="نام یا ایمیل" onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
        </label>
        <label>مرتب‌سازی
          <select value={sort} onChange={(event) => { setSort(event.target.value as CustomerSort); setPage(1); }}>
            <option value="newest">جدیدترین</option><option value="oldest">قدیمی‌ترین</option>
            <option value="name">نام</option><option value="orders">تعداد سفارش</option><option value="activity">آخرین فعالیت ثبت‌شده</option>
          </select>
        </label>
        <label>تعداد در صفحه
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as 25 | 50); setPage(1); }}>
            <option value={25}>۲۵</option><option value={50}>۵۰</option>
          </select>
        </label>
        {payload && !loadFailed ? <strong className={styles.count}>{payload.total.toLocaleString("fa-IR")} مشتری</strong> : null}
      </div>
      {message ? <p className={styles.message} role={loadFailed ? "alert" : "status"}>{message}</p> : null}
      {loading ? <p role="status">در حال خواندن مشتریان…</p> : null}
      {!loading && !loadFailed && customers.length === 0 ? <p>{query ? "مشتری مطابق جست‌وجو پیدا نشد." : "هنوز مشتری ثبت نشده است."}</p> : null}
      {customers.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.visuallyHidden}>مشتریان و خلاصهٔ فعالیت ثبت‌شدهٔ آنان</caption>
            <thead><tr><th scope="col">نام و ایمیل</th><th scope="col">وضعیت حساب</th><th scope="col">سفارش</th><th scope="col">نشانی</th><th scope="col">تیکت</th><th scope="col">دیدگاه</th><th scope="col">تاریخ ثبت</th><th scope="col">آخرین فعالیت</th><th scope="col">پرونده</th></tr></thead>
            <tbody>{customers.map((customer) => {
              const href = customerProfileHref(customer.customerId);
              return <tr key={customer.customerId}>
                <th scope="row" className={styles.identity}><a href={href}>{customer.fullName || "مشتری بدون نام"}</a><a href={href} dir="ltr">{customer.email}</a></th>
                <td data-label="وضعیت حساب">{customer.emailConfirmedAt ? "ایمیل تأییدشده" : customer.authUserId ? "تأیید ایمیل ثبت نشده" : "سابقهٔ فروشگاه"}</td>
                <td data-label="سفارش">{customer.orderCount.toLocaleString("fa-IR")}</td>
                <td data-label="نشانی">{customer.addressCount.toLocaleString("fa-IR")}</td>
                <td data-label="تیکت">{customer.ticketCount.toLocaleString("fa-IR")}</td>
                <td data-label="دیدگاه">{customer.reviewCount.toLocaleString("fa-IR")}</td>
                <td data-label="تاریخ ثبت">{customer.registeredAt ? formatCalendarDateTime(customer.registeredAt, calendarMode) : "ثبت نشده"}</td>
                <td data-label="آخرین فعالیت">{customer.lastSeenAt ? formatCalendarDateTime(customer.lastSeenAt, calendarMode) : "داده‌ای موجود نیست"}</td>
                <td className={styles.view}><a href={href} aria-label={"مشاهده پرونده " + (customer.fullName || customer.email)}>مشاهده</a></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      ) : null}
      {payload && !loadFailed ? <nav className={styles.pagination} aria-label="صفحه‌بندی مشتریان">
        <button type="button" disabled={loading || payload.page <= 1} onClick={() => setPage(payload.page - 1)}>قبلی</button>
        <span>صفحهٔ {payload.page.toLocaleString("fa-IR")} از {payload.totalPages.toLocaleString("fa-IR")}</span>
        <button type="button" disabled={loading || payload.page >= payload.totalPages} onClick={() => setPage(payload.page + 1)}>بعدی</button>
      </nav> : null}
    </section>
  );
}
