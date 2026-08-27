import { readStorefrontState } from "@/db/admin-repository";
import { getOperationalReport } from "@/db/reporting-repository";
import type { OperationalReport } from "@/features/admin/report-types";
import { getAdminAccess } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await getAdminAccess("reports.read");
  if (!access.allowed) {
    return Response.json(
      { error: "دسترسی گزارش‌های مدیریت مجاز نیست." },
      { status: access.reason === "anonymous" ? 401 : 403 },
    );
  }
  try {
    const state = await readStorefrontState();
    const report = await getOperationalReport(state.commerce.lowStockThreshold);
    if (new URL(request.url).searchParams.get("format") === "csv") {
      const body = `\uFEFF${reportCsv(report)}`;
      return new Response(body, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": "attachment; filename=miran-operational-report.csv",
          "cache-control": "private, no-store",
        },
      });
    }
    return Response.json({ report }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ error: "ساخت گزارش مدیریتی ممکن نشد." }, { status: 503 });
  }
}

function reportCsv(report: OperationalReport) {
  const rows: Array<[string, string | number]> = [
    ["زمان تولید", report.generatedAt],
    ["تعداد سفارش", report.commerce.totalOrders],
    ["سفارش پرداخت‌شده", report.commerce.paidOrders],
    ["درآمد پرداخت‌شده ریال", report.commerce.paidRevenueRial],
    ["تعداد مشتری", report.commerce.customerCount],
    ["محصول قابل نمایش", report.catalog.visibleProducts],
    ["محصول ناموجود", report.catalog.outOfStockProducts],
    ["هشدار موجودی", report.catalog.lowStockProducts],
    ["تیکت باز", report.operations.openSupportTickets],
    ["دیدگاه در انتظار", report.operations.pendingReviews],
    ["درخواست مسدودشده ۲۴ ساعت", report.operations.blockedRequestsLast24Hours],
    ["رزرو منقضی", report.operations.staleReservations],
    ["پرداخت معطل", report.operations.stalePaymentAttempts],
  ];
  return ["شاخص,مقدار", ...rows.map(([label, value]) => `${csv(label)},${csv(value)}`)].join("\n");
}

function csv(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
