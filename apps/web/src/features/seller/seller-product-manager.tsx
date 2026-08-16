"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Container } from "@miran/ui";
import styles from "@/features/admin/real-product-manager.module.css";

type Seller = { id: string; status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED" };
type Category = { id: string; parentId: string | null; name: string; slug: string };
type Media = { id: string; media_type: "IMAGE" | "VIDEO"; url: string; is_primary: number };
type Product = {
  id: string;
  slug: string;
  title: string;
  brand: string;
  categoryId: string | null;
  categoryName: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  pricing: { baseIrr: number; finalIrr: number; discountIrr: number };
  stockOnHand: number;
  stockReserved: number;
  media: Media[];
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

function toman(irr: number) {
  return `${Math.round(irr / 10).toLocaleString("fa-IR")} تومان`;
}

async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function SellerProductManager() {
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sellerResponse = await fetch("/api/seller", { cache: "no-store" });
      const sellerData = (await sellerResponse.json()) as { seller?: Seller };
      const currentSeller = sellerResponse.ok ? sellerData.seller ?? null : null;
      setSeller(currentSeller);
      if (!currentSeller || currentSeller.status !== "APPROVED") return;

      const response = await fetch("/api/seller/products", { cache: "no-store" });
      const data = (await response.json()) as {
        products?: Product[];
        categories?: Category[];
        message?: string;
      };
      if (!response.ok || !data.products || !data.categories) {
        setMessage(data.message ?? "دریافت محصولات فروشنده انجام نشد.");
        return;
      }
      setProducts(data.products);
      setCategories(data.categories);
    } catch {
      setMessage("ارتباط با Backend محصولات فروشنده برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const priceToman = Number(data.get("priceToman"));
    const stockOnHand = Number(data.get("stockOnHand"));
    if (!Number.isSafeInteger(priceToman) || priceToman < 0) {
      setMessage("قیمت باید عدد صحیح و غیرمنفی به تومان باشد.");
      return;
    }
    if (!Number.isSafeInteger(stockOnHand) || stockOnHand < 0) {
      setMessage("موجودی باید عدد صحیح و غیرمنفی باشد.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/seller/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(data.get("title") || "").trim(),
          slug: String(data.get("slug") || "").trim().toLowerCase(),
          brand: String(data.get("brand") || "").trim(),
          description: String(data.get("description") || ""),
          categoryId: String(data.get("categoryId") || "") || null,
          basePriceIrr: priceToman * 10,
          stockOnHand,
          status: data.get("publishNow") === "on" ? "PUBLISHED" : "DRAFT",
          discountType: "NONE",
          discountValue: 0,
          highlights: [],
          specifications: [],
        }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "ساخت محصول انجام نشد.");
        return;
      }
      form.reset();
      await load();
      setMessage("محصول در کاتالوگ فروشنده ذخیره شد.");
    } catch {
      setMessage("ساخت محصول انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function patch(payload: Record<string, unknown>) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/seller/products", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "به‌روزرسانی محصول انجام نشد.");
        return;
      }
      await load();
      setMessage("محصول به‌روزرسانی شد.");
    } catch {
      setMessage("به‌روزرسانی محصول انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function uploadMedia(event: FormEvent<HTMLFormElement>, product: Product) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    const mediaType = String(data.get("mediaType") || "IMAGE") as "IMAGE" | "VIDEO";
    const sortOrder = Number(data.get("sortOrder") || 0);
    const isPrimary = data.get("isPrimary") === "on";
    if (!file) {
      setMessage("یک فایل رسانه انتخاب کنید.");
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
      setMessage(mediaType === "IMAGE" ? "حداکثر حجم تصویر ۱۰ مگابایت است." : "حداکثر حجم ویدئو ۵۰ مگابایت است.");
      return;
    }

    setLoading(true);
    setMessage("در حال Upload و Verify رسانه…");
    try {
      const sha256 = await sha256Hex(file);
      const ticketResponse = await fetch("/api/seller/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "media-upload-ticket",
          id: product.id,
          data: { mediaType, mimeType: file.type, sizeBytes: file.size, sha256, sortOrder, isPrimary },
        }),
      });
      const ticketData = (await ticketResponse.json()) as { result?: UploadTicket; error?: string; message?: string };
      if (!ticketResponse.ok || !ticketData.result) {
        setMessage(
          ticketData.error === "STORAGE_NOT_CONFIGURED"
            ? "Media Storage هنوز روی Production تنظیم نشده است."
            : ticketData.message ?? "مجوز Upload ساخته نشد.",
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
        setMessage("ارسال فایل به Media Storage انجام نشد.");
        return;
      }
      const completeResponse = await fetch("/api/seller/products", {
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
        setMessage(completeData.message ?? "ثبت نهایی رسانه انجام نشد.");
        return;
      }
      form.reset();
      await load();
      setMessage("رسانه Verify شد و به محصول شما متصل شد.");
    } catch {
      setMessage("Upload رسانه کامل نشد.");
    } finally {
      setLoading(false);
    }
  }

  if (!seller || seller.status !== "APPROVED") return null;

  return (
    <section className={styles.section} aria-labelledby="seller-products-title">
      <Container size="wide">
        <div className={styles.panel}>
          <div className={styles.heading}>
            <p>Seller Catalog</p>
            <h2 id="seller-products-title">مدیریت محصولات فروشنده</h2>
            <p className={styles.note}>
              فقط محصولات متعلق به حساب فروشندگی شما نمایش داده می‌شوند. Backend مالکیت را دوباره کنترل می‌کند و امکان ویرایش محصول فروشنده دیگر وجود ندارد.
            </p>
          </div>

          <div className={styles.grid}>
            <form className={styles.form} onSubmit={createProduct}>
              <h3>محصول جدید</h3>
              <label>عنوان<input name="title" maxLength={180} required /></label>
              <label>Slug<input name="slug" pattern="[A-Za-z0-9-]+" dir="ltr" required /></label>
              <label>برند<input name="brand" maxLength={120} /></label>
              <label>
                دسته‌بندی
                <select name="categoryId" defaultValue="">
                  <option value="">بدون دسته</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.parentId ? "↳ " : ""}{category.name}</option>
                  ))}
                </select>
              </label>
              <label>توضیحات<textarea name="description" maxLength={10000} rows={4} /></label>
              <label>قیمت به تومان<input name="priceToman" type="number" min="0" step="1" required /></label>
              <label>موجودی اولیه<input name="stockOnHand" type="number" min="0" step="1" required /></label>
              <label><input name="publishNow" type="checkbox" /> انتشار فوری</label>
              <button type="submit" disabled={loading}>ذخیره محصول</button>
            </form>

            <div>
              <h3>محصولات من</h3>
              {products.length === 0 ? <p>هنوز محصولی ثبت نشده است.</p> : null}
              {products.map((product) => (
                <article className={styles.card} key={product.id}>
                  <h3>{product.title}</h3>
                  <p className={styles.status}>{product.status}</p>
                  <p>{toman(product.pricing.finalIrr)}</p>
                  <p className={styles.meta}>{product.brand || "بدون برند"} — {product.categoryName || "بدون دسته"}</p>
                  <p className={styles.meta}>موجودی {product.stockOnHand.toLocaleString("fa-IR")} — رزرو {product.stockReserved.toLocaleString("fa-IR")}</p>

                  <div className={styles.actions}>
                    <button
                      type="button"
                      disabled={loading || product.status === "ARCHIVED"}
                      onClick={() => void patch({ id: product.id, action: "publish", published: product.status !== "PUBLISHED" })}
                    >
                      {product.status === "PUBLISHED" ? "برگرداندن به Draft" : "انتشار"}
                    </button>
                    <input
                      aria-label={`موجودی ${product.title}`}
                      type="number"
                      min={product.stockReserved}
                      step="1"
                      defaultValue={product.stockOnHand}
                      disabled={loading || product.status === "ARCHIVED"}
                      onBlur={(event) => {
                        const value = Number(event.currentTarget.value);
                        if (Number.isSafeInteger(value) && value !== product.stockOnHand) {
                          void patch({ id: product.id, action: "inventory", stockOnHand: value });
                        }
                      }}
                    />
                    {product.status === "PUBLISHED" ? <a href={`/product/${encodeURIComponent(product.slug)}`}>مشاهده محصول</a> : null}
                  </div>

                  <form className={styles.form} onSubmit={(event) => void uploadMedia(event, product)}>
                    <h4>عکس یا ویدئو</h4>
                    <label>
                      نوع
                      <select name="mediaType" defaultValue="IMAGE">
                        <option value="IMAGE">تصویر</option>
                        <option value="VIDEO">ویدئوی کوتاه</option>
                      </select>
                    </label>
                    <label>فایل<input name="file" type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm" required /></label>
                    <label>ترتیب<input name="sortOrder" type="number" min="0" step="1" defaultValue="0" /></label>
                    <label><input name="isPrimary" type="checkbox" /> تصویر اصلی</label>
                    <button type="submit" disabled={loading || product.status === "ARCHIVED"}>Upload و Verify</button>
                  </form>
                  {product.media.length ? (
                    <ul>
                      {product.media.map((media) => (
                        <li key={media.id}>{media.media_type} — <a href={media.url} target="_blank" rel="noreferrer">مشاهده</a>{media.is_primary ? " — اصلی" : ""}</li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </div>
      </Container>
    </section>
  );
}
