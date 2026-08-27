import { getPaymentCapability } from "@/lib/payment-provider";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getPaymentCapability(), {
    headers: { "cache-control": "no-store" },
  });
}
