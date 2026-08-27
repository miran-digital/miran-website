import { createSellerApplicationRecord } from "@/db/admin-repository";
import type {
  SellerGuaranteeType,
  SellerLegalType,
  SellerStoredDocument,
} from "@/features/seller/seller-types";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { hasValidUploadSignature } from "@/lib/upload-signature";
import { rejectRateLimited } from "@/lib/rate-limit";

const legalTypes = new Set<SellerLegalType>(["individual", "company"]);
const guaranteeTypes = new Set<SellerGuaranteeType>([
  "review_later",
  "bank_guarantee",
  "refundable_deposit",
  "guarantor",
]);
const documentTypes = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const MAX_REQUEST_BYTES = 16_500_000;

export async function POST(request: Request) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const rateLimited = await rejectRateLimited(request, {
    scope: "seller.apply",
    limit: 3,
    windowSeconds: 86_400,
  });
  if (rateLimited) return rateLimited;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return Response.json(
      { error: "حجم کل درخواست مدارک بیشتر از حد مجاز است." },
      { status: 413 },
    );
  }
  const form = await request.formData().catch(() => null);
  if (!form) {
    return Response.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  const storeName = shortText(form.get("storeName"), 120);
  const contactName = shortText(form.get("contactName"), 120);
  const email = shortText(form.get("email"), 200).toLowerCase();
  const phone = shortText(form.get("phone"), 40);
  const category = shortText(form.get("category"), 100);
  const legalType = shortText(form.get("legalType"), 30) as SellerLegalType;
  const registrationNumber = shortText(form.get("registrationNumber"), 120);
  const address = shortText(form.get("address"), 500);
  const notes = shortText(form.get("notes"), 1000);
  const guaranteeType = shortText(
    form.get("guaranteeType"),
    40,
  ) as SellerGuaranteeType;
  const website = shortText(form.get("website"), 200);
  const files = form
    .getAll("documents")
    .filter((item): item is File => item instanceof File && item.size > 0);

  if (website) return Response.json({ accepted: true }, { status: 202 });
  if (
    !storeName ||
    !contactName ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    !phone ||
    !/^[a-z0-9-]{1,100}$/.test(category) ||
    !legalTypes.has(legalType) ||
    !guaranteeTypes.has(guaranteeType) ||
    !address ||
    (legalType === "company" && !registrationNumber)
  ) {
    return Response.json(
      { error: "اطلاعات ضروری کامل یا معتبر نیست." },
      { status: 422 },
    );
  }
  if (
    files.length > 4 ||
    files.some(
      (file) => !documentTypes.has(file.type) || file.size > 5_000_000,
    ) ||
    files.reduce((total, file) => total + file.size, 0) > 15_000_000
  ) {
    return Response.json(
      { error: "حداکثر ۴ فایل PDF، JPG، PNG یا WebP؛ هر فایل تا ۵ مگابایت و مجموعاً تا ۱۵ مگابایت مجاز است." },
      { status: 422 },
    );
  }
  for (const file of files) {
    const extension = documentTypes.get(file.type);
    if (!extension || !(await hasValidUploadSignature(file, extension))) {
      return Response.json(
        { error: "محتوای یکی از مدارک با نوع فایل اعلام‌شده مطابقت ندارد." },
        { status: 422 },
      );
    }
  }

  let bucket: R2Bucket | undefined;
  const storedKeys: string[] = [];
  try {
    ({ BUCKET: bucket } = await getRuntimeEnv<{ BUCKET?: R2Bucket }>());
    if (!bucket) throw new Error("missing bucket");
    const documents: SellerStoredDocument[] = [];
    for (const file of files) {
      const extension = documentTypes.get(file.type);
      if (!extension) continue;
      const id = crypto.randomUUID();
      const storageKey = `seller-documents/${id}.${extension}`;
      await bucket.put(storageKey, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { source: "seller-application" },
      });
      storedKeys.push(storageKey);
      documents.push({
        id,
        name: cleanFileName(file.name),
        contentType: file.type,
        size: file.size,
        storageKey,
      });
    }

    const application = await createSellerApplicationRecord({
      storeName,
      contactName,
      email,
      phone,
      category,
      legalType,
      registrationNumber,
      address,
      notes,
      guaranteeType,
      documents,
    });
    return Response.json(
      {
        application: {
          id: application.id,
          status: application.status,
          storeName: application.storeName,
        },
      },
      { status: 201 },
    );
  } catch {
    if (bucket && storedKeys.length > 0) {
      await Promise.allSettled(storedKeys.map((key) => bucket!.delete(key)));
    }
    return Response.json(
      { error: "ثبت درخواست موقتاً ممکن نیست." },
      { status: 503 },
    );
  }
}

function shortText(value: FormDataEntryValue | null, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanFileName(value: string) {
  return value.replace(/[\\/\0\r\n]/g, "-").trim().slice(0, 140) || "document";
}
