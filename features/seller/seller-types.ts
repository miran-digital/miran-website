export type SellerApplicationStatus =
  | "new"
  | "documents_pending"
  | "guarantee_pending"
  | "reviewing"
  | "approved"
  | "rejected";

export type SellerDocumentStatus =
  | "missing"
  | "submitted"
  | "verified"
  | "needs_correction";

export type SellerGuaranteeStatus =
  | "not_requested"
  | "requested"
  | "submitted"
  | "verified"
  | "waived";

export type SellerAgreementStatus = "not_sent" | "sent" | "signed";

export type SellerGuaranteeType =
  | "review_later"
  | "bank_guarantee"
  | "refundable_deposit"
  | "guarantor";

export type SellerLegalType = "individual" | "company";

export type SellerDocument = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  downloadUrl: string;
};

export type SellerStoredDocument = Omit<SellerDocument, "downloadUrl"> & {
  storageKey: string;
};

export type SellerApplication = {
  id: string;
  createdAt: string;
  storeName: string;
  contactName: string;
  email: string;
  phone: string;
  category: string;
  legalType: SellerLegalType;
  registrationNumber: string;
  address: string;
  notes: string;
  guaranteeType: SellerGuaranteeType;
  guaranteeAmountMinor: number;
  documents: SellerDocument[];
  documentStatus: SellerDocumentStatus;
  guaranteeStatus: SellerGuaranteeStatus;
  agreementStatus: SellerAgreementStatus;
  adminNotes: string;
  status: SellerApplicationStatus;
};

export type SellerReviewUpdate = Pick<
  SellerApplication,
  | "status"
  | "documentStatus"
  | "guaranteeStatus"
  | "agreementStatus"
  | "guaranteeType"
  | "guaranteeAmountMinor"
  | "adminNotes"
>;

export type SellerProfileUpdate = Pick<
  SellerApplication,
  | "storeName"
  | "contactName"
  | "email"
  | "phone"
  | "category"
  | "legalType"
  | "registrationNumber"
  | "address"
  | "notes"
>;

export type SellerAdminUpdate = SellerProfileUpdate & SellerReviewUpdate;

export const sellerStatusLabels: Record<SellerApplicationStatus, string> = {
  new: "درخواست جدید",
  documents_pending: "در انتظار تکمیل مدارک",
  guarantee_pending: "در انتظار ضمانت",
  reviewing: "بررسی نهایی",
  approved: "تأییدشده",
  rejected: "ردشده",
};

export const sellerDocumentStatusLabels: Record<SellerDocumentStatus, string> = {
  missing: "مدارک ناقص",
  submitted: "مدارک دریافت شد",
  verified: "مدارک تأیید شد",
  needs_correction: "نیازمند اصلاح مدارک",
};

export const sellerGuaranteeStatusLabels: Record<SellerGuaranteeStatus, string> = {
  not_requested: "هنوز درخواست نشده",
  requested: "درخواست ضمانت ارسال شد",
  submitted: "ضمانت دریافت شد",
  verified: "ضمانت تأیید شد",
  waived: "با تصمیم مدیر معاف شد",
};

export const sellerAgreementStatusLabels: Record<SellerAgreementStatus, string> = {
  not_sent: "قرارداد ارسال نشده",
  sent: "قرارداد ارسال شد",
  signed: "قرارداد امضا شد",
};

export const sellerGuaranteeTypeLabels: Record<SellerGuaranteeType, string> = {
  review_later: "تعیین پس از بررسی",
  bank_guarantee: "ضمانت بانکی",
  refundable_deposit: "ودیعه قابل استرداد",
  guarantor: "ضامن معتبر",
};

export const sellerLegalTypeLabels: Record<SellerLegalType, string> = {
  individual: "شخص حقیقی",
  company: "شرکت / شخص حقوقی",
};

export function canApproveSeller(
  review: SellerReviewUpdate | SellerApplication,
) {
  const hasDocuments =
    "documents" in review ? review.documents.length > 0 : true;
  return (
    hasDocuments &&
    review.documentStatus === "verified" &&
    (review.guaranteeStatus === "verified" ||
      review.guaranteeStatus === "waived") &&
    review.agreementStatus === "signed"
  );
}
