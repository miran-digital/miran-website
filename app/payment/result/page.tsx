import type { Metadata } from "next";
import { Container } from "@/components/ui";
import { getCustomerUser } from "@/lib/customer-auth";
import { getOwnedOrderPaymentSummary } from "@/db/order-repository";
import styles from "@/features/checkout/checkout.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "نتیجه پرداخت",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await getCustomerUser();
  const requestedOrder = typeof params.order === "string" && params.order.length <= 80 ? params.order : "";
  const summary = user && requestedOrder
    ? await getOwnedOrderPaymentSummary(requestedOrder, user.email).catch(() => null)
    : null;
  // Browser query parameters never establish payment success or expose another customer's order.
  const paid = summary?.payment_status === "paid";
  const order = summary?.order_number ?? "";
  const reference = paid ? summary?.reference ?? "" : "";
  return (
    <main className={styles.page} dir="rtl">
      <Container size="wide">
        <div className={`${styles.state} ${paid ? styles.success : ""}`} role="status">
          <span aria-hidden="true">{paid ? "✓" : "!"}</span>
          <h1>{paid ? "پرداخت با موفقیت تأیید شد" : "پیگیری وضعیت پرداخت"}</h1>
          {order ? <p>شماره سفارش: <strong dir="ltr">{order}</strong></p> : null}
          {reference ? <p>شماره مرجع: <strong dir="ltr">{reference}</strong></p> : null}
          <p>{paid ? "پرداخت این سفارش در حساب شما تأیید شده است." : !user ? "برای مشاهده نتیجهٔ تأییدشده، وارد حساب خریدار شوید." : !summary ? "وضعیت سفارش اکنون برای این حساب در دسترس نیست." : "تأیید نهایی پرداخت هنوز ثبت نشده است. در صورت کسر وجه، دوباره پرداخت نکنید و با شماره سفارش پیگیری کنید."}</p>
          <a href="/account">پیگیری در حساب کاربری</a>
          <a href="/">بازگشت به فروشگاه</a>
        </div>
      </Container>
    </main>
  );
}
