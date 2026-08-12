import type { Metadata } from "next";
import { CheckoutPage } from "@/features/checkout/checkout-page";

export const metadata: Metadata = {
  title: "تکمیل سفارش",
  description: "تکمیل اطلاعات تحویل و مرور سفارش Miran Shop.",
  robots: { index: false, follow: false },
};

export default function CheckoutRoute() {
  return <CheckoutPage />;
}
