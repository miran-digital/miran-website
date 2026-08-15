"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Container } from "@miran/ui";
import styles from "./real-product-manager.module.css";

type ManagedProduct = {
  id: string;
  slug: string;
  title: string;
  pricing: { baseIrr: number; finalIrr: number; discountIrr: number };
  currency: "IRR";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  stockOnHand: number;
  stockReserved: number;
  discountType: "NONE" | "PERCENTAGE" | "FIXED_IRR";
  discountValue: number;
};

function toman(irr: number) {
  return `${Math.round(irr / 10).toLocaleString("fa-IR")} تومان`;
}

export function RealProductManager() {
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [discountType, setDiscountType] = useState<ManagedProduct["discountType"]>("NONE");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/products", { cache: "no-store" });
      const data = (await response.json()) as {
        products?: ManagedProduct[];
        message?: string;
      };
      if (!response.ok || !data.products) {
        setMessage(data.message ?? "دریافت محصولات Database انجام نشد.");
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

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const priceToman = Number(data.get("priceToman"));
    const stockOnHand = Number(data.get("stockOnHand"));
    const rawDiscount = Number(data.get("discountValue") || 0);
    if (!Number.isSafeInteger(priceToman) || priceToman < 0) {
      setMessage("قیمت باید عدد صحیح و مثبت به تومان باشد.");
      return;
    }
    if (!Number.isSafeInteger(stockOnHand) || stockOnHand < 0) {
      setMessage("موجودی باید عدد صحیح و غیرمنفی باشد.");
      return;
    }
    const discountValue =
      discountType === "FIXED_IRR" ? rawDiscount * 10 : rawDiscount;

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(data.get("title") || "").trim(),
          slug: String(data.get("slug") || "")
            .trim()
            .toLowerCase(),
          description: String(data.get("description") || ""),
          basePriceIrr: priceToman * 10,
          discountType,
          discountValue,
          isAmazing: data.get("isAmazing") === "on",
          status: "DRAFT",
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
      setMessage("محصول به‌صورت Draft در Database ساخته شد.");
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

  return (
    <section className={styles.section} aria-labelledby="real-products-title">
      <Container size="wide">
        <div className={styles.panel}>
          <div className={styles.heading}>
            <p>Database-backed Catalog</p>
            <h2 id="real-products-title">محصولات واقعی Miran</h2>
            <p className={styles.note}>
              قیمت ورودی این فرم تومان است؛ Backend آن را به عدد صحیح ریال تبدیل و
              ذخیره می‌کند. محصولات قدیمی Preview هنوز حذف یا تبدیل نشده‌اند.
            </p>
          </div>

          <div className={styles.grid}>
            <form className={styles.form} onSubmit={createProduct}>
              <h3>محصول جدید</h3>
              <label>
                عنوان
                <input name="title" maxLength={180} required />
              </label>
              <label>
                Slug
                <input name="slug" pattern="[A-Za-z0-9-]+" dir="ltr" required />
              </label>
              <label>
                توضیحات
                <input name="description" maxLength={500} />
              </label>
              <label>
                قیمت به تومان
                <input name="priceToman" type="number" min="0" step="1" required />
              </label>
              <label>
                نوع تخفیف
                <select
                  value={discountType}
                  onChange={(event) =>
                    setDiscountType(event.target.value as ManagedProduct["discountType"])
                  }
                >
                  <option value="NONE">بدون تخفیف</option>
                  <option value="PERCENTAGE">درصدی</option>
                  <option value="FIXED_IRR">مبلغ ثابت (ورودی تومان)</option>
                </select>
              </label>
              {discountType !== "NONE" ? (
                <label>
                  {discountType === "PERCENTAGE" ? "درصد تخفیف" : "مبلغ تخفیف به تومان"}
                  <input
                    name="discountValue"
                    type="number"
                    min="0"
                    max={discountType === "PERCENTAGE" ? 100 : undefined}
                    step="1"
                    required
                  />
                </label>
              ) : null}
              <label>
                موجودی اولیه
                <input name="stockOnHand" type="number" min="0" step="1" required />
              </label>
              <label>
                <input name="isAmazing" type="checkbox" /> پیشنهاد شگفت‌انگیز
              </label>
              <button type="submit" disabled={loading}>
                ذخیره Draft در Database
              </button>
            </form>

            <div>
              <h3>فهرست Database</h3>
              {loading && products.length === 0 ? <p role="status">در حال دریافت…</p> : null}
              {!loading && products.length === 0 ? <p>هنوز محصول واقعی ثبت نشده است.</p> : null}
              {products.map((product) => (
                <article className={styles.card} key={product.id}>
                  <h3>{product.title}</h3>
                  <p className={styles.status}>
                    {product.status === "PUBLISHED" ? "منتشرشده" : "Draft"}
                  </p>
                  <p>{toman(product.pricing.finalIrr)}</p>
                  {product.pricing.discountIrr > 0 ? (
                    <p className={styles.meta}>
                      قیمت پایه {toman(product.pricing.baseIrr)} — تخفیف {toman(product.pricing.discountIrr)}
                    </p>
                  ) : null}
                  <p className={styles.meta}>
                    موجودی {product.stockOnHand.toLocaleString("fa-IR")} — رزرو {product.stockReserved.toLocaleString("fa-IR")}
                  </p>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() =>
                        void patch({
                          id: product.id,
                          action: "publish",
                          published: product.status !== "PUBLISHED",
                        })
                      }
                    >
                      {product.status === "PUBLISHED" ? "برگرداندن به Draft" : "انتشار"}
                    </button>
                    <input
                      aria-label={`موجودی ${product.title}`}
                      type="number"
                      min={product.stockReserved}
                      step="1"
                      defaultValue={product.stockOnHand}
                      onBlur={(event) => {
                        const value = Number(event.currentTarget.value);
                        if (Number.isSafeInteger(value) && value !== product.stockOnHand) {
                          void patch({
                            id: product.id,
                            action: "inventory",
                            stockOnHand: value,
                          });
                        }
                      }}
                    />
                    {product.status === "PUBLISHED" ? (
                      <a href={`/product/${encodeURIComponent(product.slug)}`}>مشاهده محصول</a>
                    ) : null}
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
