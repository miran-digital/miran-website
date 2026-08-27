import type {
  SellerApplication,
  SellerAdminUpdate,
} from "./seller-types";

export type { SellerAdminUpdate, SellerApplication, SellerReviewUpdate } from "./seller-types";

export async function createSellerApplication(input: FormData) {
  const response = await fetch("/api/sellers", {
    method: "POST",
    body: input,
  });
  const payload = (await response.json()) as {
    application?: Pick<SellerApplication, "id" | "status" | "storeName">;
    error?: string;
  };
  if (!response.ok || !payload.application) {
    throw new Error(payload.error || "ثبت درخواست ممکن نشد.");
  }
  return payload.application;
}

export async function getSellerApplications() {
  const response = await fetch("/api/admin/sellers", {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const payload = (await response.json()) as {
    applications?: SellerApplication[];
    error?: string;
  };
  if (!response.ok || !payload.applications) {
    throw new Error(payload.error || "دریافت درخواست‌ها ممکن نشد.");
  }
  return payload.applications;
}

export async function updateSellerApplicationStatus(
  id: string,
  review: SellerAdminUpdate,
) {
  const response = await fetch("/api/admin/sellers", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, ...review }),
  });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "به‌روزرسانی وضعیت ممکن نشد.");
  }
}

export async function removeSellerApplication(id: string) {
  const response = await fetch("/api/admin/sellers", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const payload = await response.json() as { deleted?: boolean; error?: string };
  if (!response.ok || payload.deleted !== true) {
    throw new Error(payload.error || "حذف فروشنده ممکن نشد.");
  }
}
