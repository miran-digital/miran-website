import { getCustomerUser } from "@/lib/customer-auth";
import { readStorefrontState } from "@/db/admin-repository";
import { createBankTransferReceipt } from "@/db/bank-transfer-repository";
import { getOrderByNumberForPayment } from "@/db/order-repository";
import { isBankTransferConfigured } from "@/lib/bank-transfer";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { hasValidUploadSignature } from "@/lib/upload-signature";
import { rejectRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const receiptTypes = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const MAX_FILE_BYTES = 5_000_000;
const MAX_REQUEST_BYTES = 5_600_000;

export async function POST(request: Request) {
  const user = await getCustomerUser();
  if (!user) return privateJson({ error: "برای ارسال فیش وارد حساب شوید." }, 401);
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const rateLimited = await rejectRateLimited(request, {
    scope: "bank-transfer.receipt",
    identity: user.email,
    limit: 10,
    windowSeconds: 86_400,
  });
  if (rateLimited) return rateLimited;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return privateJson({ error: "حجم درخواست بیش از حد مجاز است." }, 413);
  }

  const form = await request.formData().catch(() => null);
  if (!form) return privateJson({ error: "درخواست معتبر نیست." }, 400);
  const orderNumber = shortText(form.get("orderNumber"), 80);
  const transferReference = shortText(form.get("transferReference"), 100);
  const customerNote = shortText(form.get("customerNote"), 500);
  const file = form.get("receipt");
  if (!/^MS-[A-Z0-9-]{6,70}$/i.test(orderNumber) || !(file instanceof File)) {
    return privateJson({ error: "شماره سفارش یا فایل فیش معتبر نیست." }, 422);
  }
  const extension = receiptTypes.get(file.type);
  if (!extension || file.size <= 0 || file.size > MAX_FILE_BYTES) {
    return privateJson(
      { error: "فقط فایل PDF، JPG، PNG یا WebP تا ۵ مگابایت مجاز است." },
      422,
    );
  }
  if (!(await hasValidUploadSignature(file, extension))) {
    return privateJson(
      { error: "محتوای فایل با نوع اعلام‌شده مطابقت ندارد." },
      422,
    );
  }

  try {
    const [order, state, runtime] = await Promise.all([
      getOrderByNumberForPayment(orderNumber, user.email),
      readStorefrontState(),
      getRuntimeEnv<{ BUCKET?: R2Bucket }>(),
    ]);
    if (!order) return privateJson({ error: "سفارش پیدا نشد." }, 404);
    if (!isBankTransferConfigured(state.commerce.bankTransfer)) {
      return privateJson({ error: "کارت‌به‌کارت هنوز توسط مالک فعال نشده است." }, 409);
    }
    if (
      order.status !== "new" ||
      order.paymentStatus === "paid" ||
      order.currency !== "IRR" ||
      !order.reservationExpiresAt ||
      Date.parse(order.reservationExpiresAt) <= Date.now()
    ) {
      return privateJson({ error: "مهلت پرداخت این سفارش پایان یافته یا قبلاً پرداخت شده است." }, 409);
    }
    const bucket = runtime.BUCKET;
    if (!bucket) return privateJson({ error: "فضای امن فیش‌ها در دسترس نیست." }, 503);
    const storageKey = `payment-receipts/${crypto.randomUUID()}.${extension}`;
    await bucket.put(storageKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { source: "bank-transfer-receipt" },
    });
    try {
      const receipt = await createBankTransferReceipt({
        orderId: order.id,
        customerEmail: user.email,
        storageKey,
        originalName: cleanFileName(file.name),
        contentType: file.type,
        size: file.size,
        transferReference,
        customerNote,
        reviewHours: state.commerce.bankTransfer.reviewHours,
      });
      return privateJson({ receipt }, 201);
    } catch (error) {
      await bucket.delete(storageKey).catch(() => undefined);
      const code = error instanceof Error ? error.message : "";
      if (code === "RECEIPT_PENDING") {
        return privateJson({ error: "برای این سفارش یک فیش در انتظار بررسی است." }, 409);
      }
      if (code === "ORDER_NOT_PAYABLE") {
        return privateJson({ error: "این سفارش اکنون قابل پرداخت نیست." }, 409);
      }
      throw error;
    }
  } catch {
    return privateJson({ error: "ارسال فیش موقتاً ممکن نیست." }, 503);
  }
}

function shortText(value: FormDataEntryValue | null, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanFileName(value: string) {
  return value.replace(/[\\/\0\r\n]/g, "-").trim().slice(0, 140) || "receipt";
}

function privateJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}
