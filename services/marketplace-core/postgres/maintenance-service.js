export async function runPostgresMaintenance(pool, marketplace, now = new Date()) {
  const releasedReservations = await marketplace.releaseExpiredReservations(now);
  const expiredSessions = await pool.query(
    "DELETE FROM sessions WHERE expires_at <= $1",
    [now],
  );
  return {
    releasedReservations: Number(releasedReservations || 0),
    expiredSessions: Number(expiredSessions.rowCount || 0),
  };
}
