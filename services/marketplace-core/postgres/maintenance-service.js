import { withPostgresTransaction } from "./database.js";
import { PostgresInventoryService } from "./inventory-service.js";

export async function runPostgresMaintenance(
  pool,
  _legacyMarketplace,
  now = new Date(),
  { inventory = new PostgresInventoryService(pool) } = {},
) {
  const releasedReservations = await withPostgresTransaction(
    pool,
    async (client) => {
      const expired = await inventory.lockExpiredReservations(client, now);
      if (expired.length === 0) return 0;

      await inventory.releaseReservations(client, expired);
      const orderIds = [...new Set(expired.map((reservation) => reservation.order_id))];
      for (const orderId of orderIds) {
        await client.query(
          `UPDATE orders
           SET status='PAYMENT_FAILED',updated_at=CURRENT_TIMESTAMP
           WHERE id=$1 AND status='PENDING_PAYMENT'`,
          [orderId],
        );
      }
      return expired.length;
    },
  );

  const expiredSessions = await pool.query(
    "DELETE FROM sessions WHERE expires_at <= $1",
    [now],
  );
  return {
    releasedReservations: Number(releasedReservations || 0),
    expiredSessions: Number(expiredSessions.rowCount || 0),
  };
}
