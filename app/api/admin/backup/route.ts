import { createLogicalDatabaseBackup } from "@/db/backup-repository";
import { getAdminAccess } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAdminAccess("backup.read");
  if (!access.allowed) {
    return Response.json({ error: "مجوز دریافت پشتیبان برای این حساب فعال نیست." }, { status: 403 });
  }
  const exportedAt = new Date().toISOString();
  const backup = await createLogicalDatabaseBackup(undefined, {
    includeOwnerAuthentication: access.role === "owner",
  });
  const body = JSON.stringify({ ...backup, exportedAt, exportedBy: access.user.email }, null, 2);
  const stamp = exportedAt.slice(0, 10).replaceAll("-", "");
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="miran-shop-backup-${stamp}.json"`,
      "cache-control": "no-store",
    },
  });
}
