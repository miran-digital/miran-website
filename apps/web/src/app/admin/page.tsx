import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminPage } from "@/features/admin/admin-page";
import { LegacyPreviewImportManager } from "@/features/admin/legacy-preview-import-manager";
import { RealCategoryManager } from "@/features/admin/real-category-manager";
import { RealOrderManager } from "@/features/admin/real-order-manager";
import { RealProductManager } from "@/features/admin/real-product-manager";
import { RealProductMediaUploadManager } from "@/features/admin/real-product-media-upload-manager";
import { RealSellerVerificationManager } from "@/features/admin/real-seller-verification-manager";
import { RealStorefrontCmsManager } from "@/features/admin/real-storefront-cms-manager";
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

  const legacyCategories = await getCatalogCategories();
  return (
    <>
      <RealStorefrontCmsManager />
      <RealOrderManager />
      <RealCategoryManager />
      <RealProductManager />
      <RealProductMediaUploadManager />
      <RealSellerVerificationManager />
      <LegacyPreviewImportManager />
      <AdminPage categories={legacyCategories} />
    </>
  );
}
