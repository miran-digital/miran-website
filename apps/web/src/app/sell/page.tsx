import type { Metadata } from "next";
import { SellerPage } from "@/features/seller/seller-page";

export const metadata: Metadata = {
  title: "فروش در Miran Shop",
  description: "ثبت درخواست فروشندگی در Marketplace میران.",
  robots: { index: false, follow: true },
};

export default function SellRoute() {
  return <SellerPage />;
}
