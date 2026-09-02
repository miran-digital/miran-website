import { handlePaymentCallback } from "@/lib/payments/payment-callback";

export const dynamic = "force-dynamic";

// Preserve the historical V55 URL; new signed callbacks use the same shared core.
export async function GET(request: Request) {
  return handlePaymentCallback(request, "zarinpal");
}
