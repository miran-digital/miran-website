import type { AdminCustomerSummary } from "@/db/customer-account-repository";
import type { DeliveryMethod, OrderItem, OrderStatus, PaymentStatus } from "@/features/orders/order-types";

export type CustomerSort = "newest" | "oldest" | "name" | "orders" | "activity";
export type CustomerDirectoryOptions = { query: string; sort: CustomerSort; page: number; pageSize: 25 | 50 };
export type CustomerDirectoryEntry = AdminCustomerSummary & { customerId: string };
export type CustomerDirectoryPage = {
  customers: CustomerDirectoryEntry[];
  total: number;
  page: number;
  pageSize: 25 | 50;
  totalPages: number;
};
export type CustomerDirectoryPayload = CustomerDirectoryPage & { warning?: string; supabaseAdminReady: boolean };
export type CustomerProfileOrder = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  deliveryMethod: DeliveryMethod;
  deliveryAddress: string;
  currency: string;
  totalMinor: number;
  items: OrderItem[];
  payments: { provider: string; reference: string; status: string; createdAt: string }[];
};
export type CustomerProfile = {
  customer: CustomerDirectoryEntry;
  addresses: {
    id: string; label: string; recipientName: string; phone: string;
    addressLine: string; city: string; province: string; postcode: string; isDefault: boolean;
  }[];
  phoneNumbers: string[];
  paidTotalRial: number;
  legacyPaidOrderCount: number;
  orders: CustomerProfileOrder[];
  ordersPage: number;
  ordersPages: number;
  activityPage: number;
  activityPages: number;
  tickets: { id: string; number: string; subject: string; status: string; createdAt: string; updatedAt: string }[];
  reviews: { id: string; productTitle: string; title: string; body: string; rating: number; status: string; createdAt: string }[];
};
