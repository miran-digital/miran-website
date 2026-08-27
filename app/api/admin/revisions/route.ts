import {
  listStorefrontRevisions,
  restoreStorefrontRevision,
} from "@/db/admin-repository";
import { getAdminAccess } from "@/lib/admin-auth";
import { rejectCrossSiteMutation } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAdminAccess("backup.read");
  if (!access.allowed) return denied();
  return Response.json(
    { revisions: await listStorefrontRevisions() },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const access = await getAdminAccess("restore.write");
  if (!access.allowed) return denied();
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const payload = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof payload?.id === "string" ? payload.id.slice(0, 120) : "";
  if (!id) return Response.json({ error: "نسخه انتخاب نشده است." }, { status: 422 });
  try {
    return Response.json({
      state: await restoreStorefrontRevision(id, access.user.email, {
        preserveAdminUsers: access.role !== "owner",
      }),
    });
  } catch {
    return Response.json({ error: "بازگردانی نسخه ممکن نشد." }, { status: 409 });
  }
}

function denied() {
  return Response.json({ error: "مجوز نسخه‌های پشتیبان برای این حساب فعال نیست." }, { status: 403 });
}
