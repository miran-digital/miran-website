"use client";

import { useEffect, useState } from "react";
import { formatCalendarDateTime, type CalendarMode } from "@/lib/jalali";
import { formatMoney, formatRialReference } from "@/lib/money";
import type { OperationalReport } from "./report-types";
import styles from "./admin-reports-panel.module.css";

export function AdminReportsPanel({ calendarMode }: { calendarMode: CalendarMode }) {
  const [report, setReport] = useState<OperationalReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/reports", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { report?: OperationalReport; error?: string };
        if (!response.ok || !payload.report) throw new Error(payload.error || "گزارش در دسترس نیست.");
        return payload.report;
      })
      .then((nextReport) => { if (active) setReport(nextReport); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "گزارش در دسترس نیست."); });
    return () => { active = false; };
  }, []);

  if (error) return <p className={styles.message} role="alert">{error}</p>;
  if (!report) return <p className={styles.message} role="status">در حال آماده‌سازی گزارش…</p>;
  const operationalAlerts = [
    ["رزرو منقضی", report.operations.staleReservations],
    ["پرداخت معطل", report.operations.stalePaymentAttempts],
    ["تیکت قدیمی", report.operations.oldOpenSupportTickets],
  ] as const;

  return (
    <section className={styles.panel} aria-labelledby="reports-title">
      <header className={styles.heading}>
        <div><p>Reporting & Operations</p><h1 id="reports-title">گزارش فروش و سلامت عملیات</h1></div>
        <div><small>به‌روزرسانی {formatCalendarDateTime(report.generatedAt, calendarMode)}</small><a href="/api/admin/reports?format=csv">دریافت CSV</a></div>
      </header>
      <div className={styles.stats}>
        <Stat label="کل سفارش‌ها" value={report.commerce.totalOrders.toLocaleString("fa-IR")} />
        <Stat label="سفارش پرداخت‌شده" value={report.commerce.paidOrders.toLocaleString("fa-IR")} />
        <Stat label="درآمد قطعی" value={formatMoney(report.commerce.paidRevenueRial)} detail={formatRialReference(report.commerce.paidRevenueRial)} />
        <Stat label="مشتریان یکتا" value={report.commerce.customerCount.toLocaleString("fa-IR")} />
        <Stat label="کالای فروخته‌شده" value={report.commerce.paidUnits.toLocaleString("fa-IR")} />
        <Stat label="محصول قابل نمایش" value={report.catalog.visibleProducts.toLocaleString("fa-IR")} />
        <Stat label="ناموجود" value={report.catalog.outOfStockProducts.toLocaleString("fa-IR")} />
        <Stat label="هشدار موجودی" value={report.catalog.lowStockProducts.toLocaleString("fa-IR")} />
      </div>
      <div className={styles.columns}>
        <article className={styles.card}>
          <h2>سلامت عملیاتی</h2>
          <ul className={styles.healthList}>
            {operationalAlerts.map(([label, value]) => <li key={label} data-alert={value > 0}><span>{label}</span><strong>{value.toLocaleString("fa-IR")}</strong></li>)}
            <li data-alert={false}><span>درخواست مسدودشده در ۲۴ ساعت</span><strong>{report.operations.blockedRequestsLast24Hours.toLocaleString("fa-IR")}</strong></li>
            <li data-alert={false}><span>رویداد مدیریتی در ۲۴ ساعت</span><strong>{report.operations.auditEventsLast24Hours.toLocaleString("fa-IR")}</strong></li>
          </ul>
        </article>
        <article className={styles.card}>
          <h2>ارتباط با مشتری</h2>
          <dl className={styles.metrics}>
            <div><dt>تیکت باز</dt><dd>{report.operations.openSupportTickets.toLocaleString("fa-IR")}</dd></div>
            <div><dt>منتظر مشتری</dt><dd>{report.operations.waitingSupportTickets.toLocaleString("fa-IR")}</dd></div>
            <div><dt>دیدگاه در انتظار</dt><dd>{report.operations.pendingReviews.toLocaleString("fa-IR")}</dd></div>
            <div><dt>دیدگاه منتشرشده</dt><dd>{report.operations.approvedReviews.toLocaleString("fa-IR")}</dd></div>
          </dl>
        </article>
      </div>
      <article className={styles.card}>
        <h2>محصولات پرفروش قطعی</h2>
        {report.topProducts.length === 0 ? <p>هنوز فروش پرداخت‌شدهٔ ریالی ثبت نشده است.</p> : <div className={styles.tableWrap}><table><caption>۱۰ محصول برتر بر پایه فروش پرداخت‌شدهٔ ریالی</caption><thead><tr><th scope="col">محصول</th><th scope="col">تعداد</th><th scope="col">درآمد</th></tr></thead><tbody>{report.topProducts.map((product) => <tr key={product.productId}><td>{product.title}</td><td>{product.quantity.toLocaleString("fa-IR")}</td><td>{formatMoney(product.revenueRial)}</td></tr>)}</tbody></table></div>}
      </article>
      <article className={styles.card}>
        <h2>فروش ۳۰ روز اخیر</h2>
        {report.dailySales.length === 0 ? <p>در ۳۰ روز اخیر سفارشی ثبت نشده است.</p> : <div className={styles.tableWrap}><table><caption>تعداد سفارش و درآمد قطعی در روزهای دارای سفارش</caption><thead><tr><th scope="col">تاریخ</th><th scope="col">سفارش</th><th scope="col">درآمد قطعی</th></tr></thead><tbody>{report.dailySales.map((day) => <tr key={day.day}><td>{formatCalendarDateTime(`${day.day}T00:00:00.000Z`, calendarMode)}</td><td>{day.orderCount.toLocaleString("fa-IR")}</td><td>{formatMoney(day.paidRevenueRial)}</td></tr>)}</tbody></table></div>}
      </article>
    </section>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <article><span>{label}</span><strong>{value}</strong>{detail ? <small>{detail}</small> : null}</article>;
}
