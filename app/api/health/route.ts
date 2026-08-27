import { getPaymentCapability } from "@/lib/payment-provider";
import { probeDatabaseHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [database, payment] = await Promise.all([
      probeDatabaseHealth(),
      getPaymentCapability(),
    ]);
    return Response.json(
      {
        status: "ok",
        checks: { database },
        paymentConfigured: payment.enabled,
        timestamp: new Date().toISOString(),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        status: "unavailable",
        checks: { database: "unavailable" },
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
