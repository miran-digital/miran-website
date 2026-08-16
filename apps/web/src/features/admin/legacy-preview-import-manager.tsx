"use client";

import { useEffect, useState } from "react";
import { Container } from "@miran/ui";
import { createDefaultAdminState, getAdminState, type AdminState } from "./admin-store";
import styles from "./real-product-manager.module.css";

type UploadTicket = {
  storageKey: string;
  mediaType: "IMAGE";
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  sortOrder: number;
  isPrimary: boolean;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
};

const legacyImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

async function sha256Hex(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function LegacyPreviewImportManager() {
  const [preview, setPreview] = useState<AdminState>(createDefaultAdminState);
  const [ready, setReady] = useState(false);
  const [pricesToman, setPricesToman] = useState<Record<string, string>>({});
  const [importedProductIds, setImportedProductIds] = useState<Record<string, string>>({});
  const [imageMigrated, setImageMigrated] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setPreview(getAdminState());
    setReady(true);
  }, []);

  async function importContent() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/legacy-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "content",
          data: {
            sections: preview.sections,
            headerMessages: preview.headerMessages,
            banners: preview.banners,
          },
        }),
      });
      const data = (await response.json()) as {
        result?: { importedHeaders: number; importedBanners: number; updatedSections: number };
        message?: string;
      };
      if (!response.ok || !data.result) {
        setMessage(data.message ?? "انتقال محتوا انجام نشد.");
        return;
      }
      setMessage(
        `انتقال امن محتوا انجام شد: ${data.result.importedHeaders.toLocaleString("fa-IR")} پیام، ${data.result.importedBanners.toLocaleString("fa-IR")} بنر و ${data.result.updatedSections.toLocaleString("fa-IR")} تنظیم بخش. اجرای دوباره Duplicate نمی‌سازد.`,
      );
    } catch {
      setMessage("ارتباط با Backend برای انتقال محتوا برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function importProduct(product: AdminState["products"][number]) {
    const toman = Number(pricesToman[product.id]);
    if (!Number.isSafeInteger(toman) || toman < 0) {
      setMessage(`برای «${product.title}» قیمت واقعی تومان را وارد کنید.`);
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/legacy-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "product",
          data: {
            legacyId: product.id,
            title: product.title,
            slug: product.slug,
            brand: product.brand,
            categorySlug: product.category,
            basePriceIrr: toman * 10,
          },
        }),
      });
      const data = (await response.json()) as {
        result?: {
          product: { id: string; status: string };
          alreadyImported: boolean;
          categoryMatched?: boolean;
        };
        message?: string;
      };
      if (!response.ok || !data.result) {
        setMessage(data.message ?? `انتقال «${product.title}» انجام نشد.`);
        return;
      }
      setImportedProductIds((current) => ({
        ...current,
        [product.id]: data.result!.product.id,
      }));
      setMessage(
        data.result.alreadyImported
          ? `«${product.title}» قبلاً منتقل شده بود؛ Duplicate ساخته نشد و شناسه محصول واقعی بازیابی شد.`
          : `«${product.title}» به‌صورت Draft با قیمت واقعی وارد Database شد${data.result.categoryMatched === false ? "؛ دسته قدیمی پیدا نشد و باید در Product Manager انتخاب شود" : ""}. اگر تصویر Preview دارد، اکنون می‌توانید آن را جداگانه به Media Storage واقعی منتقل کنید.`,
      );
    } catch {
      setMessage(`انتقال «${product.title}» انجام نشد.`);
    } finally {
      setLoading(false);
    }
  }

  async function migrateImage(product: AdminState["products"][number]) {
    const realProductId = importedProductIds[product.id];
    if (!realProductId || !product.imageDataUrl) return;

    setLoading(true);
    setMessage("در حال تبدیل تصویر Preview به رسانه واقعی…");
    try {
      const blobResponse = await fetch(product.imageDataUrl);
      if (!blobResponse.ok) throw new Error("invalid-data-url");
      const blob = await blobResponse.blob();
      if (!legacyImageTypes.has(blob.type)) {
        setMessage("نوع تصویر قدیمی برای انتقال مستقیم پشتیبانی نمی‌شود.");
        return;
      }
      if (blob.size <= 0 || blob.size > 10_000_000) {
        setMessage("حجم تصویر قدیمی برای Media Storage معتبر نیست.");
        return;
      }
      const sha256 = await sha256Hex(blob);
      const ticketResponse = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "media-upload-ticket",
          id: realProductId,
          data: {
            mediaType: "IMAGE",
            mimeType: blob.type,
            sizeBytes: blob.size,
            sha256,
            sortOrder: 0,
            isPrimary: true,
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
            ? "Media Storage هنوز روی Production تنظیم نشده است؛ تصویر Preview همچنان دست‌نخورده در مرورگر باقی می‌ماند."
            : ticketData.message ?? "مجوز انتقال تصویر ساخته نشد.",
        );
        return;
      }
      const ticket = ticketData.result;
      const uploadResponse = await fetch(ticket.uploadUrl, {
        method: ticket.method,
        headers: ticket.headers,
        body: blob,
      });
      if (!uploadResponse.ok) {
        setMessage("ارسال تصویر قدیمی به Media Storage انجام نشد؛ نسخه Preview حذف نشده است.");
        return;
      }

      const completeResponse = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "media-upload-complete",
          id: realProductId,
          data: {
            storageKey: ticket.storageKey,
            mediaType: ticket.mediaType,
            mimeType: ticket.mimeType,
            sizeBytes: ticket.sizeBytes,
            sha256: ticket.sha256,
            sortOrder: ticket.sortOrder,
            isPrimary: true,
          },
        }),
      });
      const completeData = (await completeResponse.json()) as { result?: unknown; message?: string };
      if (!completeResponse.ok || !completeData.result) {
        setMessage(completeData.message ?? "ثبت نهایی تصویر قدیمی انجام نشد؛ Preview هنوز حفظ شده است.");
        return;
      }

      setImageMigrated((current) => ({ ...current, [product.id]: true }));
      setMessage(`تصویر «${product.title}» Verify شد و به‌عنوان تصویر اصلی محصول واقعی ثبت شد. نسخه Preview هنوز حذف نشده است.`);
    } catch {
      setMessage("انتقال تصویر Preview کامل نشد؛ هیچ داده قدیمی حذف نشد.");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return null;

  const hasLegacyContent =
    preview.headerMessages.length > 0 ||
    preview.banners.length > 0 ||
    preview.products.length > 0;

  return (
    <section className={styles.section} aria-labelledby="legacy-preview-import-title">
      <Container size="wide">
        <div className={styles.panel}>
          <div className={styles.heading}>
            <p>Controlled Migration</p>
            <h2 id="legacy-preview-import-title">انتقال امن اطلاعات Preview قدیمی</h2>
            <p className={styles.note}>
              اطلاعات LocalStorage حذف نمی‌شود. پیام‌ها، بنرها و وضعیت بخش‌ها بدون Duplicate منتقل می‌شوند. محصول فقط با قیمت واقعی تومان و در وضعیت Draft منتقل می‌شود؛ قیمت Mock هیچ‌وقت مبنای فروش قرار نمی‌گیرد. تصویر قدیمی نیز فقط پس از ساخت محصول واقعی و Verify شدن در Media Storage منتقل می‌شود.
            </p>
          </div>

          {!hasLegacyContent ? <p>روی این مرورگر دادهٔ Preview قابل انتقال پیدا نشد.</p> : null}

          <div className={styles.card}>
            <h3>محتوای فروشگاه</h3>
            <p>
              {preview.headerMessages.length.toLocaleString("fa-IR")} پیام Header، {preview.banners.length.toLocaleString("fa-IR")} بنر.
            </p>
            <button type="button" onClick={() => void importContent()} disabled={loading}>
              انتقال idempotent پیام‌ها، بنرها و تنظیمات Home
            </button>
          </div>

          <div className={styles.grid}>
            {preview.products.map((product) => {
              const realProductId = importedProductIds[product.id];
              return (
                <article className={styles.card} key={product.id}>
                  <h3>{product.title}</h3>
                  <p className={styles.meta}>{product.brand} · {product.category}</p>
                  <p className={styles.note}>
                    عدد قیمت Preview: {product.priceMinor.toLocaleString("fa-IR")} — این عدد عمداً در Import استفاده نمی‌شود.
                  </p>
                  {product.imageDataUrl ? (
                    <p className={styles.note}>تصویر قدیمی روی همین مرورگر حفظ شده است و فقط با دستور جداگانه به Media Storage منتقل می‌شود.</p>
                  ) : null}
                  <label>
                    قیمت واقعی به تومان
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={pricesToman[product.id] ?? ""}
                      onChange={(event) =>
                        setPricesToman((current) => ({
                          ...current,
                          [product.id]: event.target.value,
                        }))
                      }
                      disabled={loading || Boolean(realProductId)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void importProduct(product)}
                    disabled={loading || Boolean(realProductId)}
                  >
                    {realProductId ? "محصول Draft منتقل شد" : "انتقال به‌صورت Draft"}
                  </button>
                  {product.imageDataUrl && realProductId ? (
                    <button
                      type="button"
                      onClick={() => void migrateImage(product)}
                      disabled={loading || imageMigrated[product.id]}
                    >
                      {imageMigrated[product.id] ? "تصویر منتقل شد" : "انتقال تصویر قدیمی به Media Storage"}
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>

          {message ? <p role="status">{message}</p> : null}
        </div>
      </Container>
    </section>
  );
}
