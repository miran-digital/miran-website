import type { Metadata } from "next";
import { Container } from "@miran/ui";
import styles from "./account.module.css";

export const metadata: Metadata = {
  title: "حساب کاربری",
  description: "ورود و مدیریت حساب Miran Shop.",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <main className={styles.page}>
      <Container size="wide">
        <div className={styles.layout}>
          <section className={styles.intro}>
            <p>Miran Shop Account</p>
            <h1>خریدها و اطلاعات شما در یک جای امن</h1>
            <p>
              پس از اتصال سرویس Identity، سفارش‌ها، نشانی‌ها، بازگشت کالا و
              تنظیمات حساب از این بخش مدیریت می‌شوند.
            </p>
            <ul>
              <li>پیگیری سفارش و ارسال</li>
              <li>مدیریت نشانی‌های تحویل</li>
              <li>درخواست بازگشت و پشتیبانی</li>
            </ul>
          </section>
          <section
            className={styles.auth}
            aria-labelledby="account-login-title"
          >
            <h2 id="account-login-title">ورود امن</h2>
            <p>
              ورود جعلی در Frontend ساخته نشده است. این فرم پس از اتصال Auth و
              مدیریت نشست امن فعال می‌شود.
            </p>
            <label>
              <span>ایمیل</span>
              <input type="email" autoComplete="email" dir="ltr" disabled />
            </label>
            <label>
              <span>رمز عبور</span>
              <input
                type="password"
                autoComplete="current-password"
                dir="ltr"
                disabled
              />
            </label>
            <button type="button" disabled>
              ورود
            </button>
            <small>هیچ رمز عبوری در نسخه فعلی دریافت یا ذخیره نمی‌شود.</small>
          </section>
        </div>
      </Container>
    </main>
  );
}
