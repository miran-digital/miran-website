export type OrderStatus =
  | "new"
  | "confirmed"
  | "packing"
  | "shipped"
  | "cancelled"
  | "expired";

export type PaymentStatus =
  | "not_collected"
  | "pending"
  | "paid"
  | "failed"
  | "refunded";

export type DeliveryMethod = "standard" | "priority";

export type BankTransferReceiptStatus = "pending" | "approved" | "rejected";

export type BankTransferReceipt = {
  id: string;
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  originalName: string;
  contentType: string;
  size: number;
  transferReference: string;
  customerNote: string;
  status: BankTransferReceiptStatus;
  reviewedBy: string;
  reviewedAt: string;
  reviewNote: string;
  createdAt: string;
  updatedAt: string;
  totalMinor: number;
  currency: string;
};

export type OrderItem = {
  id: string;
  productId: string;
  variantId: string;
  sellerOfferId: string;
  selectionLabel: string;
  slug: string;
  sku: string;
  title: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
};

export type StoreOrder = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  addressSourceId: string;
  addressLabel: string;
  addressLine: string;
  city: string;
  province: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  deliveryMethod: DeliveryMethod;
  currency: string;
  subtotalMinor: number;
  deliveryMinor: number;
  totalMinor: number;
  createdAt: string;
  updatedAt: string;
  reservationExpiresAt: string;
  items: OrderItem[];
};

export const orderStatusLabels: Record<OrderStatus, string> = {
  new: "جدید",
  confirmed: "تأییدشده",
  packing: "در حال آماده‌سازی",
  shipped: "ارسال‌شده",
  cancelled: "لغوشده",
  expired: "منقضی‌شده",
};

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  not_collected: "دریافت نشده",
  pending: "در انتظار پرداخت",
  paid: "پرداخت‌شده",
  failed: "ناموفق",
  refunded: "بازپرداخت‌شده",
};

export const deliveryLabels: Record<DeliveryMethod, string> = {
  standard: "ارسال استاندارد",
  priority: "ارسال سریع",
};
