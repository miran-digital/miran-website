import type { Metadata } from "next";
import { CartPage } from "@/features/cart/cart-page";

export const metadata: Metadata = {
  title: "سبد خرید",
  description: "مشاهده و مدیریت کالاهای سبد خرید Miran Shop.",
  robots: { index: false, follow: false },
};

export default function CartRoute() {
  return <CartPage />;
}
