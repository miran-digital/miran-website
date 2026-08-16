"use client";

import { useCallback, useEffect, useState } from "react";

type OrderSummary = {
  id: string;
  status: string;
  subtotalIrr: number;
  discountIrr: number;
  shippingIrr: number;
  totalIrr: number;
  shippingMethodCode: string | null;
  shippingMethodName: string | null;
  createdAt: string;
  updatedAt: string;
};

type OrderDetail = OrderSummary & {
  address: {
    label: string;
    fullName: string;
    phone: string;
    province: string;
    city: string;
    addressLine: string;
    postalCode: string;
  } | null;
  items: Array<{
    id: string;
    productId: string;
    title: string;
    unitBasePriceIrr: number;
    unitFinalPriceIrr: number;
    quantity: number;
    lineTotalIrr: number;
  }>;
  payments: Array<{
    id: string;
    provider: string;
    amountIrr: number;
    status: string;
    referenceId: string | null;
  }>;
};

function toman(irr: number) {
  return `${Math.round(irr / 10).toLocaleString("fa-IR")} تومان`;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING_PAYMENT: "در انتظار پرداخت",
    PAID: "پرداخت‌شده",
    CANCELLED: "لغوشده",
    PAYMENT_FAILED: "پرداخت ناموفق/منقضی",
  };
  return labels[status] ?? status;
}

export function OrderHistory() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/orders", { cache: "no-store" });
      const data = (await response.json()) as { orders?: OrderSummary[]; message?: string };
      if (!response.ok || !data.orders) {
        setMessage(data.message ?? "دریافت سفارش‌ها انجام نشد.");
        return;
      }
      setOrders(data.orders);
    } catch {
      setMessage("ارتباط با سرویس سفارش‌ها برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openOrder(id: string) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as { order?: OrderDetail; message?: string };
      if (!response.ok || !data.order) {
        setMessage(data.message ?? "دریافت جزئیات سفارش انجام نشد.");
        return;
      }
      setDetail(data.order);
    } catch {
      setMessage("دریافت جزئیات سفارش انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="order-history-title">
      <h2 id="order-history-title">سفارش‌های من</h2>
      {loading && orders.length === 0 ? <p role="status">در حال دریافت سفارش‌ها…</p> : null}
      {!loading && orders.length === 0 ? <p>هنوز سفارشی ثبت نشده است.</p> : null}
      {orders.map((order) => (
        <article key={order.id}>
          <strong>سفارش <bdi dir="ltr">{order.id}</bdi></strong>
          <p>{statusLabel(order.status)} — {toman(order.totalIrr)}</p>
          {order.shippingMethodName ? <p>ارسال: {order.shippingMethodName} — {toman(order.shippingIrr)}</p> : null}
          <p>{new Date(order.createdAt).toLocaleString("fa-IR")}</p>
          <button type="button" disabled={loading} onClick={() => void openOrder(order.id)}>
            مشاهده جزئیات
          </button>
        </article>
      ))}

      {detail ? (
        <section aria-labelledby="order-detail-title">
          <h3 id="order-detail-title">جزئیات سفارش</h3>
          <p>شماره: <bdi dir="ltr">{detail.id}</bdi></p>
          <p>وضعیت: {statusLabel(detail.status)}</p>
          <p>جمع کالاها: {toman(detail.subtotalIrr)}</p>
          {detail.discountIrr > 0 ? <p>تخفیف: {toman(detail.discountIrr)}</p> : null}
          <p>هزینه ارسال: {toman(detail.shippingIrr)}</p>
          {detail.shippingMethodName ? <p>روش ارسال: {detail.shippingMethodName}</p> : null}
          <p>مبلغ نهایی: {toman(detail.totalIrr)}</p>
          <h4>اقلام</h4>
          <ul>
            {detail.items.map((item) => (
              <li key={item.id}>
                {item.title} × {item.quantity.toLocaleString("fa-IR")} — {toman(item.lineTotalIrr)}
              </li>
            ))}
          </ul>
          {detail.address ? (
            <>
              <h4>نشانی تحویل</h4>
              <p>
                {detail.address.fullName} — {detail.address.province}، {detail.address.city}، {detail.address.addressLine} — <bdi dir="ltr">{detail.address.postalCode}</bdi>
              </p>
            </>
          ) : null}
          {detail.payments.length > 0 ? (
            <>
              <h4>پرداخت‌ها</h4>
              <ul>
                {detail.payments.map((payment) => (
                  <li key={payment.id}>
                    {payment.provider} — {payment.status} — {toman(payment.amountIrr)}
                    {payment.referenceId ? <> — رهگیری <bdi dir="ltr">{payment.referenceId}</bdi></> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <button type="button" onClick={() => setDetail(null)}>بستن جزئیات</button>
        </section>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
