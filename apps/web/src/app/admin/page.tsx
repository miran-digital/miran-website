import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminPage } from "@/features/admin/admin-page";
import { RealProductManager } from "@/features/admin/real-product-manager";
import { getCatalogCategories } from "@/features/catalog/catalog-data";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "مدیریت Miran Shop",
  description: "پنل مدیریت Miran Shop.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AdminRoute() {
  const user = await getCurrentUser();
  if (!user) redirect("/account?returnTo=/admin");
  if (user.role !== "ADMIN") redirect("/account?error=admin-required");

  const categories = await getCatalogCategories();
  return (
    <>
      <RealProductManager />
      <AdminPage categories={categories} />
    </>
  );
}
