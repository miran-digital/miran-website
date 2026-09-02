"use client";

import { useEffect, useState } from "react";
import { adminOrderHref } from "@/lib/admin-navigation";
import { formatCalendarDateTime, type CalendarMode } from "@/lib/jalali";
import { formatMoney } from "@/lib/money";
import { deliveryLabels, orderStatusLabels, paymentStatusLabels } from "@/features/orders/order-types";
import { supportStatusLabels, type SupportTicketStatus } from "@/features/customer-care/customer-care-types";
import type { CustomerProfile } from "./customer-directory-types";
import styles from "./customer-detail-panel.module.css";

export function CustomerDetailPanel({ customerId, calendarMode, canViewOrders }: {
  customerId: string; calendarMode: CalendarMode; canViewOrders: boolean;
}) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [ordersPage, setOrdersPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const date = (value: string) => value ? formatCalendarDateTime(value, calendarMode) : "ثبت نشده";
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ ordersPage: String(ordersPage), activityPage: String(activityPage) });
    void fetch(`/api/admin/customers/${encodeURIComponent(customerId)}?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { profile?: CustomerProfile; error?: string };
        if (!response.ok || !payload.profile) throw new Error(payload.error || "خواندن پرونده مشتری ممکن نشد.");
        if (!controller.signal.aborted) { setProfile(payload.profile); setError(""); }
      })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "خواندن پرونده مشتری ممکن نشد."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activityPage, customerId, ordersPage]);

  return <section className={styles.panel} aria-label="پروندهٔ فقط‌خواندنی مشتری" aria-busy={loading}>
    <nav className={styles.back} aria-label="مسیر پرونده مشتری"><a href="/admin?tab=customers">بازگشت به مشتریان</a><span>پروندهٔ مشتری · فقط مشاهده</span></nav>
    {error ? <p role="alert" className={styles.message}>{error}</p> : null}
    {loading ? <p role="status">در حال خواندن پرونده…</p> : null}
    {profile && !error ? <>
      <article className={styles.card}>
        <h1>{profile.customer.fullName || "مشتری بدون نام"}</h1>
        <dl className={styles.facts}>
          <Fact label="ایمیل" value={profile.customer.email} ltr />
          <Fact label="وضعیت تأیید" value={profile.customer.emailConfirmedAt ? `تأییدشده · ${date(profile.customer.emailConfirmedAt)}` : "تأیید ایمیل ثبت نشده"} />
          <Fact label="ارائه‌دهندهٔ هویت" value={profile.customer.provider === "store" ? "سابقهٔ فروشگاه؛ بدون هویت ورود ثبت‌شده" : profile.customer.provider} />
          <Fact label="شناسهٔ ورود" value={profile.customer.authUserId || "ثبت نشده"} ltr />
          <Fact label="تاریخ ثبت" value={date(profile.customer.registeredAt)} />
          <Fact label="آخرین فعالیت ثبت‌شده" value={date(profile.customer.lastSeenAt)} />
          <Fact label="شماره‌های تماس ثبت‌شده" value={profile.phoneNumbers.join(" · ") || "ثبت نشده"} ltr />
          <Fact label="خرید پرداخت‌شدهٔ ریالی" value={formatMoney(profile.paidTotalRial)} />
        </dl>
        {profile.legacyPaidOrderCount > 0 ? <p>سوابق پرداخت‌شدهٔ غیرریالی در جمع ریالی لحاظ نشده‌اند.</p> : null}
        <div className={styles.stats}><span>{profile.customer.orderCount.toLocaleString("fa-IR")} سفارش</span><span>{profile.customer.addressCount.toLocaleString("fa-IR")} نشانی</span><span>{profile.customer.ticketCount.toLocaleString("fa-IR")} تیکت</span><span>{profile.customer.reviewCount.toLocaleString("fa-IR")} دیدگاه</span></div>
      </article>
      <article className={styles.card}>
        <h2>تمام نشانی‌های ثبت‌شده</h2>
        {profile.addresses.length === 0 ? <p>نشانی ثبت نشده است.</p> : <div className={styles.addresses}>{profile.addresses.map((address) => <section key={address.id}>
          <h3>{address.label || "نشانی"}{address.isDefault ? " · پیش‌فرض" : ""}</h3><p>{address.recipientName} · <bdi>{address.phone}</bdi></p>
          <p>{address.province}، {address.city}، {address.addressLine}</p><p>کد پستی: <bdi>{address.postcode || "ثبت نشده"}</bdi></p>
        </section>)}</div>}
      </article>
      <article className={styles.card}>
        <h2>سفارش‌های مشتری</h2>
        {profile.orders.length === 0 ? <p>سفارشی ثبت نشده است.</p> : profile.orders.map((order) => <section className={styles.order} key={order.id}>
          <header><h3><bdi>{order.orderNumber}</bdi></h3>{canViewOrders ? <a href={adminOrderHref(order.id)}>مشاهده سفارش</a> : null}</header>
          <dl className={styles.facts}><Fact label="تاریخ" value={date(order.createdAt)} /><Fact label="وضعیت سفارش" value={orderStatusLabels[order.status]} /><Fact label="وضعیت پرداخت" value={paymentStatusLabels[order.paymentStatus]} /><Fact label="مبلغ کل" value={recordedMoney(order.totalMinor, order.currency)} /><Fact label="روش ارسال" value={deliveryLabels[order.deliveryMethod]} /><Fact label="نشانی سفارش" value={order.deliveryAddress} /></dl>
          <ul className={styles.items}>{order.items.map((item) => <li key={item.id}>
            <strong>{item.title}</strong><span>کد کالا: <bdi>{item.sku}</bdi> · {item.selectionLabel || "فروش مستقیم میران"}</span>
            <span>{item.quantity.toLocaleString("fa-IR")} عدد × {recordedMoney(item.unitPriceMinor, order.currency)} · جمع: {recordedMoney(item.lineTotalMinor, order.currency)}</span>
          </li>)}</ul>
          {order.payments.length ? <dl className={styles.payments}>{order.payments.map((payment, index) => <div key={`${payment.provider}-${payment.createdAt}-${index}`}><dt>{payment.provider} · {paymentStatusLabels[payment.status as keyof typeof paymentStatusLabels] ?? payment.status}</dt><dd>{payment.reference ? <>مرجع پرداخت: <bdi>{payment.reference}</bdi></> : "بدون مرجع تأییدشده"} · {date(payment.createdAt)}</dd></div>)}</dl> : null}
        </section>)}
        <Pager label="سفارش‌های مشتری" page={profile.ordersPage} pages={profile.ordersPages} loading={loading} onChange={(next) => { setLoading(true); setOrdersPage(next); }} />
      </article>
      <div className={styles.activity}>
        <article className={styles.card}><h2>تیکت‌های پشتیبانی</h2>{profile.tickets.length === 0 ? <p>تیکتی در این صفحه نیست.</p> : profile.tickets.map((ticket) => <section key={ticket.id}><h3>{ticket.subject}</h3><p><bdi>{ticket.number}</bdi> · {supportStatusLabels[ticket.status as SupportTicketStatus] ?? ticket.status}</p><small>ثبت: {date(ticket.createdAt)} · آخرین تغییر: {date(ticket.updatedAt)}</small></section>)}</article>
        <article className={styles.card}><h2>دیدگاه‌ها</h2>{profile.reviews.length === 0 ? <p>دیدگاهی در این صفحه نیست.</p> : profile.reviews.map((review) => <section key={review.id}><h3>{review.productTitle || "محصول بایگانی‌شده"}</h3><p>{review.rating.toLocaleString("fa-IR")} از ۵ · {({ pending: "در انتظار", approved: "منتشرشده", rejected: "ردشده" } as Record<string, string>)[review.status] ?? review.status}</p>{review.title ? <strong>{review.title}</strong> : null}<p>{review.body}</p><small>{date(review.createdAt)}</small></section>)}</article>
      </div>
      <Pager label="تیکت‌ها و دیدگاه‌ها" page={profile.activityPage} pages={profile.activityPages} loading={loading} onChange={(next) => { setLoading(true); setActivityPage(next); }} />
    </> : null}
  </section>;
}

function Fact({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return <div><dt>{label}</dt><dd dir={ltr ? "ltr" : undefined}>{value}</dd></div>;
}

function Pager({ label, page, pages, loading, onChange }: { label: string; page: number; pages: number; loading: boolean; onChange: (next: number) => void }) {
  if (pages <= 1) return null;
  return <nav className={styles.pagination} aria-label={label}><button type="button" disabled={loading || page <= 1} onClick={() => onChange(page - 1)}>قبلی</button><span>{page.toLocaleString("fa-IR")} / {pages.toLocaleString("fa-IR")}</span><button type="button" disabled={loading || page >= pages} onClick={() => onChange(page + 1)}>بعدی</button></nav>;
}

function recordedMoney(amount: number, currency: string) {
  return currency === "IRR" ? formatMoney(amount) : `${amount.toLocaleString("fa-IR")} واحد خرد ${currency} (سابقهٔ قدیمی)`;
}
