"use client";

import { useState, type FormEvent } from "react";
import { Container } from "@/components/ui";
import type { CatalogCategory } from "@/features/catalog/catalog-gateway";
import { createSellerApplication } from "./seller-applications";
import styles from "./seller.module.css";

export function SellerPage({ categories }: { categories: readonly CatalogCategory[] }) {
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    setStatus("submitting");
    setError("");
    try {
      await createSellerApplication(data);
      form.reset();
      setStatus("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ثبت درخواست ممکن نشد.");
      setStatus("error");
    }
  }

  return (
    <main className={styles.page}>
      <Container size="wide">
        <div className={styles.layout}>
          <section className={styles.intro}>
            <p>Marketplace</p>
            <h1>فروش در Miran Shop</h1>
            <p>
              پرونده فروشندگی را ثبت کنید. مدارک در فضای خصوصی نگهداری می‌شوند
              و فقط مدیر فروشگاه امکان بررسی آن‌ها را دارد.
            </p>
            <ol>
              <li>ثبت اطلاعات هویتی و دسته‌بندی کالا</li>
              <li>دریافت و بررسی مدارک و ضمانت</li>
              <li>امضای قرارداد و تأیید نهایی مدیر</li>
            </ol>
          </section>
          <form className={styles.form} onSubmit={submit}>
            <h2>درخواست فروشندگی</h2>
            {status === "done" ? (
              <p className={styles.success} role="status">
                درخواست شما ثبت شد و برای بررسی مدیر ارسال گردید.
              </p>
            ) : null}
            {status === "error" ? (
              <p className={styles.error} role="alert">{error}</p>
            ) : null}
            <label className="miran-visually-hidden" aria-hidden="true">
              <span>وب‌سایت</span>
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
            <label>
              <span>نام فروشگاه یا شرکت</span>
              <input name="storeName" required maxLength={120} />
            </label>
            <label>
              <span>نام مسئول تماس</span>
              <input name="contactName" required maxLength={120} />
            </label>
            <div className={styles.twoColumns}>
              <label>
                <span>ایمیل</span>
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={200}
                  dir="ltr"
                />
              </label>
              <label>
                <span>شماره تماس</span>
                <input
                  name="phone"
                  type="tel"
                  required
                  maxLength={40}
                  dir="ltr"
                />
              </label>
            </div>
            <label>
              <span>دسته‌بندی اصلی کالا</span>
              <select name="category" required defaultValue="">
                <option value="" disabled>
                  انتخاب کنید
                </option>
                {categories.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.parentSlug ? "↳ " : ""}{category.name}
                  </option>
                ))}
                <option value="other">سایر</option>
              </select>
            </label>
            <div className={styles.twoColumns}>
              <label>
                <span>نوع فروشنده</span>
                <select name="legalType" required defaultValue="individual">
                  <option value="individual">شخص حقیقی</option>
                  <option value="company">شرکت / شخص حقوقی</option>
                </select>
              </label>
              <label>
                <span>شماره ثبت یا شناسه کسب‌وکار</span>
                <input name="registrationNumber" maxLength={120} dir="ltr" />
              </label>
            </div>
            <label>
              <span>نشانی محل فعالیت</span>
              <textarea name="address" rows={3} required maxLength={500} />
            </label>
            <label>
              <span>روش پیشنهادی ضمانت</span>
              <select name="guaranteeType" required defaultValue="review_later">
                <option value="review_later">تعیین پس از بررسی مدیر</option>
                <option value="bank_guarantee">ضمانت بانکی</option>
                <option value="refundable_deposit">ودیعه قابل استرداد</option>
                <option value="guarantor">ضامن معتبر</option>
              </select>
            </label>
            <label>
              <span>مدارک شناسایی و مجوز فعالیت</span>
              <input
                name="documents"
                type="file"
                multiple
                accept="application/pdf,image/jpeg,image/png,image/webp"
              />
              <small>حداکثر ۴ فایل؛ هر فایل تا ۵ مگابایت. مدارک عمومی نمایش داده نمی‌شوند.</small>
            </label>
            <label>
              <span>توضیحات کوتاه</span>
              <textarea name="notes" rows={4} maxLength={1000} />
            </label>
            <button type="submit" disabled={status === "submitting"}>
              {status === "submitting" ? "در حال ثبت…" : "ثبت درخواست فروشندگی"}
            </button>
            <small>
              با ثبت درخواست تأیید می‌کنید مدارک متعلق به خودتان یا کسب‌وکارتان است.
            </small>
          </form>
        </div>
      </Container>
    </main>
  );
}
