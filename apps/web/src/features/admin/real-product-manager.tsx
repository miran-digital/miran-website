"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Container } from "@miran/ui";
import styles from "./real-product-manager.module.css";

type DiscountType = "NONE" | "PERCENTAGE" | "FIXED_IRR";

type ManagedCategory = {
  id: string;
  name: string;
  parentId: string | null;
};

type ManagedMedia = {
  id: string;
  media_type: "IMAGE" | "VIDEO";
  url: string;
  sort_order: number;
  is_primary: number;
};

type ManagedProduct = {
  id: string;
  slug: string;
  title: string;
  description: string;
  brand: string;
  categoryId: string | null;
  categoryName: string | null;
  pricing: { baseIrr: number; finalIrr: number; discountIrr: number };
  currency: "IRR";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  stockOnHand: number;
  stockReserved: number;
  discountType: DiscountType;
  discountValue: number;
  discountStartsAt: string | null;
  discountEndsAt: string | null;
  isAmazing: boolean;
  highlights: unknown[];
  specifications: unknown[];
  media: ManagedMedia[];
};

function toman(irr: number) {
  return `${Math.round(irr / 10).toLocaleString("fa-IR")} تومان`;
}

function isoFromLocal(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function lines(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function specifications(value: FormDataEntryValue | null) {
  return lines(value)
    .map((item) => {
      const separator = item.indexOf(":");
      if (separator < 1) return null;
      const label = item.slice(0, separator).trim();
      const specValue = item.slice(separator + 1).trim();
      return label && specValue ? { label, value: specValue } : null;
    })
    .filter((item): item is { label: string; value: string } => Boolean(item));
}

export function RealProductManager() {
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [categories, setCategories] = useState<ManagedCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("NONE");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [productResponse, categoryResponse] = await Promise.all([
        fetch("/api/admin/products", { cache: "no-store" }),
        fetch("/api/admin/categories", { cache: "no-store" }),
      ]);
      const productData = (await productResponse.json()) as {
        products?: ManagedProduct[];
        message?: string;
      };
      const categoryData = (await categoryResponse.json()) as {
        categories?: ManagedCategory[];
        message?: string;
      };
      if (!productResponse.ok || !productData.products) {
        setMessage(productData.message ?? "دریافت محصولات Database انجام نشد.");
        return;
      }
      if (!categoryResponse.ok || !categoryData.categories) {
        setMessage(categoryData.message ?? "دریافت دسته‌بندی‌ها انجام نشد.");
        return;
      }
      setProducts(productData.products);
      setCategories(categoryData.categories);
    } catch {
      setMessage("ارتباط با Backend محصولات برقرار نشد.");
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
    const rawDiscount = Number(data.get("discountValue") || 0);
    if (!Number.isSafeInteger(priceToman) || priceToman < 0) {
      setMessage("قیمت باید عدد صحیح و غیرمنفی به تومان باشد.");
      return;
    }
    if (!Number.isSafeInteger(stockOnHand) || stockOnHand < 0) {
      setMessage("موجودی باید عدد صحیح و غیرمنفی باشد.");
      return;
    }
    const calculatedDiscount =
      discountType === "FIXED_IRR" ? rawDiscount * 10 : rawDiscount;

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(data.get("title") || "").trim(),
          slug: String(data.get("slug") || "").trim().toLowerCase(),
          description: String(data.get("description") || ""),
          brand: String(data.get("brand") || "").trim(),
          categoryId: String(data.get("categoryId") || "") || null,
          basePriceIrr: priceToman * 10,
          discountType,
          discountValue: calculatedDiscount,
          discountStartsAt: isoFromLocal(data.get("discountStartsAt")),
          discountEndsAt: isoFromLocal(data.get("discountEndsAt")),
          isAmazing: data.get("isAmazing") === "on",
          highlights: lines(data.get("highlights")),
          specifications: specifications(data.get("specifications")),
          status: data.get("publishNow") === "on" ? "PUBLISHED" : "DRAFT",
          stockOnHand,
        }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "ساخت محصول انجام نشد.");
        return;
      }
      form.reset();
      setDiscountType("NONE");
      setMessage("محصول در Database ذخیره شد.");
      await load();
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
      const response = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "به‌روزرسانی محصول انجام نشد.");
        return false;
      }
      await load();
      setMessage("محصول به‌روزرسانی شد.");
      return true;
    } catch {
      setMessage("به‌روزرسانی محصول انجام نشد.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function updateDetails(event: FormEvent<HTMLFormElement>, product: ManagedProduct) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const basePriceToman = Number(data.get("basePriceToman"));
    const nextDiscountType = String(data.get("discountType") || "NONE") as DiscountType;
    const rawDiscount = Number(data.get("discountValue") || 0);
    if (!Number.isSafeInteger(basePriceToman) || basePriceToman < 0) {
      setMessage("قیمت پایه نامعتبر است.");
      return;
    }
    if (!Number.isSafeInteger(rawDiscount) || rawDiscount < 0) {
      setMessage("مقدار تخفیف نامعتبر است.");
      return;
    }
    const discountValue = nextDiscountType === "FIXED_IRR" ? rawDiscount * 10 : rawDiscount;
    await patch({
      id: product.id,
      action: "update",
      data: {
        brand: String(data.get("brand") || "").trim(),
        categoryId: String(data.get("categoryId") || "") || null,
        basePriceIrr: basePriceToman * 10,
        discountType: nextDiscountType,
        discountValue,
        discountStartsAt: isoFromLocal(data.get("discountStartsAt")),
        discountEndsAt: isoFromLocal(data.get("discountEndsAt")),
        isAmazing: data.get("isAmazing") === "on",
      },
    });
  }

  async function addMedia(event: FormEvent<HTMLFormElement>, productId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "media",
          id: productId,
          mediaType: String(data.get("mediaType") || "IMAGE"),
          url: String(data.get("url") || "").trim(),
          sortOrder: Number(data.get("sortOrder") || 0),
          isPrimary: data.get("isPrimary") === "on",
        }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "ثبت رسانه انجام نشد.");
        return;
      }
      form.reset();
      await load();
      setMessage("رسانه به محصول متصل شد.");
    } catch {
      setMessage("ثبت رسانه انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function removeMedia(product: ManagedProduct, media: ManagedMedia) {
    if (!window.confirm(`رسانه «${media.url}» از محصول «${product.title}» حذف شود؟`)) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/products", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: product.id, mediaId: media.id }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "حذف رسانه انجام نشد.");
        return;
      }
      await load();
      setMessage("رسانه حذف شد؛ اگر تصویر اصلی بود، تصویر بعدی به‌صورت امن Primary شد.");
    } catch {
      setMessage("حذف رسانه انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleArchive(product: ManagedProduct) {
    const archived = product.status !== "ARCHIVED";
    if (archived && !window.confirm(`محصول «${product.title}» آرشیو و از ویترین مخفی شود؟ تاریخچه سفارش حذف نمی‌شود.`)) return;
    await patch({ id: product.id, action: "archive", archived });
  }

  return (
    <section className={styles.section} aria-labelledby="real-products-title">
      <Container size="wide">
        <div className={styles.panel}>
          <div className={styles.heading}>
            <p>Database-backed Catalog</p>
            <h2 id="real-products-title">محصولات واقعی Miran</h2>
            <p className={styles.note}>
              قیمت فرم تومان است و در Database به عدد صحیح ریال ذخیره می‌شود. حذف محصول به‌صورت Archive انجام می‌شود تا تاریخچه سفارش و حسابداری از بین نرود.
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
              <label>توضیحات<textarea name="description" rows={4} maxLength={10000} /></label>
              <label>قیمت به تومان<input name="priceToman" type="number" min="0" step="1" required /></label>
              <label>
                نوع تخفیف
                <select value={discountType} onChange={(event) => setDiscountType(event.target.value as DiscountType)}>
                  <option value="NONE">بدون تخفیف</option>
                  <option value="PERCENTAGE">درصدی</option>
                  <option value="FIXED_IRR">مبلغ ثابت — ورودی تومان</option>
                </select>
              </label>
              {discountType !== "NONE" ? (
                <label>
                  {discountType === "PERCENTAGE" ? "درصد تخفیف" : "مبلغ تخفیف به تومان"}
                  <input name="discountValue" type="number" min="0" max={discountType === "PERCENTAGE" ? 100 : undefined} step="1" required />
                </label>
              ) : null}
              <label>شروع تخفیف<input name="discountStartsAt" type="datetime-local" /></label>
              <label>پایان تخفیف<input name="discountEndsAt" type="datetime-local" /></label>
              <label>ویژگی‌های برجسته — هر خط یک مورد<textarea name="highlights" rows={3} /></label>
              <label>مشخصات — هر خط به شکل عنوان:مقدار<textarea name="specifications" rows={4} /></label>
              <label>موجودی اولیه<input name="stockOnHand" type="number" min="0" step="1" required /></label>
              <label><input name="isAmazing" type="checkbox" /> پیشنهاد شگفت‌انگیز</label>
              <label><input name="publishNow" type="checkbox" /> انتشار فوری و نمایش در ویترین</label>
              <button type="submit" disabled={loading}>ذخیره محصول در Database</button>
            </form>

            <div>
              <h3>فهرست Database</h3>
              {loading && products.length === 0 ? <p role="status">در حال دریافت…</p> : null}
              {!loading && products.length === 0 ? <p>هنوز محصول واقعی ثبت نشده است.</p> : null}
              {products.map((product) => (
                <article className={styles.card} key={product.id}>
                  <h3>{product.title}</h3>
                  <p className={styles.status}>
                    {product.status === "PUBLISHED" ? "منتشرشده" : product.status === "ARCHIVED" ? "آرشیوشده" : "Draft"}
                  </p>
                  <p>{toman(product.pricing.finalIrr)}</p>
                  <p className={styles.meta}>
                    {product.brand || "بدون برند"} — {product.categoryName || "بدون دسته"}
                  </p>
                  {product.pricing.discountIrr > 0 ? (
                    <p className={styles.meta}>قیمت پایه {toman(product.pricing.baseIrr)} — تخفیف {toman(product.pricing.discountIrr)}</p>
                  ) : null}
                  <p className={styles.meta}>موجودی {product.stockOnHand.toLocaleString("fa-IR")} — رزرو {product.stockReserved.toLocaleString("fa-IR")}</p>

                  <form className={styles.form} onSubmit={(event) => void updateDetails(event, product)}>
                    <h4>قیمت و Merchandising</h4>
                    <label>برند<input name="brand" defaultValue={product.brand} /></label>
                    <label>
                      دسته
                      <select name="categoryId" defaultValue={product.categoryId ?? ""}>
                        <option value="">بدون دسته</option>
                        {categories.map((category) => <option key={category.id} value={category.id}>{category.parentId ? "↳ " : ""}{category.name}</option>)}
                      </select>
                    </label>
                    <label>قیمت پایه به تومان<input name="basePriceToman" type="number" min="0" step="1" defaultValue={Math.round(product.pricing.baseIrr / 10)} required /></label>
                    <label>
                      نوع تخفیف
                      <select name="discountType" defaultValue={product.discountType}>
                        <option value="NONE">بدون تخفیف</option>
                        <option value="PERCENTAGE">درصدی</option>
                        <option value="FIXED_IRR">مبلغ ثابت — تومان</option>
                      </select>
                    </label>
                    <label>مقدار تخفیف<input name="discountValue" type="number" min="0" step="1" defaultValue={product.discountType === "FIXED_IRR" ? Math.round(product.discountValue / 10) : product.discountValue} /></label>
                    <label>شروع<input name="discountStartsAt" type="datetime-local" defaultValue={localDateTime(product.discountStartsAt)} /></label>
                    <label>پایان<input name="discountEndsAt" type="datetime-local" defaultValue={localDateTime(product.discountEndsAt)} /></label>
                    <label><input name="isAmazing" type="checkbox" defaultChecked={product.isAmazing} /> پیشنهاد شگفت‌انگیز</label>
                    <button type="submit" disabled={loading || product.status === "ARCHIVED"}>ذخیره قیمت و دسته</button>
                  </form>

                  <form className={styles.form} onSubmit={(event) => void addMedia(event, product.id)}>
                    <h4>افزودن تصویر یا ویدئو</h4>
                    <label>
                      نوع
                      <select name="mediaType" defaultValue="IMAGE">
                        <option value="IMAGE">تصویر</option>
                        <option value="VIDEO">ویدئو کوتاه</option>
                      </select>
                    </label>
                    <label>URL رسانه<input name="url" dir="ltr" placeholder="/media/product.webp یا https://..." required /></label>
                    <label>ترتیب<input name="sortOrder" type="number" min="0" step="1" defaultValue="0" /></label>
                    <label><input name="isPrimary" type="checkbox" /> تصویر اصلی</label>
                    <button type="submit" disabled={loading || product.status === "ARCHIVED"}>اتصال رسانه</button>
                  </form>
                  {product.media.length > 0 ? (
                    <ul>
                      {product.media.map((media) => (
                        <li key={media.id}>
                          {media.media_type} — <bdi dir="ltr">{media.url}</bdi>{media.is_primary ? " — اصلی" : ""}{" "}
                          <button type="button" disabled={loading} onClick={() => void removeMedia(product, media)}>حذف رسانه</button>
                        </li>
                      ))}
                    </ul>
                  ) : null}

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
                      disabled={product.status === "ARCHIVED"}
                      onBlur={(event) => {
                        const value = Number(event.currentTarget.value);
                        if (Number.isSafeInteger(value) && value !== product.stockOnHand) {
                          void patch({ id: product.id, action: "inventory", stockOnHand: value });
                        }
                      }}
                    />
                    <button type="button" disabled={loading} onClick={() => void toggleArchive(product)}>
                      {product.status === "ARCHIVED" ? "بازگردانی به Draft" : "آرشیو امن"}
                    </button>
                    {product.status === "PUBLISHED" ? <a href={`/product/${encodeURIComponent(product.slug)}`}>مشاهده محصول</a> : null}
                  </div>
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
