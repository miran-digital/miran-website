"use client";

import { useState } from "react";
import type { CalendarMode } from "@/lib/jalali";
import { formatCalendarDateTime } from "@/lib/jalali";
import type { CustomerNotification } from "./customer-care-types";
import styles from "@/app/account/account.module.css";

export function NotificationCenter({
  initialNotifications,
  calendarMode,
}: {
  initialNotifications: CustomerNotification[];
  calendarMode: CalendarMode;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const unread = notifications.filter((item) => !item.readAt).length;

  async function markRead(id?: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(id ? { id } : { all: true }),
      });
      const payload = (await response.json()) as {
        notifications?: CustomerNotification[];
        error?: string;
      };
      if (!response.ok || !payload.notifications) throw new Error(payload.error || "به‌روزرسانی اعلان ممکن نشد.");
      setNotifications(payload.notifications);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "به‌روزرسانی اعلان ممکن نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.notificationSection} id="notifications" aria-labelledby="notifications-title">
      <div className={styles.sectionHeading}>
        <div>
          <p>اعلان‌های حساب</p>
          <h2 id="notifications-title">پیام‌های پشتیبانی و دیدگاه‌ها</h2>
        </div>
        <div className={styles.headingActions}>
          <span>{unread.toLocaleString("fa-IR")} خوانده‌نشده</span>
          {unread > 0 ? <button type="button" disabled={busy} onClick={() => void markRead()}>خواندن همه</button> : null}
        </div>
      </div>
      {message ? <p className={styles.status} role="alert">{message}</p> : null}
      {notifications.length === 0 ? (
        <p className={styles.emptyNotice}>اعلان تازه‌ای ندارید.</p>
      ) : (
        <div className={styles.notificationList}>
          {notifications.map((item) => (
            <article key={item.id} data-unread={!item.readAt}>
              <div>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
                <small>{formatCalendarDateTime(item.createdAt, calendarMode)}</small>
              </div>
              <div className={styles.notificationActions}>
                <a href={item.href}>مشاهده</a>
                {!item.readAt ? <button type="button" disabled={busy} onClick={() => void markRead(item.id)}>خواندم</button> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
