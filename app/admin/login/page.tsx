import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { chatGPTSignInPath } from "@/app/chatgpt-auth";
import { getOwnerCredentialStatus } from "@/db/admin-owner-auth-repository";
import { AdminLoginForm } from "@/features/admin/admin-login-form";
import { getAdminAccess } from "@/lib/admin-auth";
import styles from "./login.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ورود مالک | MIRAN",
  description: "ورود امن به مدیریت MIRAN.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const access = await getAdminAccess();
  if (access.allowed) redirect("/admin");
  const requestedNext = (await searchParams)?.next ?? "/admin";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/admin";
  const configured = await getOwnerCredentialStatus()
    .then((status) => status.configured)
    .catch(() => false);

  return (
    <main className={`${styles.page} account-login-page`}>
      <section className={styles.card} aria-labelledby="admin-login-title">
        <header><a href="/" aria-label="بازگشت به فروشگاه">→</a><strong>MIRAN</strong></header>
        <p className={styles.kicker}>مدیریت</p>
        <h1 id="admin-login-title">ورود مالک</h1>
        {configured ? (
          <AdminLoginForm next={next} />
        ) : (
          <p className={styles.notice}>ورود با نام کاربری هنوز توسط مالک فعال نشده است. یک بار با حساب مالک ChatGPT وارد شوید و آن را در نمای کلی پنل تنظیم کنید.</p>
        )}
        <div className={styles.separator}><span>یا</span></div>
        <a className={styles.chatgpt} href={chatGPTSignInPath("/admin")}>ورود مالک یا مدیر با ChatGPT</a>
        <small>ورود مشتریان کاملاً جداست و از این صفحه امکان ورود به حساب مشتری وجود ندارد.</small>
      </section>
    </main>
  );
}
