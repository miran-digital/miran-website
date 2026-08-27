import { deleteAdminProduct, readStorefrontState } from "@/db/admin-repository";
import { getAdminAccess } from "@/lib/admin-auth";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import {
  collectManagedMediaUrls,
  deleteUnreferencedManagedMedia,
} from "@/lib/admin-media-cleanup";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  const access = await getAdminAccess("catalog.delete");
  if (!access.allowed) {
    return Response.json(
      { error: "مجوز حذف محصول برای این حساب فعال نیست." },
      { status: access.reason === "anonymous" ? 401 : 403 },
    );
  }
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 2_048) {
    return Response.json({ error: "درخواست بیش از حد مجاز است." }, { status: 413 });
  }
  const payload = await request.json().catch(() => null) as { id?: unknown } | null;
  const id = typeof payload?.id === "string" ? payload.id.trim().slice(0, 120) : "";
  if (!id) return Response.json({ error: "محصول انتخاب نشده است." }, { status: 422 });
  try {
    const previous = await readStorefrontState();
    const result = await deleteAdminProduct(id, access.user.email);
    const saved = await readStorefrontState();
    await deleteUnreferencedManagedMedia(
      collectManagedMediaUrls(previous),
      collectManagedMediaUrls(saved),
    );
    return Response.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ error: "محصول پیدا نشد یا حذف آن ممکن نیست." }, { status: 409 });
  }
}
