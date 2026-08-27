export type SupportTicketCategory = "order" | "payment" | "product" | "account" | "other";

export type SupportTicketStatus =
  | "open"
  | "in_progress"
  | "waiting_customer"
  | "resolved"
  | "closed";

export type SupportMessage = {
  id: string;
  authorRole: "customer" | "admin";
  body: string;
  createdAt: string;
};

export type SupportTicket = {
  id: string;
  ticketNumber: string;
  customerEmail: string;
  customerName: string;
  orderId: string;
  orderNumber: string;
  subject: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  messages: SupportMessage[];
};

export type CustomerNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string;
  readAt: string;
  createdAt: string;
};

export const supportCategoryLabels: Record<SupportTicketCategory, string> = {
  order: "سفارش",
  payment: "پرداخت",
  product: "محصول",
  account: "حساب کاربری",
  other: "سایر موارد",
};

export const supportStatusLabels: Record<SupportTicketStatus, string> = {
  open: "جدید",
  in_progress: "در حال بررسی",
  waiting_customer: "منتظر پاسخ شما",
  resolved: "حل‌شده",
  closed: "بسته‌شده",
};
