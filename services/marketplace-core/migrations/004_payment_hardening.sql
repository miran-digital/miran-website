CREATE UNIQUE INDEX IF NOT EXISTS payments_one_active_provider_per_order_uq
  ON payments(order_id, provider)
  WHERE status IN ('CREATED','REDIRECTED');
