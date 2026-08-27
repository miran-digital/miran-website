"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  supportCategoryLabels,
  supportStatusLabels,
  type SupportTicket,
  type SupportTicketStatus,
} from "@/features/customer-care/customer-care-types";
import type { ProductReview } from "@/features/reviews/review-types";
import { formatCalendarDateTime, type CalendarMode } from "@/lib/jalali";
import styles from "./customer-care-panel.module.css";

const nextStatuses: Record<SupportTicketStatus, SupportTicketStatus[]> = {
  open: ["in_progress", "waiting_customer", "resolved", "closed"],
  in_progress: ["waiting_customer", "resolved", "closed"],
  waiting_customer: ["in_progress", "resolved", "closed"],
  resolved: ["open", "closed"],
  closed: [],
};

export function CustomerCarePanel({
  calendarMode,
  canSupport,
  canReviews,
  canDeleteSupport,
  canDeleteReviews,
}: {
  calendarMode: CalendarMode;
  canSupport: boolean;
  canReviews: boolean;
  canDeleteSupport: boolean;
  canDeleteReviews: boolean;
}) {
  const [view, setView] = useState<"support" | "reviews">(canSupport ? "support" : "reviews");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [selectedReviewId, setSelectedReviewId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selectedTicket = tickets.find((item) => item.id === selectedTicketId) ?? tickets[0];
  const selectedReview = reviews.find((item) => item.id === selectedReviewId) ?? reviews[0];
  const pendingReviews = useMemo(() => reviews.filter((item) => item.status === "pending").length, [reviews]);

  useEffect(() => {
    let active = true;
    Promise.all([
      canSupport ? fetch("/api/admin/support").then(readJson) : Promise.resolve({ tickets: [] }),
      canReviews ? fetch("/api/admin/reviews").then(readJson) : Promise.resolve({ reviews: [] }),
    ]).then(([supportPayload, reviewPayload]) => {
      if (!active) return;
      const supportRows = "tickets" in supportPayload && Array.isArray(supportPayload.tickets) ? supportPayload.tickets as SupportTicket[] : [];
      const reviewRows = "reviews" in reviewPayload && Array.isArray(reviewPayload.reviews) ? reviewPayload.reviews as ProductReview[] : [];
      setTickets(supportRows);
      setReviews(reviewRows);
      setSelectedTicketId(supportRows[0]?.id ?? "");
      setSelectedReviewId(reviewRows[0]?.id ?? "");
    }).catch((error) => {
      if (active) setMessage(error instanceof Error ? error.message : "خواندن مرکز ارتباط با مشتری ممکن نشد.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [canReviews, canSupport]);

  async function updateTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTicket) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/support", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: selectedTicket.id,
          status: data.get("status"),
          reply: data.get("reply"),
        }),
      });
      const payload = await readJson(response);
      if (!("ticket" in payload) || !payload.ticket) throw new Error("به‌روزرسانی تیکت ممکن نشد.");
      const ticket = payload.ticket as SupportTicket;
      setTickets((current) => current.map((item) => item.id === ticket.id ? ticket : item));
      setMessage("پاسخ و وضعیت تیکت ذخیره شد و اعلان حساب مشتری ایجاد شد.");
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "به‌روزرسانی تیکت ممکن نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function moderateReview(status: "approved" | "rejected", note: string) {
    if (!selectedReview) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/reviews", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: selectedReview.id, status, moderationNote: note }),
      });
      const payload = await readJson(response);
      if (!("review" in payload) || !payload.review) throw new Error("بررسی دیدگاه ممکن نشد.");
      const review = payload.review as ProductReview;
      setReviews((current) => current.map((item) => item.id === review.id ? review : item));
      setMessage(status === "approved" ? "دیدگاه منتشر شد و مشتری اعلان دریافت کرد." : "دیدگاه رد شد و دلیل برای مشتری ارسال شد.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "بررسی دیدگاه ممکن نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTicket() {
    if (!selectedTicket || !canDeleteSupport || busy) return;
    if (!window.confirm(`تیکت «${selectedTicket.subject}» و تمام پیام‌های آن برای همیشه حذف شوند؟`)) return;
    setBusy(true);
    setMessage("");
    try {
      await deleteRecord("/api/admin/support", selectedTicket.id, "حذف تیکت ممکن نشد.");
      setTickets((current) => current.filter((item) => item.id !== selectedTicket.id));
      setSelectedTicketId("");
      setMessage("تیکت و تمام پیام‌های آن حذف شد.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "حذف تیکت ممکن نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteReview() {
    if (!selectedReview || !canDeleteReviews || busy) return;
    if (!window.confirm("این دیدگاه برای همیشه از پایگاه‌داده و صفحه محصول حذف شود؟")) return;
    setBusy(true);
    setMessage("");
    try {
      await deleteRecord("/api/admin/reviews", selectedReview.id, "حذف دیدگاه ممکن نشد.");
      setReviews((current) => current.filter((item) => item.id !== selectedReview.id));
      setSelectedReviewId("");
      setMessage("دیدگاه حذف شد.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "حذف دیدگاه ممکن نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="customer-care-title">
      <header className={styles.heading}>
        <div><p>Customer Care</p><h1 id="customer-care-title">پشتیبانی و دیدگاه مشتریان</h1></div>
        <div className={styles.stats}><span>{tickets.filter((item) => item.status === "open").length.toLocaleString("fa-IR")} تیکت جدید</span><span>{pendingReviews.toLocaleString("fa-IR")} دیدگاه در انتظار</span></div>
      </header>
      <nav className={styles.tabs} aria-label="بخش ارتباط با مشتری">
        {canSupport ? <button type="button" data-active={view === "support"} onClick={() => setView("support")}>تیکت‌های پشتیبانی</button> : null}
        {canReviews ? <button type="button" data-active={view === "reviews"} onClick={() => setView("reviews")}>دیدگاه محصولات</button> : null}
      </nav>
      {message ? <p className={styles.message} role="status">{message}</p> : null}
      {loading ? <p>در حال خواندن اطلاعات…</p> : null}

      {!loading && view === "support" && canSupport ? (
        <div className={styles.workspace}>
          <div className={styles.list}>
            {tickets.length === 0 ? <p>تیکتی ثبت نشده است.</p> : tickets.map((ticket) => (
              <button key={ticket.id} type="button" data-active={ticket.id === selectedTicket?.id} onClick={() => setSelectedTicketId(ticket.id)}>
                <strong>{ticket.subject}</strong><span>{ticket.ticketNumber}</span><small>{supportStatusLabels[ticket.status]} · {ticket.customerName}</small>
              </button>
            ))}
          </div>
          {selectedTicket ? (
            <article className={styles.detail}>
              <header><div><h2>{selectedTicket.subject}</h2><small dir="ltr">{selectedTicket.customerEmail}</small></div><span>{supportStatusLabels[selectedTicket.status]}</span></header>
              <p>{supportCategoryLabels[selectedTicket.category]}{selectedTicket.orderNumber ? ` · سفارش ${selectedTicket.orderNumber}` : ""}</p>
              <div className={styles.messages}>
                {selectedTicket.messages.map((item) => <div key={item.id} data-author={item.authorRole}><strong>{item.authorRole === "admin" ? "مدیریت" : selectedTicket.customerName}</strong><p>{item.body}</p><small>{formatCalendarDateTime(item.createdAt, calendarMode)}</small></div>)}
              </div>
              <form className={styles.form} onSubmit={updateTicket}>
                <label>وضعیت
                  <select name="status" defaultValue={selectedTicket.status} key={selectedTicket.id + selectedTicket.status}>
                    <option value={selectedTicket.status}>{supportStatusLabels[selectedTicket.status]}</option>
                    {nextStatuses[selectedTicket.status].map((status) => <option key={status} value={status}>{supportStatusLabels[status]}</option>)}
                  </select>
                </label>
                <label>پاسخ به مشتری<textarea name="reply" maxLength={3000} rows={5} /></label>
                <button type="submit" disabled={busy}>{busy ? "در حال ذخیره…" : "ذخیره و ارسال اعلان"}</button>
                {canDeleteSupport ? <button className={styles.dangerButton} type="button" disabled={busy} onClick={() => void deleteTicket()}>حذف کامل تیکت</button> : null}
              </form>
            </article>
          ) : null}
        </div>
      ) : null}

      {!loading && view === "reviews" && canReviews ? (
        <div className={styles.workspace}>
          <div className={styles.list}>
            {reviews.length === 0 ? <p>دیدگاهی ثبت نشده است.</p> : reviews.map((review) => (
              <button key={review.id} type="button" data-active={review.id === selectedReview?.id} onClick={() => setSelectedReviewId(review.id)}>
                <strong>{review.productTitle}</strong><span>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span><small>{review.status === "pending" ? "در انتظار بررسی" : review.status === "approved" ? "منتشرشده" : "ردشده"}</small>
              </button>
            ))}
          </div>
          {selectedReview ? <ReviewDetail key={selectedReview.id + selectedReview.status} review={selectedReview} busy={busy} calendarMode={calendarMode} canDelete={canDeleteReviews} onModerate={moderateReview} onDelete={deleteReview} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function ReviewDetail({ review, busy, calendarMode, canDelete, onModerate, onDelete }: { review: ProductReview; busy: boolean; calendarMode: CalendarMode; canDelete: boolean; onModerate: (status: "approved" | "rejected", note: string) => Promise<void>; onDelete: () => Promise<void> }) {
  const [note, setNote] = useState(review.moderationNote);
  return (
    <article className={styles.detail}>
      <header><div><h2>{review.productTitle}</h2><small>{review.customerName} · <span dir="ltr">{review.customerEmail}</span></small></div><span>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span></header>
      {review.title ? <h3>{review.title}</h3> : null}<p>{review.body}</p><small>{formatCalendarDateTime(review.createdAt, calendarMode)}</small>
      <label className={styles.note}>یادداشت بررسی<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={4} /></label>
      {review.status === "pending" ? <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void onModerate("approved", note)}>تأیید و انتشار</button><button type="button" disabled={busy || note.trim().length < 3} onClick={() => void onModerate("rejected", note)}>رد با دلیل</button></div> : <p>این دیدگاه قبلاً بررسی شده است.</p>}
      {canDelete ? <button className={styles.dangerButton} type="button" disabled={busy} onClick={() => void onDelete()}>حذف کامل دیدگاه</button> : null}
    </article>
  );
}

async function deleteRecord(path: string, id: string, fallback: string) {
  const response = await fetch(path, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const payload = await response.json().catch(() => ({})) as { deleted?: boolean; error?: string };
  if (!response.ok || payload.deleted !== true) throw new Error(payload.error || fallback);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "درخواست ممکن نشد.");
  return payload;
}
