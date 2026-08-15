"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Container } from "@miran/ui";
import styles from "./real-product-manager.module.css";

type Product = {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  media: Array<{
    id: string;
    media_type: "IMAGE" | "VIDEO";
    url: string;
    is_primary: number;
  }>;
};

type UploadTicket = {
  storageKey: string;
  mediaType: "IMAGE" | "VIDEO";
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  sortOrder: number;
  isPrimary: boolean;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
};

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const videoTypes = new Set(["video/mp4", "video/webm"]);

async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function RealProductMediaUploadManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/products", { cache: "no-store" });
      const data = (await response.json()) as { products?: Product[]; message?: string };
      if (!response.ok || !data.products) {
        setMessage(data.message ?? "دریافت محصولات انجام نشد.");
        return;
      }
      setProducts(data.products);
    } catch {
      setMessage("ارتباط با Backend محصولات برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(event: FormEvent<HTMLFormElement>, product: Product) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    const mediaType = String(data.get("mediaType") || "IMAGE") as "IMAGE" | "VIDEO";
    const sortOrder = Number(data.get("sortOrder") || 0);
    const isPrimary = data.get("isPrimary") === "on";

    if (!file) {
      setMessage("یک فایل انتخاب کنید.");
      return;
    }
    if (mediaType === "IMAGE" && !imageTypes.has(file.type)) {
      setMessage("تصویر باید JPEG، PNG، WebP یا AVIF باشد.");
      return;
    }
    if (mediaType === "VIDEO" && !videoTypes.has(file.type)) {
      setMessage("ویدئو باید MP4 یا WebM باشد.");
      return;
    }
    if ((mediaType === "IMAGE" && file.size > 10_000_000) || (mediaType === "VIDEO" && file.size > 50_000_000)) {
      setMessage(mediaType === "IMAGE" ? "حجم تصویر حداکثر ۱۰ مگابایت است." : "حجم ویدئو حداکثر ۵۰ مگابایت است.");
      return;
    }

    setLoading(true);
    setMessage("در حال آماده‌سازی آپلود امن رسانه…");
    try {
      const sha256 = await sha256Hex(file);
      const ticketResponse = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "media-upload-ticket",
          id: product.id,
          data: {
            mediaType,
            mimeType: file.type,
            sizeBytes: file.size,
            sha256,
            sortOrder,
            isPrimary,
          },
        }),
      });
      const ticketData = (await ticketResponse.json()) as {
        result?: UploadTicket;
        error?: string;
        message?: string;
      };
      if (!ticketResponse.ok || !ticketData.result) {
        setMessage(
          ticketData.error === "STORAGE_NOT_CONFIGURED"
            ? "فضای Media/CDN عمومی هنوز روی Production تنظیم نشده است."
            : ticketData.message ?? "مجوز آپلود رسانه ساخته نشد.",
        );
        return;
      }
      const ticket = ticketData.result;

      const storageResponse = await fetch(ticket.uploadUrl, {
        method: ticket.method,
        headers: ticket.headers,
        body: file,
      });
      if (!storageResponse.ok) {
        setMessage("آپلود فایل به Media Storage انجام نشد.");
        return;
      }

      const completeResponse = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "media-upload-complete",
          id: product.id,
          data: {
            storageKey: ticket.storageKey,
            mediaType: ticket.mediaType,
            mimeType: ticket.mimeType,
            sizeBytes: ticket.sizeBytes,
            sha256: ticket.sha256,
            sortOrder: ticket.sortOrder,
            isPrimary: ticket.isPrimary,
          },
        }),
      });
      const completeData = (await completeResponse.json()) as { result?: unknown; message?: string };
      if (!completeResponse.ok || !completeData.result) {
        setMessage(completeData.message ?? "تأیید نهایی رسانه انجام نشد.");
        return;
      }

      form.reset();
      await load();
      setMessage("رسانه Verify شد، در Media Storage ثبت شد و به محصول متصل شد.");
    } catch {
      setMessage("آپلود رسانه کامل نشد.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="real-product-media-title">
      <Container size="wide">
        <div className={styles.panel}>
          <div className={styles.heading}>
            <p>Verified Media Storage</p>
            <h2 id="real-product-media-title">آپلود واقعی عکس و ویدئوی محصول</h2>
            <p className={styles.note}>
              فایل با Signed URL آپلود می‌شود؛ Backend اندازه، MIME و SHA-256 را Verify می‌کند و فقط بعد از تأیید URL عمومی Media/CDN را به محصول متصل می‌کند.
            </p>
          </div>

          {products.map((product) => (
            <article className={styles.card} key={product.id}>
              <h3>{product.title}</h3>
              <p className={styles.status}>{product.status}</p>
              <form className={styles.form} onSubmit={(event) => void upload(event, product)}>
                <label>
                  نوع رسانه
                  <select name="mediaType" defaultValue="IMAGE" disabled={loading || product.status === "ARCHIVED"}>
                    <option value="IMAGE">تصویر</option>
                    <option value="VIDEO">ویدئوی کوتاه</option>
                  </select>
                </label>
                <label>
                  فایل
                  <input name="file" type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm" required disabled={loading || product.status === "ARCHIVED"} />
                </label>
                <label>ترتیب<input name="sortOrder" type="number" min="0" step="1" defaultValue="0" /></label>
                <label><input name="isPrimary" type="checkbox" /> تصویر اصلی</label>
                <button type="submit" disabled={loading || product.status === "ARCHIVED"}>آپلود و Verify رسانه</button>
              </form>
              {product.media.length ? (
                <ul>
                  {product.media.map((media) => (
                    <li key={media.id}>
                      {media.media_type} — <a href={media.url} target="_blank" rel="noreferrer">مشاهده رسانه</a>{media.is_primary ? " — اصلی" : ""}
                    </li>
                  ))}
                </ul>
              ) : <p>هنوز رسانه‌ای ثبت نشده است.</p>}
            </article>
          ))}
          {message ? <p role="status">{message}</p> : null}
        </div>
      </Container>
    </section>
  );
}
