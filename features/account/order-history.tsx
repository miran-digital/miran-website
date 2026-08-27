import Link from "next/link";
import type { CalendarMode } from "@/lib/jalali";
import { formatCalendarDateTime } from "@/lib/jalali";
import { formatMoney, formatRialReference, IRAN_CURRENCY } from "@/lib/money";
import {
  deliveryLabels,
  orderStatusLabels,
  paymentStatusLabels,
  type BankTransferReceipt,
  type StoreOrder,
} from "@/features/orders/order-types";
import styles from "@/app/account/account.module.css";
import { productHref } from "@/lib/product-link";

export function OrderHistory({
  orders,
  receipts,
  calendarMode,
}: {
  orders: StoreOrder[];
  receipts: BankTransferReceipt[];
  calendarMode: CalendarMode;
}) {
  return (
    <section className={styles.orderSection} id="orders" aria-labelledby="orders-title">
      <div className={styles.sectionHeading}>
        <div>
          <p>سفارش‌های من</p>
          <h2 id="orders-title">تاریخچه و وضعیت سفارش‌ها</h2>
        </div>
        <span>{orders.length.toLocaleString("fa-IR")} سفارش</span>
      </div>

      {orders.length === 0 ? (
        <div className={styles.emptyOrders}>
          <strong>هنوز سفارشی با این حساب ثبت نشده است.</strong>
          <Link href="/products">مشاهده محصولات</Link>
        </div>
      ) : (
        <div className={styles.orderList}>
          {orders.map((order) => {
            const receipt = receipts.find((item) => item.orderId === order.id);
            return (
            <article className={styles.orderCard} key={order.id}>
              <header className={styles.orderHeader}>
                <div>
                  <span>شماره سفارش</span>
                  <strong dir="ltr">{order.orderNumber}</strong>
                </div>
                <div className={styles.orderBadges}>
                  <span>{orderStatusLabels[order.status]}</span>
                  <span>{paymentStatusLabels[order.paymentStatus]}</span>
                </div>
              </header>

              <dl className={styles.orderMeta}>
                <div>
                  <dt>زمان ثبت</dt>
                  <dd>{formatCalendarDateTime(order.createdAt, calendarMode)}</dd>
                </div>
                <div>
                  <dt>روش تحویل</dt>
                  <dd>{deliveryLabels[order.deliveryMethod]}</dd>
                </div>
                <div>
                  <dt>مبلغ سفارش</dt>
                  <dd>
                    {order.currency === IRAN_CURRENCY ? (
                      <>
                        {formatMoney(order.totalMinor)}
                        <small>{formatRialReference(order.totalMinor)}</small>
                      </>
                    ) : (
                      <span className={styles.legacyMoney}>
                        سفارش آزمایشی قدیمی با واحد {order.currency}
                      </span>
                    )}
                  </dd>
                </div>
              </dl>

              {receipt ? (
                <div className={styles.receiptStatus} data-status={receipt.status}>
                  <strong>فیش کارت‌به‌کارت</strong>
                  <span>{receipt.status === "pending" ? "در انتظار بررسی مدیریت" : receipt.status === "approved" ? "تأییدشده" : "ردشده"}</span>
                  {receipt.reviewNote ? <small>{receipt.reviewNote}</small> : null}
                </div>
              ) : null}

              <ul className={styles.orderItems}>
                {order.items.map((item) => (
                  <li key={item.id}>
                    <div>
                      <Link href={productHref(item.slug)}>
                        {item.title}
                      </Link>
                      <small dir="ltr">SKU: {item.sku || "—"}</small>
                    </div>
                    <span>{item.quantity.toLocaleString("fa-IR")} عدد</span>
                  </li>
                ))}
              </ul>

              <footer className={styles.orderAddress}>
                <strong>{order.addressLabel || "نشانی تحویل"}</strong>
                <span>
                  {order.province}، {order.city}، {order.addressLine}
                </span>
              </footer>
            </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
