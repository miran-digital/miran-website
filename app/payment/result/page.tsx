import type { Metadata } from "next";
import { Container } from "@/components/ui";
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
  const paid = params.status === "paid";
  const order = typeof params.order === "string" ? params.order : "";
  const reference = typeof params.ref === "string" ? params.ref : "";
  return (
    <main className={styles.page} dir="rtl">
      <Container size="wide">
        <div className={`${styles.state} ${paid ? styles.success : ""}`} role="status">
          <span aria-hidden="true">{paid ? "✓" : "!"}</span>
          <h1>{paid ? "پرداخت با موفقیت تأیید شد" : "پرداخت تأیید نشد"}</h1>
          {order ? <p>شماره سفارش: <strong dir="ltr">{order}</strong></p> : null}
          {reference ? <p>شماره مرجع: <strong dir="ltr">{reference}</strong></p> : null}
          <p>{paid ? "سفارش شما وارد مرحلهٔ بررسی و آماده‌سازی شد." : "هیچ پرداخت موفقی برای این تلاش ثبت نشد. در صورت کسر وجه، وضعیت را با شماره سفارش پیگیری کنید."}</p>
          <a href="/">بازگشت به فروشگاه</a>
        </div>
      </Container>
    </main>
  );
}
