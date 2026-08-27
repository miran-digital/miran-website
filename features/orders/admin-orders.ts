import type {
  BankTransferReceipt,
  BankTransferReceiptStatus,
  OrderStatus,
  StoreOrder,
} from "./order-types";

export async function getAdminOrders() {
  const response = await fetch("/api/admin/orders", { cache: "no-store" });
  const payload = (await response.json()) as {
    orders?: StoreOrder[];
    error?: string;
  };
  if (!response.ok || !payload.orders) {
    throw new Error(payload.error || "خواندن سفارش‌ها ممکن نشد.");
  }
  return payload.orders;
}

export async function updateAdminOrderStatus(id: string, status: OrderStatus) {
  const response = await fetch("/api/admin/orders", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, status }),
  });
  const payload = (await response.json()) as {
    order?: StoreOrder;
    error?: string;
  };
  if (!response.ok || !payload.order) {
    throw new Error(payload.error || "به‌روزرسانی سفارش ممکن نشد.");
  }
  return payload.order;
}

export async function removeAdminOrder(id: string) {
  const response = await fetch("/api/admin/orders", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const payload = await response.json() as { deleted?: boolean; error?: string };
  if (!response.ok || payload.deleted !== true) {
    throw new Error(payload.error || "حذف سفارش ممکن نشد.");
  }
}

export async function getAdminBankTransferReceipts() {
  const response = await fetch("/api/admin/bank-transfer-receipts", {
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    receipts?: BankTransferReceipt[];
    error?: string;
  };
  if (!response.ok || !payload.receipts) {
    throw new Error(payload.error || "خواندن فیش‌ها ممکن نشد.");
  }
  return payload.receipts;
}

export async function reviewAdminBankTransferReceipt(
  id: string,
  status: Exclude<BankTransferReceiptStatus, "pending">,
  reviewNote: string,
) {
  const response = await fetch("/api/admin/bank-transfer-receipts", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, status, reviewNote }),
  });
  const payload = (await response.json()) as {
    receipt?: BankTransferReceipt;
    error?: string;
  };
  if (!response.ok || !payload.receipt) {
    throw new Error(payload.error || "بررسی فیش ممکن نشد.");
  }
  return payload.receipt;
}
