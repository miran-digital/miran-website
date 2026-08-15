"use client";

import { useEffect, useState } from "react";
import { Container } from "@miran/ui";
import { createDefaultAdminState, getAdminState, type AdminState } from "./admin-store";
import styles from "./real-product-manager.module.css";

export function LegacyPreviewImportManager() {
  const [preview, setPreview] = useState<AdminState>(createDefaultAdminState);
  const [ready, setReady] = useState(false);
  const [pricesToman, setPricesToman] = useState<Record<string, string>>({});
  const [imported, setImported] = useState<Record<string, boolean>>({});
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
      setImported((current) => ({ ...current, [product.id]: true }));
      setMessage(
        data.result.alreadyImported
          ? `«${product.title}» قبلاً منتقل شده بود؛ Duplicate ساخته نشد.`
          : `«${product.title}» به‌صورت Draft با قیمت واقعی وارد Database شد${data.result.categoryMatched === false ? "؛ دسته قدیمی پیدا نشد و باید در Product Manager انتخاب شود" : ""}. تصویر Preview هنوز در LocalStorage حفظ شده و خودکار به رسانه عمومی تبدیل نشده است.`,
      );
    } catch {
      setMessage(`انتقال «${product.title}» انجام نشد.`);
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
              اطلاعات LocalStorage حذف نمی‌شود. پیام‌ها، بنرها و وضعیت بخش‌ها بدون Duplicate منتقل می‌شوند. محصول فقط با قیمت واقعی تومان و در وضعیت Draft منتقل می‌شود؛ قیمت Mock و تصویر Data URL قدیمی هرگز مبنای فروش قرار نمی‌گیرند.
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
            {preview.products.map((product) => (
              <article className={styles.card} key={product.id}>
                <h3>{product.title}</h3>
                <p className={styles.meta}>{product.brand} · {product.category}</p>
                <p className={styles.note}>
                  عدد قیمت Preview: {product.priceMinor.toLocaleString("fa-IR")} — این عدد عمداً در Import استفاده نمی‌شود.
                </p>
                {product.imageDataUrl ? (
                  <p className={styles.note}>تصویر قدیمی روی همین مرورگر حفظ شده و هنوز به Media Storage منتقل نشده است.</p>
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
                    disabled={loading || imported[product.id]}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void importProduct(product)}
                  disabled={loading || imported[product.id]}
                >
                  {imported[product.id] ? "منتقل شد" : "انتقال به‌صورت Draft"}
                </button>
              </article>
            ))}
          </div>

          {message ? <p role="status">{message}</p> : null}
        </div>
      </Container>
    </section>
  );
}
