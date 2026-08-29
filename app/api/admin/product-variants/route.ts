import { deleteAdminProductVariant } from "@/db/admin-repository";
import { getAdminAccess } from "@/lib/admin-auth";
import { rejectCrossSiteMutation } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const RESERVED_VARIANT_MESSAGE =
  "این تنوع در سفارش فعال رزرو شده است و تا آزادشدن رزرو قابل حذف نیست.";

export async function DELETE(request: Request) {
  const access = await getAdminAccess("catalog.delete");
  if (!access.allowed) {
    return Response.json(
      { error: "مجوز حذف تنوع محصول برای این حساب فعال نیست." },
      { status: access.reason === "anonymous" ? 401 : 403 },
    );
  }
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 2_048) {
    return Response.json({ error: "درخواست بیش از حد مجاز است." }, { status: 413 });
  }
  const payload = await request.json().catch(() => null) as {
    productId?: unknown;
    variantId?: unknown;
  } | null;
  const productId = typeof payload?.productId === "string"
    ? payload.productId.trim().slice(0, 120)
    : "";
  const variantId = typeof payload?.variantId === "string"
    ? payload.variantId.trim().slice(0, 120)
    : "";
  if (!productId || !variantId) {
    return Response.json({ error: "محصول و تنوع را انتخاب کنید." }, { status: 422 });
  }
  try {
    return Response.json(
      await deleteAdminProductVariant(productId, variantId, access.user.email),
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "VARIANT_RESERVED") {
      return Response.json({ error: RESERVED_VARIANT_MESSAGE }, { status: 409 });
    }
    return Response.json(
      { error: "محصول یا تنوع پیدا نشد و هیچ تغییری انجام نشد." },
      { status: 404 },
    );
  }
}
