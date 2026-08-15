import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RealSellerPortal } from "@/features/seller/real-seller-portal";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "فروشندگی در Miran",
  description: "درخواست و مدیریت وضعیت فروشندگی در Miran Shop.",
  robots: { index: false, follow: false },
};

export default async function SellerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/account?returnTo=/seller");
  return <RealSellerPortal />;
}
