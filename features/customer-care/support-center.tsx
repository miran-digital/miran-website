"use client";

import { useState, type FormEvent } from "react";
import type { CalendarMode } from "@/lib/jalali";
import { formatCalendarDateTime } from "@/lib/jalali";
import {
  supportCategoryLabels,
  supportStatusLabels,
  type SupportTicket,
  type SupportTicketCategory,
} from "./customer-care-types";
import styles from "@/app/account/account.module.css";

export function SupportCenter({
  initialTickets,
  orderNumbers,
  calendarMode,
}: {
  initialTickets: SupportTicket[];
  orderNumbers: string[];
  calendarMode: CalendarMode;
}) {
  const [tickets, setTickets] = useState(initialTickets);
  const [selectedId, setSelectedId] = useState(initialTickets[0]?.id ?? "");
  const [showForm, setShowForm] = useState(initialTickets.length === 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selected = tickets.find((item) => item.id === selectedId) ?? tickets[0];

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: formData.get("subject"),
          category: formData.get("category"),
          orderNumber: formData.get("orderNumber"),
          body: formData.get("body"),
        }),
      });
      const payload = (await response.json()) as { ticket?: SupportTicket; error?: string };
      if (!response.ok || !payload.ticket) throw new Error(payload.error || "ثبت درخواست ممکن نشد.");
      setTickets((current) => [payload.ticket!, ...current]);
      setSelectedId(payload.ticket.id);
      setShowForm(false);
      setMessage("درخواست پشتیبانی ثبت شد.");
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ثبت درخواست ممکن نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "");
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/support", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: selected.id, body }),
      });
      const payload = (await response.json()) as { ticket?: SupportTicket; error?: string };
      if (!response.ok || !payload.ticket) throw new Error(payload.error || "ارسال پاسخ ممکن نشد.");
      setTickets((current) => current.map((item) => item.id === payload.ticket!.id ? payload.ticket! : item));
      setMessage("پاسخ شما ارسال شد.");
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ارسال پاسخ ممکن نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.supportSection} id="support" aria-labelledby="support-title">
      <div className={styles.sectionHeading}>
        <div>
          <p>مرکز پشتیبانی</p>
          <h2 id="support-title">درخواست‌ها و پاسخ‌های من</h2>
        </div>
        <button type="button" onClick={() => setShowForm((value) => !value)}>{showForm ? "بستن فرم" : "درخواست جدید"}</button>
      </div>

      {showForm ? (
        <form className={styles.supportForm} onSubmit={createTicket}>
          <label>موضوع<input name="subject" required minLength={5} maxLength={160} /></label>
          <label>دسته درخواست
            <select name="category" defaultValue="order">
              {(Object.entries(supportCategoryLabels) as [SupportTicketCategory, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>سفارش مرتبط (اختیاری)
            <select name="orderNumber" defaultValue="">
              <option value="">بدون سفارش مشخص</option>
              {orderNumbers.map((number) => <option key={number} value={number}>{number}</option>)}
            </select>
          </label>
          <label className={styles.fullWidth}>شرح درخواست<textarea name="body" required minLength={10} maxLength={3000} rows={5} /></label>
          <button type="submit" disabled={busy}>{busy ? "در حال ثبت…" : "ثبت درخواست"}</button>
        </form>
      ) : null}

      {message ? <p className={styles.status} role="status">{message}</p> : null}
      {tickets.length === 0 ? (
        <p className={styles.emptyNotice}>هنوز درخواست پشتیبانی ثبت نکرده‌اید.</p>
      ) : (
        <div className={styles.supportWorkspace}>
          <div className={styles.ticketList} role="list" aria-label="تیکت‌ها">
            {tickets.map((ticket) => (
              <button key={ticket.id} type="button" data-active={ticket.id === selected?.id} onClick={() => setSelectedId(ticket.id)}>
                <strong>{ticket.subject}</strong>
                <span>{ticket.ticketNumber} · {supportStatusLabels[ticket.status]}</span>
              </button>
            ))}
          </div>
          {selected ? (
            <article className={styles.ticketDetail}>
              <header>
                <div><h3>{selected.subject}</h3><small dir="ltr">{selected.ticketNumber}</small></div>
                <span>{supportStatusLabels[selected.status]}</span>
              </header>
              <p>{supportCategoryLabels[selected.category]}{selected.orderNumber ? ` · سفارش ${selected.orderNumber}` : ""}</p>
              <div className={styles.messageList}>
                {selected.messages.map((item) => (
                  <div key={item.id} data-author={item.authorRole}>
                    <strong>{item.authorRole === "admin" ? "پشتیبانی میران" : "شما"}</strong>
                    <p>{item.body}</p>
                    <small>{formatCalendarDateTime(item.createdAt, calendarMode)}</small>
                  </div>
                ))}
              </div>
              {selected.status !== "closed" ? (
                <form className={styles.replyForm} onSubmit={reply}>
                  <label>پاسخ شما<textarea name="body" required minLength={2} maxLength={3000} rows={4} /></label>
                  <button type="submit" disabled={busy}>{busy ? "در حال ارسال…" : "ارسال پاسخ"}</button>
                </form>
              ) : <p className={styles.closedNote}>این تیکت بسته شده است.</p>}
            </article>
          ) : null}
        </div>
      )}
    </section>
  );
}
