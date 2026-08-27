import {
  deleteProductReview,
  listAdminProductReviews,
  moderateProductReview,
} from "@/db/review-repository";
import { getAdminAccess } from "@/lib/admin-auth";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import {
  isInvalidJson,
  isJsonTooLarge,
  isUuid,
  objectText,
  privateJson,
  readBoundedJson,
} from "@/lib/request-json";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAdminAccess("reviews.write");
  if (!access.allowed) return denied(access.reason);
  try {
    return privateJson({ reviews: await listAdminProductReviews() });
  } catch {
    return privateJson({ error: "خواندن دیدگاه‌ها ممکن نشد." }, 503);
  }
}

export async function PATCH(request: Request) {
  const access = await getAdminAccess("reviews.write");
  if (!access.allowed) return denied(access.reason);
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const payload = await readBoundedJson(request, 8_192);
  if (isJsonTooLarge(payload)) return privateJson({ error: "حجم درخواست بیش از حد مجاز است." }, 413);
  if (isInvalidJson(payload)) return privateJson({ error: "درخواست معتبر نیست." }, 400);
  const id = objectText(payload, "id", 120);
  const status = objectText(payload, "status", 20);
  const moderationNote = objectText(payload, "moderationNote", 500);
  if (!isUuid(id) || (status !== "approved" && status !== "rejected")) {
    return privateJson({ error: "درخواست نامعتبر است." }, 422);
  }
  try {
    return privateJson({ review: await moderateProductReview({
      reviewId: id,
      status,
      moderationNote,
      actorEmail: access.user.email,
    }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "REVIEW_NOT_FOUND") return privateJson({ error: "دیدگاه پیدا نشد." }, 404);
    if (message === "REVIEW_ALREADY_MODERATED") return privateJson({ error: "این دیدگاه قبلاً بررسی شده است." }, 409);
    return privateJson({ error: "بررسی دیدگاه ممکن نشد." }, 503);
  }
}

export async function DELETE(request: Request) {
  const access = await getAdminAccess("reviews.delete");
  if (!access.allowed) return denied(access.reason);
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const payload = await readBoundedJson(request, 2_048);
  if (isJsonTooLarge(payload)) return privateJson({ error: "حجم درخواست بیش از حد مجاز است." }, 413);
  if (isInvalidJson(payload)) return privateJson({ error: "درخواست معتبر نیست." }, 400);
  const id = objectText(payload, "id", 120);
  if (!isUuid(id)) return privateJson({ error: "دیدگاه معتبر نیست." }, 422);
  try {
    return privateJson(await deleteProductReview(id, access.user.email));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return privateJson(
      { error: code === "REVIEW_NOT_FOUND" ? "دیدگاه پیدا نشد." : "حذف دیدگاه ممکن نشد." },
      code === "REVIEW_NOT_FOUND" ? 404 : 503,
    );
  }
}

function denied(reason: "anonymous" | "forbidden" | "misconfigured") {
  return privateJson({ error: "دسترسی مدیریت مجاز نیست." }, reason === "anonymous" ? 401 : 403);
}
