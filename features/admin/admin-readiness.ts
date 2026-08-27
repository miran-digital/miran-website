import type { LaunchReadinessReport } from "@/lib/launch-readiness";

export async function getAdminReadiness() {
  const response = await fetch("/api/admin/readiness", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    report?: LaunchReadinessReport;
    error?: string;
  };
  if (!response.ok || !payload.report) {
    throw new Error(payload.error || "بررسی آمادگی فروشگاه ممکن نشد.");
  }
  return payload.report;
}
