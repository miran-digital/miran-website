"use client";

import { useState, type FormEvent } from "react";
import { Container } from "@miran/ui";
import { createSellerApplication } from "./seller-applications";
import styles from "./seller.module.css";

export function SellerPage() {
  const [submitted, setSubmitted] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    createSellerApplication({
      storeName: String(data.get("storeName") ?? ""),
      contactName: String(data.get("contactName") ?? ""),
      email: String(data.get("email") ?? ""),
      phone: String(data.get("phone") ?? ""),
      category: String(data.get("category") ?? ""),
      notes: String(data.get("notes") ?? ""),
    });
    form.reset();
    setSubmitted(true);
  }

  return (
    <main className={styles.page}>
      <Container size="wide">
        <div className={styles.layout}>
          <section className={styles.intro}>
            <p>Marketplace</p>
            <h1>فروش در Miran Shop</h1>
            <p>
              درخواست اولیه فروشندگی را ثبت کنید. در نسخه فعلی، اطلاعات فقط روی
              همین دستگاه ذخیره می‌شود و در پنل مدیریت آزمایشی قابل بررسی است.
            </p>
            <ol>
              <li>ثبت اطلاعات فروشگاه و دسته‌بندی</li>
              <li>بررسی درخواست توسط مدیر</li>
              <li>تکمیل احراز هویت و قرارداد در backend امن</li>
            </ol>
          </section>
          <form className={styles.form} onSubmit={submit}>
            <h2>درخواست فروشندگی</h2>
            {submitted ? (
              <p className={styles.success} role="status">
                درخواست آزمایشی ثبت شد و در پنل مدیریت این دستگاه دیده می‌شود.
              </p>
            ) : null}
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
                <option value="digital">کالای دیجیتال</option>
                <option value="home-kitchen">خانه و آشپزخانه</option>
                <option value="fashion">مد و پوشاک</option>
                <option value="beauty-health">زیبایی و سلامت</option>
                <option value="other">سایر</option>
              </select>
            </label>
            <label>
              <span>توضیحات کوتاه</span>
              <textarea name="notes" rows={4} maxLength={1000} />
            </label>
            <button type="submit">ثبت درخواست آزمایشی</button>
            <small>
              برای انتشار واقعی، رضایت‌نامه حریم خصوصی و انتقال امن به backend
              الزامی است.
            </small>
          </form>
        </div>
      </Container>
    </main>
  );
}
