import { getAdminAccess } from "@/lib/admin-auth";
import {
  createMediaBackupTar,
  isOwnerMediaBackupAccess,
} from "@/lib/media-backup";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAdminAccess("backup.read");
  if (!access.allowed) {
    return Response.json(
      { error: "مجوز دریافت پشتیبان برای این حساب فعال نیست." },
      { status: 403, headers: { "cache-control": "private, no-store" } },
    );
  }
  if (!isOwnerMediaBackupAccess(access)) {
    return Response.json(
      { error: "پشتیبان کامل رسانه فقط در اختیار مالک اصلی است." },
      { status: 403, headers: { "cache-control": "private, no-store" } },
    );
  }

  const { BUCKET: bucket } = await getRuntimeEnv<{ BUCKET?: R2Bucket }>();
  if (!bucket) {
    return Response.json(
      { error: "فضای ذخیره‌سازی رسانه در دسترس نیست." },
      { status: 503, headers: { "cache-control": "private, no-store" } },
    );
  }

  const exportedAt = new Date().toISOString();
  try {
    const archive = await createMediaBackupTar(bucket, { exportedAt });
    const stamp = exportedAt.slice(0, 10).replaceAll("-", "");
    return new Response(archive.body, {
      headers: {
        "content-type": "application/x-tar",
        "content-disposition": `attachment; filename="miran-shop-media-backup-${stamp}.tar"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "تهیهٔ پشتیبان کامل رسانه ممکن نشد." },
      { status: 503, headers: { "cache-control": "private, no-store" } },
    );
  }
}
