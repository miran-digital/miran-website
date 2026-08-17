import { randomUUID } from "node:crypto";
import { withPostgresTransaction } from "./database.js";
import { PostgresInventoryService } from "./inventory-service.js";

function fail(message, code = "INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function assert(condition, message, code = "INVALID_INPUT") {
  if (!condition) fail(message, code);
}

function money(value, label = "money") {
  const number = Number(value);
  assert(Number.isSafeInteger(number) && number >= 0, `${label} is invalid`);
  return number;
}

export class PostgresPaymentService {
  constructor(
    pool,
    zarinpal,
    { reservationMinutes = 30, inventory = new PostgresInventoryService(pool) } = {},
  ) {
    this.pool = pool;
    this.zarinpal = zarinpal;
    this.inventory = inventory;
    this.reservationMinutes = reservationMinutes;
  }

  async startZarinpal(
    userId,
    orderId,
    { callbackUrl, email = null, mobile = null, now = new Date() },
  ) {
    const prepared = await withPostgresTransaction(this.pool, async (client) => {
      const visibleOrderResult = await client.query(
        "SELECT * FROM orders WHERE id=$1 AND user_id=$2",
        [orderId, userId],
      );
      const visibleOrder = visibleOrderResult.rows[0];
      assert(visibleOrder, "Order not found", "NOT_FOUND");
      assert(visibleOrder.status === "PENDING_PAYMENT", "Order is not payable", "CONFLICT");

      // Inventory owns reservation locking. Keep the shared order:
      // reservation -> order, preventing Payment/Maintenance deadlocks.
      const reservations = await this.inventory.lockActiveReservations(client, orderId);
      assert(reservations.length > 0, "No active inventory reservation", "CONFLICT");

      const orderResult = await client.query(
        "SELECT * FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [orderId, userId],
      );
      const order = orderResult.rows[0];
      assert(order, "Order not found", "NOT_FOUND");
      assert(order.status === "PENDING_PAYMENT", "Order is not payable", "CONFLICT");
      const amountIrr = money(order.total_irr, "order amount");
      assert(amountIrr > 0, "Order amount must be positive", "INVALID_PAYMENT_AMOUNT");

      if (reservations.some((item) => new Date(item.expires_at) <= now)) {
        await this.releaseOrderInsideTransaction(client, orderId, "PAYMENT_FAILED", reservations);
        return { expired: true, orderId };
      }

      const existingResult = await client.query(
        `SELECT * FROM payments
         WHERE order_id=$1 AND provider='ZARINPAL'
           AND status IN ('CREATED','REDIRECTED')
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [orderId],
      );
      const existing = existingResult.rows[0];
      if (existing?.authority && existing.status === "REDIRECTED") {
        return {
          reused: true,
          paymentId: existing.id,
          orderId,
          authority: existing.authority,
          redirectUrl: this.zarinpal.redirectUrl(existing.authority),
        };
      }
      if (existing?.status === "CREATED") {
        fail("A payment request is already being created for this order", "CONFLICT");
      }

      const paymentId = randomUUID();
      const extendedExpiry = new Date(
        now.getTime() + this.reservationMinutes * 60_000,
      );
      await this.inventory.extendActiveReservations(client, orderId, extendedExpiry);
      await client.query(
        `INSERT INTO payments(id,order_id,provider,amount_irr,status)
         VALUES($1,$2,'ZARINPAL',$3,'CREATED')`,
        [paymentId, orderId, amountIrr],
      );
      await this.audit(client, userId, "PAYMENT_CREATED", paymentId, { orderId });
      return {
        reused: false,
        paymentId,
        orderId,
        amountIrr,
        description: `Miran order ${order.id}`,
      };
    });

    if (prepared.expired) {
      fail("Inventory reservation has expired", "CONFLICT");
    }

    if (prepared.reused) return prepared;

    try {
      const provider = await this.zarinpal.createPayment({
        amountIrr: prepared.amountIrr,
        callbackUrl,
        description: prepared.description,
        email,
        mobile,
      });
      const updated = await this.pool.query(
        `UPDATE payments
         SET status='REDIRECTED',authority=$1,provider_payload=$2,updated_at=CURRENT_TIMESTAMP
         WHERE id=$3 AND status='CREATED'
         RETURNING id`,
        [provider.authority, JSON.stringify(provider.raw), prepared.paymentId],
      );
      assert(updated.rowCount === 1, "Payment state changed before redirect", "CONFLICT");
      await this.audit(this.pool, userId, "PAYMENT_REDIRECT_READY", prepared.paymentId, {
        orderId,
        authority: provider.authority,
      });
      return {
        paymentId: prepared.paymentId,
        orderId,
        authority: provider.authority,
        redirectUrl: provider.redirectUrl,
        reused: false,
      };
    } catch (error) {
      await this.pool.query(
        `UPDATE payments
         SET status='FAILED',provider_payload=$1,updated_at=CURRENT_TIMESTAMP
         WHERE id=$2 AND status='CREATED'`,
        [
          JSON.stringify({ error: error instanceof Error ? error.message : "provider error" }),
          prepared.paymentId,
        ],
      );
      throw error;
    }
  }

  async verifyZarinpalCallback({ authority, status }) {
    const normalizedAuthority = String(authority || "").trim();
    assert(normalizedAuthority, "Payment authority is required", "INVALID_AUTHORITY");

    const lookup = await this.pool.query(
      `SELECT p.*,o.status AS order_status
       FROM payments p
       JOIN orders o ON o.id=p.order_id
       WHERE p.provider='ZARINPAL' AND p.authority=$1`,
      [normalizedAuthority],
    );
    const payment = lookup.rows[0];
    assert(payment, "Payment not found", "NOT_FOUND");
    if (payment.status === "VERIFIED" && payment.order_status === "PAID") {
      return {
        orderId: payment.order_id,
        paymentId: payment.id,
        referenceId: payment.reference_id,
        alreadyVerified: true,
      };
    }

    if (String(status || "").toUpperCase() !== "OK") {
      return this.cancelRedirectedPayment(
        payment.id,
        payment.order_id,
        "CALLBACK_NOT_OK",
      );
    }
    assert(payment.order_status === "PENDING_PAYMENT", "Order is not pending payment", "CONFLICT");
    assert(payment.status === "REDIRECTED", "Payment is not awaiting verification", "CONFLICT");

    const verified = await this.zarinpal.verifyPayment({
      amountIrr: money(payment.amount_irr, "payment amount"),
      authority: normalizedAuthority,
    });

    return withPostgresTransaction(this.pool, async (client) => {
      const freshPaymentResult = await client.query(
        "SELECT * FROM payments WHERE id=$1 FOR UPDATE",
        [payment.id],
      );
      const freshPayment = freshPaymentResult.rows[0];
      assert(freshPayment, "Payment state could not be loaded", "NOT_FOUND");

      if (freshPayment.status === "VERIFIED") {
        const completedOrderResult = await client.query(
          "SELECT * FROM orders WHERE id=$1",
          [payment.order_id],
        );
        const completedOrder = completedOrderResult.rows[0];
        assert(
          completedOrder?.status === "PAID",
          "Verified payment has inconsistent order state",
          "CONFLICT",
        );
        return {
          orderId: completedOrder.id,
          paymentId: freshPayment.id,
          referenceId: freshPayment.reference_id,
          alreadyVerified: true,
        };
      }

      const reservations = await this.inventory.lockActiveReservations(
        client,
        payment.order_id,
      );
      assert(
        reservations.length > 0,
        "No active reservation for verified payment",
        "CONFLICT",
      );

      const freshOrderResult = await client.query(
        "SELECT * FROM orders WHERE id=$1 FOR UPDATE",
        [payment.order_id],
      );
      const freshOrder = freshOrderResult.rows[0];
      assert(freshOrder, "Payment state could not be loaded", "NOT_FOUND");
      assert(
        freshOrder.status === "PENDING_PAYMENT" && freshPayment.status === "REDIRECTED",
        "Payment state changed before verification",
        "CONFLICT",
      );

      await this.inventory.consumeReservations(client, reservations);
      await client.query(
        "UPDATE orders SET status='PAID',updated_at=CURRENT_TIMESTAMP WHERE id=$1",
        [freshOrder.id],
      );
      await client.query(
        `UPDATE payments
         SET status='VERIFIED',reference_id=$1,provider_payload=$2,updated_at=CURRENT_TIMESTAMP
         WHERE id=$3`,
        [verified.referenceId, JSON.stringify(verified.raw), freshPayment.id],
      );
      await this.audit(client, null, "PAYMENT_VERIFIED", freshPayment.id, {
        orderId: freshOrder.id,
        referenceId: verified.referenceId,
        providerCode: verified.code,
      });
      return {
        orderId: freshOrder.id,
        paymentId: freshPayment.id,
        referenceId: verified.referenceId,
        alreadyVerified: verified.code === 101,
      };
    });
  }

  async cancelRedirectedPayment(paymentId, orderId, reason) {
    return withPostgresTransaction(this.pool, async (client) => {
      const paymentResult = await client.query(
        "SELECT * FROM payments WHERE id=$1 FOR UPDATE",
        [paymentId],
      );
      const payment = paymentResult.rows[0];
      assert(payment, "Payment not found", "NOT_FOUND");
      if (payment.status === "VERIFIED") {
        return {
          orderId,
          paymentId,
          cancelled: false,
          alreadyVerified: true,
        };
      }
      await client.query(
        `UPDATE payments
         SET status='CANCELLED',provider_payload=$1,updated_at=CURRENT_TIMESTAMP
         WHERE id=$2 AND status IN ('CREATED','REDIRECTED')`,
        [JSON.stringify({ reason }), paymentId],
      );
      await this.releaseOrderInsideTransaction(client, orderId, "PAYMENT_FAILED");
      await this.audit(client, null, "PAYMENT_CANCELLED", paymentId, {
        orderId,
        reason,
      });
      return {
        orderId,
        paymentId,
        cancelled: true,
        alreadyVerified: false,
      };
    });
  }

  async releaseOrderInsideTransaction(
    client,
    orderId,
    nextStatus,
    lockedReservations = null,
  ) {
    const reservations =
      lockedReservations || (await this.inventory.lockActiveReservations(client, orderId));
    await this.inventory.releaseReservations(client, reservations);
    await client.query(
      `UPDATE orders
       SET status=$1,updated_at=CURRENT_TIMESTAMP
       WHERE id=$2 AND status='PENDING_PAYMENT'`,
      [nextStatus, orderId],
    );
    return reservations.length;
  }

  async audit(client, actorUserId, action, paymentId, details = {}) {
    await client.query(
      `INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,details_json)
       VALUES($1,$2,$3,'PAYMENT',$4,$5)`,
      [randomUUID(), actorUserId || null, action, paymentId, JSON.stringify(details)],
    );
  }
}
