"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Container } from "@miran/ui";
import styles from "./real-product-manager.module.css";

type HeaderMessage = {
  id: string;
  text: string;
  href: string | null;
  backgroundColor: string;
  textColor: string;
  startsAt: string | null;
  endsAt: string | null;
  visible: boolean;
  sortOrder: number;
};

type Banner = {
  id: string;
  title: string;
  href: string | null;
  imageUrl: string | null;
  placement: "TOP" | "HERO" | "SMALL";
  visible: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
};

type Section = {
  key: string;
  visible: boolean;
  sortOrder: number;
};

type Cms = {
  headerMessages: HeaderMessage[];
  banners: Banner[];
  sections: Section[];
};

function iso(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const sectionLabels: Record<string, string> = {
  hero: "Hero",
  banners: "بنرها",
  categories: "دسته‌بندی‌ها",
  specialOffers: "پیشنهاد شگفت‌انگیز",
  products: "محصولات",
  brands: "برندها",
  trust: "اعتماد و خدمات",
};

export function RealStorefrontCmsManager() {
  const [cms, setCms] = useState<Cms>({ headerMessages: [], banners: [], sections: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/storefront", { cache: "no-store" });
      const data = (await response.json()) as { cms?: Cms; message?: string };
      if (!response.ok || !data.cms) {
        setMessage(data.message ?? "دریافت CMS انجام نشد.");
        return;
      }
      setCms(data.cms);
    } catch {
      setMessage("ارتباط با CMS Backend برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function request(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>, success: string) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/storefront", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "عملیات CMS انجام نشد.");
        return false;
      }
      await load();
      setMessage(success);
      return true;
    } catch {
      setMessage("عملیات CMS انجام نشد.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function addHeader(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await request("POST", {
      entity: "header",
      data: {
        text: String(data.get("text") || "").trim(),
        href: String(data.get("href") || "").trim() || null,
        backgroundColor: String(data.get("backgroundColor") || "#111827"),
        textColor: String(data.get("textColor") || "#ffffff"),
        startsAt: iso(data.get("startsAt")),
        endsAt: iso(data.get("endsAt")),
        sortOrder: Number(data.get("sortOrder") || 0),
        visible: true,
      },
    }, "پیام Header در Database ذخیره شد.");
    if (ok) form.reset();
  }

  async function addBanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await request("POST", {
      entity: "banner",
      data: {
        title: String(data.get("title") || "").trim(),
        href: String(data.get("href") || "").trim() || null,
        imageUrl: String(data.get("imageUrl") || "").trim() || null,
        placement: String(data.get("placement") || "SMALL"),
        startsAt: iso(data.get("startsAt")),
        endsAt: iso(data.get("endsAt")),
        sortOrder: Number(data.get("sortOrder") || 0),
        visible: true,
      },
    }, "بنر در Database ذخیره شد.");
    if (ok) form.reset();
  }

  return (
    <section className={styles.section} aria-labelledby="real-cms-title">
      <Container size="wide">
        <div className={styles.panel}>
          <div className={styles.heading}>
            <p>Database-backed Storefront CMS</p>
            <h2 id="real-cms-title">محتوا و بنرهای واقعی سایت</h2>
            <p className={styles.note}>
              Header، رنگ‌ها، زمان‌بندی، بنر و نمایش بخش‌های Home از Database کنترل می‌شوند. برای فایل تصویر، فعلاً URL امن داخلی/HTTPS ثبت می‌شود؛ آپلود مستقیم بعد از اتصال Media Storage فعال می‌شود.
            </p>
          </div>

          <div className={styles.grid}>
            <form className={styles.form} onSubmit={addHeader}>
              <h3>پیام جدید Header</h3>
              <label>متن<input name="text" maxLength={200} required /></label>
              <label>لینک<input name="href" dir="ltr" placeholder="/offers" /></label>
              <label>رنگ زمینه<input name="backgroundColor" type="color" defaultValue="#111827" /></label>
              <label>رنگ متن<input name="textColor" type="color" defaultValue="#ffffff" /></label>
              <label>شروع<input name="startsAt" type="datetime-local" /></label>
              <label>پایان<input name="endsAt" type="datetime-local" /></label>
              <label>ترتیب<input name="sortOrder" type="number" min="0" step="1" defaultValue="0" /></label>
              <button type="submit" disabled={loading}>افزودن پیام</button>
            </form>

            <form className={styles.form} onSubmit={addBanner}>
              <h3>بنر جدید</h3>
              <label>عنوان<input name="title" maxLength={200} required /></label>
              <label>لینک<input name="href" dir="ltr" placeholder="/category/mobile" /></label>
              <label>URL تصویر<input name="imageUrl" dir="ltr" placeholder="/media/banner.webp" /></label>
              <label>
                جایگاه
                <select name="placement" defaultValue="SMALL">
                  <option value="TOP">بنر باریک بالا</option>
                  <option value="HERO">Hero</option>
                  <option value="SMALL">بنر کوچک</option>
                </select>
              </label>
              <label>شروع<input name="startsAt" type="datetime-local" /></label>
              <label>پایان<input name="endsAt" type="datetime-local" /></label>
              <label>ترتیب<input name="sortOrder" type="number" min="0" step="1" defaultValue="0" /></label>
              <button type="submit" disabled={loading}>افزودن بنر</button>
            </form>
          </div>

          <h3>نمایش بخش‌های Home</h3>
          <div className={styles.actions}>
            {cms.sections.map((section) => (
              <label key={section.key}>
                <input
                  type="checkbox"
                  checked={section.visible}
                  disabled={loading}
                  onChange={() => void request("PATCH", {
                    entity: "section",
                    id: section.key,
                    data: { visible: !section.visible, sortOrder: section.sortOrder },
                  }, "نمایش بخش Home به‌روزرسانی شد.")}
                />
                {sectionLabels[section.key] ?? section.key}
              </label>
            ))}
          </div>

          <h3>پیام‌های Header</h3>
          {cms.headerMessages.map((item) => (
            <article className={styles.card} key={item.id}>
              <strong style={{ backgroundColor: item.backgroundColor, color: item.textColor, padding: "0.35rem 0.6rem", borderRadius: "0.4rem" }}>{item.text}</strong>
              <p className={styles.meta}><bdi dir="ltr">{item.href ?? "بدون لینک"}</bdi> — ترتیب {item.sortOrder.toLocaleString("fa-IR")}</p>
              <div className={styles.actions}>
                <button type="button" disabled={loading} onClick={() => void request("PATCH", { entity: "header", id: item.id, data: { visible: !item.visible } }, "وضعیت پیام تغییر کرد.")}>{item.visible ? "مخفی" : "نمایش"}</button>
                <button type="button" disabled={loading} onClick={() => {
                  if (window.confirm(`پیام «${item.text}» حذف شود؟`)) void request("DELETE", { entity: "header", id: item.id }, "پیام حذف شد.");
                }}>حذف</button>
              </div>
            </article>
          ))}

          <h3>بنرها</h3>
          {cms.banners.map((banner) => (
            <article className={styles.card} key={banner.id}>
              <strong>{banner.title}</strong>
              <p className={styles.meta}>{banner.placement} — <bdi dir="ltr">{banner.imageUrl ?? "بدون تصویر"}</bdi></p>
              <div className={styles.actions}>
                <button type="button" disabled={loading} onClick={() => void request("PATCH", { entity: "banner", id: banner.id, data: { visible: !banner.visible } }, "وضعیت بنر تغییر کرد.")}>{banner.visible ? "مخفی" : "نمایش"}</button>
                <button type="button" disabled={loading} onClick={() => {
                  if (window.confirm(`بنر «${banner.title}» حذف شود؟`)) void request("DELETE", { entity: "banner", id: banner.id }, "بنر حذف شد.");
                }}>حذف</button>
              </div>
            </article>
          ))}

          {message ? <p role="status">{message}</p> : null}
        </div>
      </Container>
    </section>
  );
}
