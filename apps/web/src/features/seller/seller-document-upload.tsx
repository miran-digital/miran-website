"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Container } from "@miran/ui";
import styles from "@/features/admin/real-product-manager.module.css";

type Seller = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
};

type UploadTicket = {
  storageKey: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};

const allowedTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

async function sha256Hex(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function SellerDocumentUpload() {
  const [seller, setSeller] = useState<Seller | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/seller", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as { seller?: Seller };
        return data.seller ?? null;
      })
      .then((value) => {
        if (active) setSeller(value);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const canUpload = seller && ["PENDING", "REJECTED"].includes(seller.status);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const kind = String(data.get("kind") || "").trim();
    const input = form.elements.namedItem("document") as HTMLInputElement | null;
    const file = input?.files?.[0];

    if (!kind || !file) {
      setMessage("نوع مدرک و فایل را انتخاب کنید.");
      return;
    }
    if (!allowedTypes.has(file.type)) {
      setMessage("فقط PDF، JPEG، PNG یا WebP پذیرفته می‌شود.");
      return;
    }
    if (file.size <= 0 || file.size > 10_000_000) {
      setMessage("حجم فایل باید حداکثر ۱۰ مگابایت باشد.");
      return;
    }

    setLoading(true);
    setMessage("در حال محاسبه اثرانگشت و آماده‌سازی آپلود امن…");
    try {
      const sha256 = await sha256Hex(file);
      const ticketResponse = await fetch("/api/seller/documents/upload-ticket", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          mimeType: file.type,
          sizeBytes: file.size,
          sha256,
        }),
      });
      const ticketData = (await ticketResponse.json()) as {
        ticket?: UploadTicket;
        error?: string;
        message?: string;
      };
      if (!ticketResponse.ok || !ticketData.ticket) {
        setMessage(
          ticketData.error === "STORAGE_NOT_CONFIGURED"
            ? "فضای ذخیره‌سازی خصوصی هنوز روی سرور Production تنظیم نشده است."
            : ticketData.message ?? "مجوز آپلود امن ساخته نشد.",
        );
        return;
      }

      const ticket = ticketData.ticket;
      const uploadResponse = await fetch(ticket.uploadUrl, {
        method: ticket.method,
        headers: ticket.headers,
        body: file,
      });
      if (!uploadResponse.ok) {
        setMessage("ارسال فایل به فضای ذخیره‌سازی خصوصی انجام نشد.");
        return;
      }

      const completeResponse = await fetch("/api/seller/documents/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: ticket.kind,
          storageKey: ticket.storageKey,
          mimeType: ticket.mimeType,
          sizeBytes: ticket.sizeBytes,
          sha256: ticket.sha256,
        }),
      });
      const completeData = (await completeResponse.json()) as {
        document?: { id: string };
        message?: string;
      };
      if (!completeResponse.ok || !completeData.document) {
        setMessage(completeData.message ?? "تأیید نهایی فایل روی Backend انجام نشد.");
        return;
      }

      form.reset();
      setMessage("مدرک با موفقیت در فضای خصوصی ثبت شد و در انتظار بررسی مدیر است.");
      window.dispatchEvent(new CustomEvent("miran:seller-evidence-change"));
    } catch {
      setMessage("آپلود امن مدرک کامل نشد.");
    } finally {
      setLoading(false);
    }
  }

  if (!seller || !canUpload) return null;

  return (
    <section className={styles.section} aria-labelledby="seller-private-upload-title">
      <Container size="wide">
        <div className={styles.panel}>
          <div className={styles.heading}>
            <p>Private Document Storage</p>
            <h2 id="seller-private-upload-title">آپلود امن مدارک فروشنده</h2>
            <p className={styles.note}>
              فایل در فضای خصوصی ذخیره می‌شود؛ مسیر عمومی دائمی ندارد و مدیر فقط با لینک کوتاه‌عمر می‌تواند آن را مشاهده کند.
            </p>
          </div>
          <form className={styles.form} onSubmit={submit}>
            <label>
              نوع مدرک
              <select name="kind" defaultValue="IDENTITY" required disabled={loading}>
                <option value="IDENTITY">مدرک هویتی</option>
                <option value="BUSINESS_LICENSE">مجوز کسب‌وکار</option>
                <option value="BANK_DOCUMENT">مدرک بانکی</option>
                <option value="OTHER">سایر مدارک</option>
              </select>
            </label>
            <label>
              فایل
              <input
                name="document"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                required
                disabled={loading}
              />
            </label>
            <small>حداکثر ۱۰ مگابایت؛ PDF، JPEG، PNG یا WebP.</small>
            <button type="submit" disabled={loading}>
              {loading ? "در حال پردازش…" : "آپلود امن مدرک"}
            </button>
          </form>
          {message ? <p role="status">{message}</p> : null}
        </div>
      </Container>
    </section>
  );
}
