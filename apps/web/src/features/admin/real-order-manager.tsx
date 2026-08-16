"use client";

import { useCallback, useEffect, useState } from "react";
import { Container } from "@miran/ui";
import styles from "./real-product-manager.module.css";

type ManagedOrder = {
  id: string;
  userId: string;
  email: string;
  status: string;
  subtotalIrr: number;
  discountIrr: number;
  totalIrr: number;
  createdAt: string;
  updatedAt: string;
};

function toman(irr: number) {
  return `${Math.round(irr / 10).toLocaleString("fa-IR")} تومان`;
}

const statusOptions = [
  ["", "همه وضعیت‌ها"],
  ["PENDING_PAYMENT", "در انتظار پرداخت"],
  ["PAID", "پرداخت‌شده"],
  ["PAYMENT_FAILED", "پرداخت ناموفق/منقضی"],
  ["CANCELLED", "لغوشده"],
] as const;

export function RealOrderManager() {
  const [orders, setOrders] = useState<ManagedOrder[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async (nextStatus = status) => {
    setLoading(true);
    setMessage("");
    try {
      const suffix = nextStatus ? `?status=${encodeURIComponent(nextStatus)}` : "";
      const response = await fetch(`/api/admin/orders${suffix}`, { cache: "no-store" });
      const data = (await response.json()) as { orders?: ManagedOrder[]; message?: string };
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
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={styles.section} aria-labelledby="real-orders-title">
      <Container size="wide">
        <div className={styles.panel}>
          <div className={styles.heading}>
            <p>Database-backed Orders</p>
            <h2 id="real-orders-title">سفارش‌های واقعی</h2>
            <p className={styles.note}>
              این بخش فقط مانیتورینگ است. وضعیت Order با منطق پرداخت و موجودی تغییر می‌کند و از پنل به‌صورت دستی Override نمی‌شود.
            </p>
          </div>
          <label>
            فیلتر وضعیت
            <select
              value={status}
              disabled={loading}
              onChange={(event) => {
                const value = event.target.value;
                setStatus(value);
                void load(value);
              }}
            >
              {statusOptions.map(([value, label]) => <option key={value || "all"} value={value}>{label}</option>)}
            </select>
          </label>

          {loading && orders.length === 0 ? <p role="status">در حال دریافت…</p> : null}
          {!loading && orders.length === 0 ? <p>سفارشی با این وضعیت وجود ندارد.</p> : null}
          {orders.map((order) => (
            <article className={styles.card} key={order.id}>
              <h3>سفارش <bdi dir="ltr">{order.id}</bdi></h3>
              <p className={styles.status}>{order.status}</p>
              <p><bdi dir="ltr">{order.email}</bdi></p>
              <p>{toman(order.totalIrr)}</p>
              {order.discountIrr > 0 ? <p className={styles.meta}>تخفیف {toman(order.discountIrr)}</p> : null}
              <p className={styles.meta}>{new Date(order.createdAt).toLocaleString("fa-IR")}</p>
            </article>
          ))}
          {message ? <p role="status">{message}</p> : null}
        </div>
      </Container>
    </section>
  );
}
