import { getCustomerUser } from "@/lib/customer-auth";
import { submitProductReview } from "@/db/review-repository";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import {
  isInvalidJson,
  isJsonTooLarge,
  objectNumber,
  objectText,
  privateJson,
  readBoundedJson,
} from "@/lib/request-json";
import { rejectRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCustomerUser();
  if (!user) return privateJson({ error: "برای ثبت دیدگاه وارد حساب شوید." }, 401);
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const rateLimited = await rejectRateLimited(request, {
    scope: "review.create",
    identity: user.email,
    limit: 10,
    windowSeconds: 86_400,
  });
  if (rateLimited) return rateLimited;
  const payload = await readBoundedJson(request);
  if (isJsonTooLarge(payload)) return privateJson({ error: "حجم درخواست بیش از حد مجاز است." }, 413);
  if (isInvalidJson(payload)) return privateJson({ error: "درخواست معتبر نیست." }, 400);

  const productId = objectText(payload, "productId", 120);
  const rating = objectNumber(payload, "rating");
  const title = objectText(payload, "title", 120);
  const body = objectText(payload, "body", 1_500);
  if (!productId || !Number.isInteger(rating) || rating < 1 || rating > 5 || body.length < 10) {
    return privateJson({ error: "امتیاز و متن دیدگاه معتبر نیست." }, 422);
  }
  try {
    const review = await submitProductReview({
      productId,
      customerEmail: user.email,
      customerName: safeCustomerName(user.fullName),
      rating,
      title,
      body,
    });
    return privateJson({ review }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "REVIEW_NOT_ELIGIBLE") return privateJson({ error: "ثبت دیدگاه فقط برای خریدار محصول پس از تحویل سفارش فعال است." }, 403);
    if (message === "REVIEW_EXISTS") return privateJson({ error: "برای این محصول قبلاً دیدگاه ثبت کرده‌اید." }, 409);
    if (message === "REVIEW_INVALID") return privateJson({ error: "امتیاز و متن دیدگاه معتبر نیست." }, 422);
    return privateJson({ error: "ثبت دیدگاه موقتاً ممکن نیست." }, 503);
  }
}

function safeCustomerName(fullName: string | null) {
  const value = fullName?.trim().slice(0, 120) ?? "";
  return value && !value.includes("@") ? value : "خریدار میران";
}
