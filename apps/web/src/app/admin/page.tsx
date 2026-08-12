import type { Metadata } from "next";
import { AdminPage } from "@/features/admin/admin-page";
import { getCatalogCategories } from "@/features/catalog/catalog-data";

export const metadata: Metadata = {
  title: "Admin Preview",
  description: "پنل مدیریت آزمایشی Miran Shop.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AdminRoute() {
  const categories = await getCatalogCategories();
  return <AdminPage categories={categories} />;
}
