import { randomUUID } from "node:crypto";
import { transaction } from "./database.js";

function fail(message, code = "INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export class PaymentService {
  constructor(db, zarinpal, { reservationMinutes = 30 } = {}) {
    this.db = db;
    this.zarinpal = zarinpal;
    this.reservationMinutes = reservationMinutes;
  }

  async startZarinpal(userId, orderId, { callbackUrl, email = null, mobile = null, now = new Date() }) {
    const order = this.db
      .prepare("SELECT * FROM orders WHERE id=? AND user_id=?")
      .get(orderId, userId);
    if (!order) fail("Order not found", "NOT_FOUND");
    if (order.status !== "PENDING_PAYMENT") fail("Order is not payable", "CONFLICT");
    if (!Number.isSafeInteger(Number(order.total_irr)) || Number(order.total_irr) < 10_000) {
      fail("Order amount is below Zarinpal minimum", "INVALID_PAYMENT_AMOUNT");
    }

    const reservations = this.db
      .prepare("SELECT * FROM inventory_reservations WHERE order_id=? AND status='ACTIVE'")
      .all(orderId);
    if (reservations.length === 0) fail("No active inventory reservation", "CONFLICT");
    if (reservations.some((item) => new Date(item.expires_at) <= now)) {
      this.releaseOrder(orderId, "PAYMENT_FAILED");
      fail("Inventory reservation has expired", "CONFLICT");
    }

    const existing = this.db
      .prepare(
        "SELECT * FROM payments WHERE order_id=? AND provider='ZARINPAL' AND status IN ('CREATED','REDIRECTED') ORDER BY created_at DESC LIMIT 1",
      )
      .get(orderId);
    if (existing?.authority && existing.status === "REDIRECTED") {
      return {
        paymentId: existing.id,
        orderId,
        authority: existing.authority,
        redirectUrl: this.zarinpal.redirectUrl(existing.authority),
        reused: true,
      };
    }
    if (existing?.status === "CREATED") {
      fail("A payment request is already being created for this order", "CONFLICT");
    }

    const paymentId = randomUUID();
    const extendedExpiry = new Date(
      now.getTime() + this.reservationMinutes * 60_000,
    ).toISOString();

    transaction(this.db, () => {
      this.db
        .prepare(
          "UPDATE inventory_reservations SET expires_at=? WHERE order_id=? AND status='ACTIVE'",
        )
        .run(extendedExpiry, orderId);
      this.db
        .prepare(
          "INSERT INTO payments (id,order_id,provider,amount_irr,status) VALUES (?,?,?,?,?)",
        )
        .run(paymentId, orderId, "ZARINPAL", order.total_irr, "CREATED");
      this.audit(userId, "PAYMENT_CREATED", "PAYMENT", paymentId, { orderId });
    });

    try {
      const provider = await this.zarinpal.createPayment({
        amountIrr: Number(order.total_irr),
        callbackUrl,
        description: `Miran order ${order.id}`,
        email,
        mobile,
      });
      this.db
        .prepare(
          "UPDATE payments SET status='REDIRECTED',authority=?,provider_payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='CREATED'",
        )
        .run(provider.authority, JSON.stringify(provider.raw), paymentId);
      this.audit(userId, "PAYMENT_REDIRECT_READY", "PAYMENT", paymentId, {
        orderId,
        authority: provider.authority,
      });
      return {
        paymentId,
        orderId,
        authority: provider.authority,
        redirectUrl: provider.redirectUrl,
        reused: false,
      };
    } catch (error) {
      this.db
        .prepare(
          "UPDATE payments SET status='FAILED',provider_payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='CREATED'",
        )
        .run(
          JSON.stringify({ error: error instanceof Error ? error.message : "provider error" }),
          paymentId,
        );
      throw error;
    }
  }

  async verifyZarinpalCallback({ authority, status }) {
    const normalizedAuthority = String(authority || "").trim();
    if (!normalizedAuthority) fail("Payment authority is required", "INVALID_AUTHORITY");
    const payment = this.db
      .prepare("SELECT * FROM payments WHERE provider='ZARINPAL' AND authority=?")
      .get(normalizedAuthority);
    if (!payment) fail("Payment not found", "NOT_FOUND");

    const order = this.db.prepare("SELECT * FROM orders WHERE id=?").get(payment.order_id);
    if (!order) fail("Order not found", "NOT_FOUND");
    if (payment.status === "VERIFIED" && order.status === "PAID") {
      return {
        orderId: order.id,
        paymentId: payment.id,
        referenceId: payment.reference_id,
        alreadyVerified: true,
      };
    }

    if (String(status || "").toUpperCase() !== "OK") {
      this.cancelRedirectedPayment(payment.id, order.id, "CALLBACK_NOT_OK");
      return {
        orderId: order.id,
        paymentId: payment.id,
        cancelled: true,
        alreadyVerified: false,
      };
    }
    if (order.status !== "PENDING_PAYMENT") fail("Order is not pending payment", "CONFLICT");
    if (payment.status !== "REDIRECTED") fail("Payment is not awaiting verification", "CONFLICT");

    const verified = await this.zarinpal.verifyPayment({
      amountIrr: Number(payment.amount_irr),
      authority: normalizedAuthority,
    });

    return transaction(this.db, () => {
      const freshPayment = this.db.prepare("SELECT * FROM payments WHERE id=?").get(payment.id);
      const freshOrder = this.db.prepare("SELECT * FROM orders WHERE id=?").get(order.id);
      if (freshPayment.status === "VERIFIED" && freshOrder.status === "PAID") {
        return {
          orderId: freshOrder.id,
          paymentId: freshPayment.id,
          referenceId: freshPayment.reference_id,
          alreadyVerified: true,
        };
      }
      if (freshOrder.status !== "PENDING_PAYMENT" || freshPayment.status !== "REDIRECTED") {
        fail("Payment state changed before verification", "CONFLICT");
      }

      const reservations = this.db
        .prepare("SELECT * FROM inventory_reservations WHERE order_id=? AND status='ACTIVE'")
        .all(order.id);
      if (reservations.length === 0) {
        fail("No active reservation for verified payment", "CONFLICT");
      }
      for (const reservation of reservations) {
        const inventory = this.db
          .prepare("SELECT * FROM inventory WHERE product_id=?")
          .get(reservation.product_id);
        if (
          !inventory ||
          inventory.stock_reserved < reservation.quantity ||
          inventory.stock_on_hand < reservation.quantity
        ) {
          fail("Inventory invariant violated", "CONFLICT");
        }
        this.db
          .prepare(
            "UPDATE inventory SET stock_on_hand=stock_on_hand-?,stock_reserved=stock_reserved-?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE product_id=?",
          )
          .run(reservation.quantity, reservation.quantity, reservation.product_id);
      }
      this.db
        .prepare("UPDATE inventory_reservations SET status='CONSUMED' WHERE order_id=? AND status='ACTIVE'")
        .run(order.id);
      this.db
        .prepare("UPDATE orders SET status='PAID',updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(order.id);
      this.db
        .prepare(
          "UPDATE payments SET status='VERIFIED',reference_id=?,provider_payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .run(verified.referenceId, JSON.stringify(verified.raw), payment.id);
      this.audit(null, "PAYMENT_VERIFIED", "PAYMENT", payment.id, {
        orderId: order.id,
        referenceId: verified.referenceId,
        providerCode: verified.code,
      });
      return {
        orderId: order.id,
        paymentId: payment.id,
        referenceId: verified.referenceId,
        alreadyVerified: verified.code === 101,
      };
    });
  }

  cancelRedirectedPayment(paymentId, orderId, reason) {
    return transaction(this.db, () => {
      const payment = this.db.prepare("SELECT * FROM payments WHERE id=?").get(paymentId);
      if (!payment) fail("Payment not found", "NOT_FOUND");
      if (payment.status === "VERIFIED") return { cancelled: false };
      this.db
        .prepare(
          "UPDATE payments SET status='CANCELLED',provider_payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('CREATED','REDIRECTED')",
        )
        .run(JSON.stringify({ reason }), paymentId);
      this.releaseOrderInsideTransaction(orderId, "PAYMENT_FAILED");
      this.audit(null, "PAYMENT_CANCELLED", "PAYMENT", paymentId, { orderId, reason });
      return { cancelled: true };
    });
  }

  releaseOrder(orderId, nextStatus) {
    return transaction(this.db, () => this.releaseOrderInsideTransaction(orderId, nextStatus));
  }

  releaseOrderInsideTransaction(orderId, nextStatus) {
    const reservations = this.db
      .prepare("SELECT * FROM inventory_reservations WHERE order_id=? AND status='ACTIVE'")
      .all(orderId);
    for (const reservation of reservations) {
      this.db
        .prepare(
          "UPDATE inventory SET stock_reserved=stock_reserved-?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE product_id=? AND stock_reserved>=?",
        )
        .run(reservation.quantity, reservation.product_id, reservation.quantity);
      this.db
        .prepare("UPDATE inventory_reservations SET status='RELEASED' WHERE id=? AND status='ACTIVE'")
        .run(reservation.id);
    }
    this.db
      .prepare("UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING_PAYMENT'")
      .run(nextStatus, orderId);
    return reservations.length;
  }

  audit(actorUserId, action, entityType, entityId, details = {}) {
    this.db
      .prepare(
        "INSERT INTO audit_log (id,actor_user_id,action,entity_type,entity_id,details_json) VALUES (?,?,?,?,?,?)",
      )
      .run(randomUUID(), actorUserId, action, entityType, entityId, JSON.stringify(details));
  }
}
