import type { Metadata } from "next";
import { Container } from "@miran/ui";
import { AccountAuthForm } from "@/features/account/account-auth-form";
import styles from "./account.module.css";

export const metadata: Metadata = {
  title: "حساب کاربری",
  description: "ورود، ثبت‌نام و مدیریت حساب Miran Shop.",
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
              ورود و ثبت‌نام به Backend واقعی Miran متصل است. سفارش‌ها، نشانی‌ها،
              بازگشت کالا و تنظیمات حساب در مراحل بعدی همین حساب مدیریت می‌شوند.
            </p>
            <ul>
              <li>نشست امن و خروج واقعی</li>
              <li>مدیریت نشانی‌های تحویل</li>
              <li>پیگیری سفارش و پشتیبانی</li>
            </ul>
          </section>
          <section className={styles.auth} aria-labelledby="account-login-title">
            <AccountAuthForm />
          </section>
        </div>
      </Container>
    </main>
  );
}
