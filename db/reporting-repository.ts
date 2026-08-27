import type { OperationalReport } from "../features/admin/report-types.ts";
import { getRuntimeEnv } from "../lib/runtime-env.ts";

type OrderMetricsRow = {
  total_orders: number;
  paid_orders: number;
  pending_payment_orders: number;
  cancelled_orders: number;
  legacy_currency_orders: number;
  paid_revenue_rial: number;
  customer_count: number;
};

type CatalogMetricsRow = {
  total_products: number;
  visible_products: number;
  out_of_stock_products: number;
  low_stock_products: number;
  reserved_units: number;
};

type OperationsMetricsRow = {
  open_support_tickets: number;
  waiting_support_tickets: number;
  pending_reviews: number;
  approved_reviews: number;
  seller_applications: number;
  eligible_sellers: number;
  audit_events_last_24_hours: number;
  blocked_requests_last_24_hours: number;
  stale_reservations: number;
  stale_payment_attempts: number;
  old_open_support_tickets: number;
};

export async function getOperationalReport(
  lowStockThreshold = 5,
  databaseOverride?: D1Database,
): Promise<OperationalReport> {
  const database = databaseOverride ?? await requireDatabase();
  const [orders, catalog, operations, paidUnits, dailySales, topProducts] = await Promise.all([
    database.prepare(
      `SELECT
         COUNT(*) AS total_orders,
         COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END), 0) AS paid_orders,
         COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_payment_orders,
         COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled_orders,
         COALESCE(SUM(CASE WHEN currency != 'IRR' THEN 1 ELSE 0 END), 0) AS legacy_currency_orders,
         COALESCE(SUM(CASE WHEN payment_status = 'paid' AND currency = 'IRR' THEN total_minor ELSE 0 END), 0) AS paid_revenue_rial,
         COUNT(DISTINCT customer_email) AS customer_count
       FROM orders`,
    ).first<OrderMetricsRow>(),
    database.prepare(
      `SELECT
         COUNT(*) AS total_products,
         COALESCE(SUM(CASE WHEN visible = 1 THEN 1 ELSE 0 END), 0) AS visible_products,
         COALESCE(SUM(CASE WHEN visible = 1 AND stock_quantity - reserved_quantity <= 0 THEN 1 ELSE 0 END), 0) AS out_of_stock_products,
         COALESCE(SUM(CASE WHEN visible = 1 AND stock_quantity - reserved_quantity > 0 AND stock_quantity - reserved_quantity <= ? THEN 1 ELSE 0 END), 0) AS low_stock_products,
         COALESCE(SUM(reserved_quantity), 0) AS reserved_units
       FROM products`,
    ).bind(Math.max(0, Math.floor(lowStockThreshold))).first<CatalogMetricsRow>(),
    database.prepare(
      `SELECT
         (SELECT COUNT(*) FROM support_tickets WHERE status IN ('open', 'in_progress')) AS open_support_tickets,
         (SELECT COUNT(*) FROM support_tickets WHERE status = 'waiting_customer') AS waiting_support_tickets,
         (SELECT COUNT(*) FROM product_reviews WHERE status = 'pending') AS pending_reviews,
         (SELECT COUNT(*) FROM product_reviews WHERE status = 'approved') AS approved_reviews,
         (SELECT COUNT(*) FROM seller_applications) AS seller_applications,
         (SELECT COUNT(*) FROM seller_applications
           WHERE status = 'approved' AND document_status = 'verified'
             AND guarantee_status IN ('verified', 'waived')
             AND agreement_status = 'signed'
             AND documents_json != '[]') AS eligible_sellers,
         (SELECT COUNT(*) FROM admin_audit_log WHERE created_at >= datetime('now', '-1 day')) AS audit_events_last_24_hours,
         (SELECT COALESCE(SUM(blocked_count), 0) FROM request_rate_limits WHERE updated_at >= datetime('now', '-1 day')) AS blocked_requests_last_24_hours,
         (SELECT COUNT(*) FROM orders
           WHERE status = 'new' AND payment_status != 'paid'
             AND reservation_expires_at != ''
             AND reservation_expires_at <= datetime('now')) AS stale_reservations,
         (SELECT COUNT(*) FROM payment_attempts
           WHERE status = 'pending' AND created_at <= datetime('now', '-15 minutes')) AS stale_payment_attempts,
         (SELECT COUNT(*) FROM support_tickets
           WHERE status IN ('open', 'in_progress')
             AND created_at <= datetime('now', '-3 days')) AS old_open_support_tickets`,
    ).first<OperationsMetricsRow>(),
    database.prepare(
      `SELECT COALESCE(SUM(oi.quantity), 0) AS paid_units
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.payment_status = 'paid' AND o.currency = 'IRR'`,
    ).first<{ paid_units: number }>(),
    database.prepare(
      `SELECT substr(created_at, 1, 10) AS day,
              COUNT(*) AS order_count,
              COALESCE(SUM(CASE WHEN payment_status = 'paid' AND currency = 'IRR' THEN total_minor ELSE 0 END), 0) AS paid_revenue_rial
         FROM orders
        WHERE created_at >= datetime('now', '-30 days')
        GROUP BY substr(created_at, 1, 10)
        ORDER BY day ASC`,
    ).all<{ day: string; order_count: number; paid_revenue_rial: number }>(),
    database.prepare(
      `SELECT oi.product_id, oi.title,
              SUM(oi.quantity) AS quantity,
              SUM(oi.line_total_minor) AS revenue_rial
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.payment_status = 'paid' AND o.currency = 'IRR'
        GROUP BY oi.product_id, oi.title
        ORDER BY quantity DESC, revenue_rial DESC
        LIMIT 10`,
    ).all<{ product_id: string; title: string; quantity: number; revenue_rial: number }>(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    commerce: {
      totalOrders: number(orders?.total_orders),
      paidOrders: number(orders?.paid_orders),
      pendingPaymentOrders: number(orders?.pending_payment_orders),
      cancelledOrders: number(orders?.cancelled_orders),
      legacyCurrencyOrders: number(orders?.legacy_currency_orders),
      paidRevenueRial: number(orders?.paid_revenue_rial),
      paidUnits: number(paidUnits?.paid_units),
      customerCount: number(orders?.customer_count),
    },
    catalog: {
      totalProducts: number(catalog?.total_products),
      visibleProducts: number(catalog?.visible_products),
      outOfStockProducts: number(catalog?.out_of_stock_products),
      lowStockProducts: number(catalog?.low_stock_products),
      reservedUnits: number(catalog?.reserved_units),
    },
    operations: {
      openSupportTickets: number(operations?.open_support_tickets),
      waitingSupportTickets: number(operations?.waiting_support_tickets),
      pendingReviews: number(operations?.pending_reviews),
      approvedReviews: number(operations?.approved_reviews),
      sellerApplications: number(operations?.seller_applications),
      eligibleSellers: number(operations?.eligible_sellers),
      auditEventsLast24Hours: number(operations?.audit_events_last_24_hours),
      blockedRequestsLast24Hours: number(operations?.blocked_requests_last_24_hours),
      staleReservations: number(operations?.stale_reservations),
      stalePaymentAttempts: number(operations?.stale_payment_attempts),
      oldOpenSupportTickets: number(operations?.old_open_support_tickets),
    },
    dailySales: dailySales.results.map((row) => ({
      day: row.day,
      orderCount: number(row.order_count),
      paidRevenueRial: number(row.paid_revenue_rial),
    })),
    topProducts: topProducts.results.map((row) => ({
      productId: row.product_id,
      title: row.title,
      quantity: number(row.quantity),
      revenueRial: number(row.revenue_rial),
    })),
  };
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function requireDatabase() {
  const bindings = await getRuntimeEnv<{ DB?: D1Database }>();
  if (!bindings.DB) throw new Error("DATABASE_UNAVAILABLE");
  return bindings.DB;
}
