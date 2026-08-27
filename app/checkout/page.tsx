import type { Metadata } from "next";
import { requireCustomerUser } from "@/lib/customer-auth";
import { listCustomerAddresses } from "@/db/customer-address-repository";
import { CheckoutPage } from "@/features/checkout/checkout-page";
import { readStorefrontState } from "@/db/admin-repository";
import { createDefaultAdminState } from "@/features/admin/admin-types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "تکمیل سفارش",
  description: "تکمیل اطلاعات تحویل و مرور سفارش Miran Shop.",
  robots: { index: false, follow: false },
};

export default async function CheckoutRoute() {
  const user = await requireCustomerUser("/checkout");
  const [commerce, addresses] = await Promise.all([
    readStorefrontState()
      .then((state) => state.commerce)
      .catch(() => createDefaultAdminState().commerce),
    listCustomerAddresses(user.email).catch(() => []),
  ]);
  return (
    <CheckoutPage
      calendarMode={commerce.calendarMode}
      deliveryFees={commerce.deliveryFees}
      bankTransfer={commerce.bankTransfer}
      customerEmail={user.email}
      initialAddresses={addresses}
    />
  );
}
