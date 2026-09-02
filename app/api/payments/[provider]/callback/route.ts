import { handlePaymentCallback } from "@/lib/payments/payment-callback";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  return handlePaymentCallback(request, (await params).provider);
}

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  return handlePaymentCallback(request, (await params).provider);
}
