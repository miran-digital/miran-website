import { getAdminAccess, hasAdminPermission } from "@/lib/admin-auth";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import { hasValidUploadSignature } from "@/lib/upload-signature";
import { rejectRateLimited } from "@/lib/rate-limit";
import {
  deleteRollbackUploads,
  type ManagedUploadReceipt,
} from "@/lib/admin-media-cleanup";

const supportedImageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);
const supportedImageExtensions = new Map([
  ["jpg", "jpg"],
  ["jpeg", "jpg"],
  ["png", "png"],
  ["webp", "webp"],
  ["avif", "avif"],
]);
const supportedVideoTypes = new Map([
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
]);
const normalizedContentTypes = new Map([
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["avif", "image/avif"],
  ["mp4", "video/mp4"],
  ["webm", "video/webm"],
]);

export async function POST(request: Request) {
  const access = await getAdminAccess("state.read");
  if (!access.allowed) {
    return Response.json({ error: "دسترسی مدیریت مجاز نیست." }, { status: 403 });
  }
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const rateLimited = await rejectRateLimited(request, {
    scope: "admin.upload",
    identity: access.user.email,
    limit: 60,
    windowSeconds: 3_600,
  });
  if (rateLimited) return rateLimited;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 26_000_000) {
    return Response.json({ error: "حجم درخواست بیش از حد مجاز است." }, { status: 413 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const requestedKind = form?.get("kind");
  const kind =
    requestedKind === "branding"
      ? "branding"
      : requestedKind === "banner"
        ? "banners"
      : requestedKind === "category"
        ? "categories"
      : requestedKind === "product-video"
        ? "product-videos"
        : "products";
  const contentUpload = kind === "branding" || kind === "banners";
  if (
    !hasAdminPermission(
      access,
      contentUpload ? "content.write" : "catalog.write",
    )
  ) {
    return Response.json({ error: "این نقش اجازهٔ بارگذاری این فایل را ندارد." }, { status: 403 });
  }
  if (!(file instanceof File)) {
    return Response.json({ error: "فایل انتخاب نشده است." }, { status: 400 });
  }
  const videoUpload = kind === "product-videos";
  const declaredExtension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const heicSource = !videoUpload && (
    /heic|heif/i.test(file.type) ||
    declaredExtension === "heic" ||
    declaredExtension === "heif"
  );
  if (heicSource) {
    return Response.json(
      {
        error: "فایل HEIC/HEIF باید پیش از ارسال در مرورگر به WebP یا JPG تبدیل شود؛ در صورت پشتیبانی‌نشدن، نسخهٔ JPG یا PNG را انتخاب کنید.",
      },
      { status: 422 },
    );
  }
  const extension = videoUpload
    ? supportedVideoTypes.get(file.type)
    : supportedImageTypes.get(file.type) ?? supportedImageExtensions.get(declaredExtension);
  const maxSize = videoUpload
    ? 25_000_000
    : kind === "products"
      ? 20_000_000
      : kind === "banners"
        ? 5_000_000
        : 3_000_000;
  if (!extension || file.size <= 0 || file.size > maxSize) {
    return Response.json(
      {
        error: videoUpload
          ? "فقط ویدئوی MP4 یا WebM تا ۲۵ مگابایت مجاز است."
          : kind === "banners"
            ? "تصویر بنر معتبر نیست یا از سقف امنیتی ۵ مگابایت بیشتر است."
            : kind === "products"
              ? "تصویر معتبر نیست یا از سقف امنیتی ۲۰ مگابایت بیشتر است. فرمت‌های JPG، PNG، WebP و AVIF پشتیبانی می‌شوند."
              : "تصویر معتبر نیست یا از سقف امنیتی ۳ مگابایت بیشتر است.",
      },
      { status: 422 },
    );
  }
  if (!(await hasValidUploadSignature(file, extension))) {
    return Response.json(
      { error: "محتوای فایل با نوع انتخاب‌شده مطابقت ندارد." },
      { status: 422 },
    );
  }
  const { BUCKET: bucket } = await getRuntimeEnv<{ BUCKET?: R2Bucket }>();
  if (!bucket) {
    return Response.json(
      { error: "فضای ذخیره‌سازی تصویر در دسترس نیست." },
      { status: 503 },
    );
  }

  const key = `${kind}/${crypto.randomUUID()}.${extension}`;
  const cleanupToken = crypto.randomUUID();
  await bucket.put(key, file.stream(), {
    httpMetadata: {
      contentType: normalizedContentTypes.get(extension) ?? file.type,
    },
    customMetadata: { uploadedBy: access.user.email, cleanupToken },
  });
  return Response.json({ url: `/media/${key}`, cleanupToken }, { status: 201 });
}

export async function DELETE(request: Request) {
  const access = await getAdminAccess("state.read");
  if (!access.allowed) {
    return Response.json({ error: "دسترسی مدیریت مجاز نیست." }, { status: 403 });
  }
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 8_192) {
    return Response.json({ error: "درخواست بیش از حد مجاز است." }, { status: 413 });
  }
  const payload = await request.json().catch(() => null) as {
    uploads?: unknown;
  } | null;
  const uploads = Array.isArray(payload?.uploads)
    ? payload.uploads.filter((item): item is ManagedUploadReceipt => {
        if (typeof item !== "object" || item === null) return false;
        const candidate = item as Record<string, unknown>;
        return typeof candidate.url === "string" &&
          typeof candidate.cleanupToken === "string";
      }).slice(0, 10)
    : [];
  if (uploads.length === 0) {
    return Response.json({ error: "فایل موقتی برای پاک‌سازی مشخص نشده است." }, { status: 422 });
  }
  const { BUCKET: bucket } = await getRuntimeEnv<{ BUCKET?: R2Bucket }>();
  if (!bucket) {
    return Response.json(
      { error: "فضای ذخیره‌سازی برای پاک‌سازی در دسترس نیست." },
      { status: 503, headers: { "retry-after": "30" } },
    );
  }
  const deleted = await deleteRollbackUploads(uploads, access.user.email, bucket);
  return Response.json({ deleted }, { headers: { "cache-control": "no-store" } });
}
