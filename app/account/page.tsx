import type { Metadata } from "next";
import { Container } from "@/components/ui";
import { getCustomerUser } from "@/lib/customer-auth";
import { CustomerAuthForm, CustomerLogoutButton } from "@/features/account/customer-auth-form";
import { AddressBook } from "@/features/account/address-book";
import { OrderHistory } from "@/features/account/order-history";
import { readStorefrontState } from "@/db/admin-repository";
import { listCustomerOrders } from "@/db/order-repository";
import { listCustomerBankTransferReceipts } from "@/db/bank-transfer-repository";
import {
  listCustomerNotifications,
  listCustomerSupportTickets,
} from "@/db/customer-care-repository";
import { NotificationCenter } from "@/features/customer-care/notification-center";
import { SupportCenter } from "@/features/customer-care/support-center";
import { ManagedBrand } from "@/features/admin/managed-storefront";
import styles from "./account.module.css";

export const metadata: Metadata = {
  title: "حساب کاربری",
  description: "ورود و مدیریت حساب Miran Shop.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams?: Promise<{ next?: string }> }) {
  const user = await getCustomerUser();
  const next = (await searchParams)?.next;
  const [orders, receipts, notifications, tickets, calendarMode] = user
    ? await Promise.all([
        listCustomerOrders(user.email).catch(() => []),
        listCustomerBankTransferReceipts(user.email).catch(() => []),
        listCustomerNotifications(user.email).catch(() => []),
        listCustomerSupportTickets(user.email).catch(() => []),
        readStorefrontState()
          .then((state) => state.commerce.calendarMode)
          .catch(() => "jalali" as const),
      ])
    : [[], [], [], [], "jalali" as const];
  if (!user) {
    return (
      <main className={`${styles.page} account-login-page`}>
        <div className={styles.loginViewport}>
          <section className={styles.loginCard} aria-labelledby="account-login-title">
            <header className={styles.loginHeader}>
              <a className={styles.loginBack} href="/" aria-label="بازگشت به فروشگاه">→</a>
              <a className={styles.loginBrand} href="/" aria-label="صفحه اصلی MIRAN">
                <ManagedBrand imageClassName="managed-brand-image" />
              </a>
            </header>
            <h1 id="account-login-title">ورود | ثبت‌نام</h1>
            <p>لطفاً ایمیل خود را وارد کنید</p>
            <CustomerAuthForm next={next?.startsWith("/") && !next.startsWith("//") ? next : "/account"} />
          </section>
        </div>
      </main>
    );
  }
  return (
    <main className={styles.page}>
      <Container size="wide">
        <div className={styles.layout}>
          <section className={styles.intro}>
            <p>Miran Shop Account</p>
            <h1>خریدها و اطلاعات شما در یک جای امن</h1>
            <p>
              سفارش‌ها و نشانی‌های تحویل فقط برای حساب تأییدشده شما نمایش
              داده می‌شوند و رمز عبوری در فروشگاه نگهداری نمی‌شود.
            </p>
            <ul>
              <li>مشاهده تاریخچه و وضعیت سفارش</li>
              <li>مدیریت نشانی‌های تحویل</li>
              <li>ثبت سفارش با نشانی تأییدشده</li>
            </ul>
          </section>
          <section className={styles.auth} aria-labelledby="account-login-title">
            <p>ورود موفق</p>
            <h2 id="account-login-title">{user.fullName ?? "حساب مشتری"}</h2>
            <p dir="ltr">{user.email}</p>
            <CustomerLogoutButton />
            <small>حساب مشتری مستقل است و نشست ورود به‌صورت امن نگهداری می‌شود.</small>
          </section>
        </div>
        <OrderHistory orders={orders} receipts={receipts} calendarMode={calendarMode} />
        <NotificationCenter initialNotifications={notifications} calendarMode={calendarMode} />
        <SupportCenter
          initialTickets={tickets}
          orderNumbers={orders.map((order) => order.orderNumber)}
          calendarMode={calendarMode}
        />
        <AddressBook />
      </Container>
    </main>
  );
}
