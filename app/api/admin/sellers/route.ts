import {
  deleteSellerApplicationRecord,
  getSellerDocumentStorageKeys,
  listSellerApplications,
  updateSellerApplicationRecord,
} from "@/db/admin-repository";
import {
  canApproveSeller,
  type SellerAgreementStatus,
  type SellerApplicationStatus,
  type SellerDocumentStatus,
  type SellerGuaranteeStatus,
  type SellerGuaranteeType,
  type SellerAdminUpdate,
  type SellerLegalType,
} from "@/features/seller/seller-types";
import { getAdminAccess } from "@/lib/admin-auth";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

const statuses = new Set<SellerApplicationStatus>([
  "new",
  "documents_pending",
  "guarantee_pending",
  "reviewing",
  "approved",
  "rejected",
]);
const documentStatuses = new Set<SellerDocumentStatus>([
  "missing",
  "submitted",
  "verified",
  "needs_correction",
]);
const guaranteeStatuses = new Set<SellerGuaranteeStatus>([
  "not_requested",
  "requested",
  "submitted",
  "verified",
  "waived",
]);
const agreementStatuses = new Set<SellerAgreementStatus>([
  "not_sent",
  "sent",
  "signed",
]);
const guaranteeTypes = new Set<SellerGuaranteeType>([
  "review_later",
  "bank_guarantee",
  "refundable_deposit",
  "guarantor",
]);
const legalTypes = new Set<SellerLegalType>(["individual", "company"]);

export async function GET() {
  const access = await getAdminAccess("sellers.write");
  if (!access.allowed) return denied(access.reason);
  try {
    return Response.json(
      { applications: await listSellerApplications() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "خواندن درخواست‌ها ممکن نشد." },
      { status: 503 },
    );
  }
}

export async function PATCH(request: Request) {
  const access = await getAdminAccess("sellers.write");
  if (!access.allowed) return denied(access.reason);
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const payload = (await request.json().catch(() => null)) as {
    id?: unknown;
    status?: unknown;
    documentStatus?: unknown;
    guaranteeStatus?: unknown;
    agreementStatus?: unknown;
    guaranteeType?: unknown;
    guaranteeAmountMinor?: unknown;
    adminNotes?: unknown;
    storeName?: unknown;
    contactName?: unknown;
    email?: unknown;
    phone?: unknown;
    category?: unknown;
    legalType?: unknown;
    registrationNumber?: unknown;
    address?: unknown;
    notes?: unknown;
  } | null;
  const id = typeof payload?.id === "string" ? payload.id.slice(0, 120) : "";
  const review: SellerAdminUpdate = {
    storeName: text(payload?.storeName, 120),
    contactName: text(payload?.contactName, 120),
    email: text(payload?.email, 200).toLowerCase(),
    phone: text(payload?.phone, 40),
    category: text(payload?.category, 100),
    legalType: payload?.legalType as SellerLegalType,
    registrationNumber: text(payload?.registrationNumber, 120),
    address: text(payload?.address, 500),
    notes: text(payload?.notes, 1000),
    status: payload?.status as SellerApplicationStatus,
    documentStatus: payload?.documentStatus as SellerDocumentStatus,
    guaranteeStatus: payload?.guaranteeStatus as SellerGuaranteeStatus,
    agreementStatus: payload?.agreementStatus as SellerAgreementStatus,
    guaranteeType: payload?.guaranteeType as SellerGuaranteeType,
    guaranteeAmountMinor:
      typeof payload?.guaranteeAmountMinor === "number"
        ? payload.guaranteeAmountMinor
        : -1,
    adminNotes:
      typeof payload?.adminNotes === "string"
        ? payload.adminNotes.slice(0, 2000)
        : "",
  };
  if (
    !id ||
    !review.storeName ||
    !review.contactName ||
    !/^\S+@\S+\.\S+$/.test(review.email) ||
    !review.phone ||
    !/^[a-z0-9-]{1,100}$/.test(review.category) ||
    !legalTypes.has(review.legalType) ||
    !review.address ||
    (review.legalType === "company" && !review.registrationNumber) ||
    !statuses.has(review.status) ||
    !documentStatuses.has(review.documentStatus) ||
    !guaranteeStatuses.has(review.guaranteeStatus) ||
    !agreementStatuses.has(review.agreementStatus) ||
    !guaranteeTypes.has(review.guaranteeType) ||
    !Number.isSafeInteger(review.guaranteeAmountMinor) ||
    review.guaranteeAmountMinor < 0 ||
    review.guaranteeAmountMinor > 100_000_000_00
  ) {
    return Response.json({ error: "درخواست نامعتبر است." }, { status: 422 });
  }
  try {
    if (review.status === "approved") {
      const application = (await listSellerApplications()).find(
        (item) => item.id === id,
      );
      if (!application) {
        return Response.json(
          { error: "پروندهٔ فروشنده پیدا نشد." },
          { status: 404 },
        );
      }
      if (!canApproveSeller({ ...application, ...review })) {
        return Response.json(
          { error: "تأیید نهایی فقط پس از دریافت و تأیید مدارک، ضمانت و امضای قرارداد ممکن است." },
          { status: 422 },
        );
      }
    }
    await updateSellerApplicationRecord(id, review, access.user.email);
    return Response.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return Response.json(
      { error: code === "SELLER_NOT_FOUND" ? "فروشنده پیدا نشد." : "به‌روزرسانی وضعیت ممکن نشد." },
      { status: code === "SELLER_NOT_FOUND" ? 404 : 503 },
    );
  }
}

export async function DELETE(request: Request) {
  const access = await getAdminAccess("sellers.delete");
  if (!access.allowed) return denied(access.reason);
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 2_048) {
    return Response.json({ error: "درخواست بیش از حد مجاز است." }, { status: 413 });
  }
  const payload = await request.json().catch(() => null) as { id?: unknown } | null;
  const id = text(payload?.id, 120);
  if (!id) return Response.json({ error: "فروشنده انتخاب نشده است." }, { status: 422 });
  try {
    const storageKeys = await getSellerDocumentStorageKeys(id);
    if (storageKeys.length > 0) {
      const { BUCKET: bucket } = await getRuntimeEnv<{ BUCKET?: R2Bucket }>();
      if (!bucket) return Response.json({ error: "فضای مدارک خصوصی در دسترس نیست؛ حذف انجام نشد." }, { status: 503 });
      await Promise.all(storageKeys.map((key) => bucket.delete(key)));
    }
    return Response.json(await deleteSellerApplicationRecord(id, access.user.email), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return Response.json(
      { error: code === "SELLER_NOT_FOUND" ? "فروشنده پیدا نشد." : "حذف فروشنده ممکن نشد." },
      { status: code === "SELLER_NOT_FOUND" ? 404 : 503 },
    );
  }
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function denied(reason: "anonymous" | "forbidden" | "misconfigured") {
  return Response.json(
    { error: "دسترسی مدیریت مجاز نیست." },
    { status: reason === "anonymous" ? 401 : 403 },
  );
}
