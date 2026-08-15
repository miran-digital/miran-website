"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Container } from "@miran/ui";
import styles from "./real-product-manager.module.css";

type Banner = {
  id: string;
  title: string;
  imageUrl: string | null;
  placement: "TOP" | "HERO" | "SMALL";
  visible: boolean;
};

type Ticket = {
  storageKey: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function RealBannerMediaManager() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/storefront", { cache: "no-store" });
      const data = (await response.json()) as {
        cms?: { banners: Banner[] };
        message?: string;
      };
      if (!response.ok || !data.cms) {
        setMessage(data.message ?? "دریافت بنرها انجام نشد.");
        return;
      }
      setBanners(data.cms.banners);
    } catch {
      setMessage("ارتباط با CMS برای دریافت بنرها برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(event: FormEvent<HTMLFormElement>, banner: Banner) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("image") as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      setMessage("یک تصویر بنر انتخاب کنید.");
      return;
    }
    if (!imageTypes.has(file.type)) {
      setMessage("تصویر بنر باید JPEG، PNG، WebP یا AVIF باشد.");
      return;
    }
    if (file.size <= 0 || file.size > 10_000_000) {
      setMessage("حجم تصویر بنر باید حداکثر ۱۰ مگابایت باشد.");
      return;
    }

    setLoading(true);
    setMessage("در حال Upload و Verify تصویر بنر…");
    try {
      const sha256 = await sha256Hex(file);
      const ticketResponse = await fetch("/api/admin/storefront", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity: "banner-media-upload-ticket",
          id: banner.id,
          data: { mimeType: file.type, sizeBytes: file.size, sha256 },
        }),
      });
      const ticketData = (await ticketResponse.json()) as {
        result?: Ticket;
        error?: string;
        message?: string;
      };
      if (!ticketResponse.ok || !ticketData.result) {
        setMessage(
          ticketData.error === "STORAGE_NOT_CONFIGURED"
            ? "Media Storage عمومی هنوز روی Production تنظیم نشده است."
            : ticketData.message ?? "مجوز Upload بنر ساخته نشد.",
        );
        return;
      }
      const ticket = ticketData.result;
      const uploadResponse = await fetch(ticket.uploadUrl, {
        method: ticket.method,
        headers: ticket.headers,
        body: file,
      });
      if (!uploadResponse.ok) {
        setMessage("ارسال تصویر بنر به Media Storage انجام نشد.");
        return;
      }

      const completeResponse = await fetch("/api/admin/storefront", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity: "banner-media-upload-complete",
          id: banner.id,
          data: {
            storageKey: ticket.storageKey,
            mimeType: ticket.mimeType,
            sizeBytes: ticket.sizeBytes,
            sha256: ticket.sha256,
          },
        }),
      });
      const completeData = (await completeResponse.json()) as {
        result?: unknown;
        message?: string;
      };
      if (!completeResponse.ok || !completeData.result) {
        setMessage(completeData.message ?? "تأیید نهایی تصویر بنر انجام نشد.");
        return;
      }

      form.reset();
      await load();
      setMessage("تصویر بنر Verify شد و روی بنر واقعی سایت ثبت شد.");
    } catch {
      setMessage("Upload تصویر بنر کامل نشد.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="banner-media-title">
      <Container size="wide">
        <div className={styles.panel}>
          <div className={styles.heading}>
            <p>Verified Banner Media</p>
            <h2 id="banner-media-title">آپلود واقعی تصویر بنر</h2>
            <p className={styles.note}>
              ابتدا بنر را در CMS بسازید؛ سپس تصویر اینجا با Signed URL آپلود و از نظر اندازه، نوع فایل و SHA-256 روی سرور Verify می‌شود. حذف/نمایش/زمان‌بندی خود بنر همچنان در CMS انجام می‌شود.
            </p>
          </div>

          {banners.length === 0 && !loading ? <p>هنوز بنری در Database ساخته نشده است.</p> : null}
          <div className={styles.grid}>
            {banners.map((banner) => (
              <article className={styles.card} key={banner.id}>
                <h3>{banner.title}</h3>
                <p className={styles.meta}>{banner.placement} — {banner.visible ? "نمایش" : "مخفی"}</p>
                {banner.imageUrl ? (
                  <p><a href={banner.imageUrl} target="_blank" rel="noreferrer">مشاهده تصویر فعلی</a></p>
                ) : <p>هنوز تصویر واقعی ثبت نشده است.</p>}
                <form className={styles.form} onSubmit={(event) => void upload(event, banner)}>
                  <label>
                    تصویر جدید
                    <input
                      name="image"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      required
                      disabled={loading}
                    />
                  </label>
                  <button type="submit" disabled={loading}>Upload و Verify تصویر</button>
                </form>
              </article>
            ))}
          </div>
          {message ? <p role="status">{message}</p> : null}
        </div>
      </Container>
    </section>
  );
}
