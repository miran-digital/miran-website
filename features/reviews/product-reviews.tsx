"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { CalendarMode } from "@/lib/jalali";
import { formatCalendarDateTime } from "@/lib/jalali";
import type {
  CustomerReviewState,
  ProductReview,
  PublicProductReview,
} from "./review-types";
import styles from "./product-reviews.module.css";

export function ProductReviews({
  productId,
  approvedReviews,
  customerState,
  signedIn,
  signInHref,
  calendarMode,
}: {
  productId: string;
  approvedReviews: PublicProductReview[];
  customerState: CustomerReviewState;
  signedIn: boolean;
  signInHref: string;
  calendarMode: CalendarMode;
}) {
  const [review, setReview] = useState(customerState.review);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const average = useMemo(
    () => approvedReviews.length
      ? approvedReviews.reduce((sum, item) => sum + item.rating, 0) / approvedReviews.length
      : 0,
    [approvedReviews],
  );
  const canSubmit = customerState.eligible && (!review || review.status === "rejected");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId,
          rating: Number(data.get("rating")),
          title: data.get("title"),
          body: data.get("body"),
        }),
      });
      const payload = (await response.json()) as { review?: ProductReview; error?: string };
      if (!response.ok || !payload.review) throw new Error(payload.error || "ثبت دیدگاه ممکن نشد.");
      setReview(payload.review);
      setMessage("دیدگاه ثبت شد و پس از بررسی مدیر منتشر می‌شود.");
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ثبت دیدگاه ممکن نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.section} id="reviews" aria-labelledby="reviews-title">
      <div className={styles.heading}>
        <div>
          <p>تجربه خریداران</p>
          <h2 id="reviews-title">دیدگاه‌های تأییدشده</h2>
        </div>
        <div className={styles.summary} aria-label={`میانگین ${average.toFixed(1)} از ۵`}>
          <strong>{average ? average.toLocaleString("fa-IR", { maximumFractionDigits: 1 }) : "—"}</strong>
          <span aria-hidden="true">★★★★★</span>
          <small>{approvedReviews.length.toLocaleString("fa-IR")} دیدگاه</small>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.reviewList}>
          {approvedReviews.length === 0 ? (
            <p className={styles.empty}>هنوز دیدگاه تأییدشده‌ای برای این محصول ثبت نشده است.</p>
          ) : approvedReviews.map((item) => (
            <article key={item.id}>
              <header><strong>{item.customerName}</strong><span aria-label={`${item.rating} از ۵`}>{"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)}</span></header>
              {item.title ? <h3>{item.title}</h3> : null}
              <p>{item.body}</p>
              <small>{formatCalendarDateTime(item.createdAt, calendarMode)}</small>
            </article>
          ))}
        </div>

        <aside className={styles.formCard} aria-labelledby="write-review-title">
          <h3 id="write-review-title">ثبت دیدگاه خریدار</h3>
          {!signedIn ? (
            <><p>برای بررسی سابقه خرید و ثبت دیدگاه وارد حساب شوید.</p><a href={signInHref}>ورود به حساب</a></>
          ) : canSubmit ? (
            <form onSubmit={submit}>
              {review?.status === "rejected" ? <p className={styles.rejected}>{review.moderationNote || "دیدگاه قبلی نیازمند اصلاح است."}</p> : null}
              <label>امتیاز
                <select name="rating" required defaultValue="5">
                  <option value="5">۵ — عالی</option><option value="4">۴ — خوب</option><option value="3">۳ — متوسط</option><option value="2">۲ — ضعیف</option><option value="1">۱ — بسیار ضعیف</option>
                </select>
              </label>
              <label>عنوان کوتاه (اختیاری)<input name="title" maxLength={120} /></label>
              <label>متن دیدگاه<textarea name="body" required minLength={10} maxLength={1500} rows={5} /></label>
              <button type="submit" disabled={busy}>{busy ? "در حال ثبت…" : review ? "ارسال دوباره" : "ثبت دیدگاه"}</button>
            </form>
          ) : review ? (
            <p className={styles.reviewState}>{review.status === "pending" ? "دیدگاه شما در انتظار بررسی مدیریت است." : "دیدگاه شما منتشر شده است."}</p>
          ) : (
            <p>ثبت دیدگاه فقط برای خریدار این محصول، پس از پرداخت و تحویل سفارش فعال می‌شود.</p>
          )}
          {message ? <p role="status" className={styles.status}>{message}</p> : null}
        </aside>
      </div>
    </section>
  );
}
