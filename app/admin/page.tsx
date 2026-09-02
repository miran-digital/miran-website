import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { chatGPTSignOutPath } from "@/app/chatgpt-auth";
import { AdminPage } from "@/features/admin/admin-page";
import { getAdminCatalogCategories } from "@/features/catalog/catalog-data";
import { getAdminAccess } from "@/lib/admin-auth";
import styles from "./access.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "مدیریت فروشگاه",
  description: "پنل مدیریت امن Miran Shop.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AdminRoute({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await getAdminAccess();
  if (!access.allowed && access.reason === "anonymous") {
    redirect("/admin/login?next=%2Fadmin");
  }
  if (!access.allowed) {
    return (
      <main className={`${styles.page} admin-page`}>
        <section className={styles.card}>
          <span>دسترسی محافظت‌شده</span>
          <h1>این حساب اجازهٔ مدیریت ندارد</h1>
          <p>
            برای ورود به مدیریت باید با حساب مالک Miran Shop وارد شوید.
          </p>
          {access.user ? <small dir="ltr">{access.user.email}</small> : null}
          <a href="/admin/login?next=%2Fadmin">ورود با نام کاربری مالک</a>
          <a href={chatGPTSignOutPath("/admin")}>خروج و ورود با حساب ChatGPT مجاز</a>
        </section>
      </main>
    );
  }
  const categories = getAdminCatalogCategories();
  const params = await searchParams ?? {};
  const initialTab = params.tab === "orders" && access.permissions.includes("orders.write")
    ? "orders"
    : params.tab === "customers" && access.permissions.includes("customers.read")
      ? "customers"
      : "overview";
  return (
    <AdminPage
      categories={categories}
      signOutHref={access.authMethod === "owner_password" ? "/admin/logout" : chatGPTSignOutPath("/")}
      role={access.role}
      permissions={access.permissions}
      initialTab={initialTab}
      initialOrderId={initialTab === "orders" && typeof params.order === "string" ? params.order.slice(0, 120) : ""}
      initialCustomerId={initialTab === "customers" && typeof params.customer === "string" ? params.customer.slice(0, 180) : ""}
    />
  );
}
