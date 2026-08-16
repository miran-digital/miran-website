CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','CHECKED_OUT')) DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS carts_one_active_per_user_uq
  ON carts(user_id)
  WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS cart_items (
  cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cart_id, product_id)
);
CREATE INDEX IF NOT EXISTS cart_items_product_id_idx ON cart_items(product_id);

CREATE TABLE IF NOT EXISTS shipping_methods (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_irr BIGINT NOT NULL CHECK (price_irr >= 0),
  free_over_irr BIGINT CHECK (free_over_irr IS NULL OR free_over_irr >= 0),
  min_delivery_days INTEGER CHECK (min_delivery_days IS NULL OR min_delivery_days >= 0),
  max_delivery_days INTEGER CHECK (max_delivery_days IS NULL OR max_delivery_days >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (min_delivery_days IS NULL OR max_delivery_days IS NULL OR min_delivery_days <= max_delivery_days)
);
CREATE INDEX IF NOT EXISTS shipping_methods_active_sort_idx
  ON shipping_methods(active, sort_order);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_method_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_method_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_irr BIGINT NOT NULL DEFAULT 0 CHECK (shipping_irr >= 0);

CREATE OR REPLACE FUNCTION miran_cleanup_paid_order_from_cart()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  active_cart_id TEXT;
BEGIN
  IF NEW.status = 'PAID' AND OLD.status IS DISTINCT FROM 'PAID' THEN
    SELECT id INTO active_cart_id
    FROM carts
    WHERE user_id = NEW.user_id AND status = 'ACTIVE'
    LIMIT 1
    FOR UPDATE;

    IF active_cart_id IS NOT NULL THEN
      DELETE FROM cart_items ci
      USING order_items oi
      WHERE ci.cart_id = active_cart_id
        AND oi.order_id = NEW.id
        AND oi.product_id = ci.product_id
        AND ci.quantity <= oi.quantity;

      UPDATE cart_items ci
      SET quantity = ci.quantity - oi.quantity,
          updated_at = CURRENT_TIMESTAMP
      FROM order_items oi
      WHERE ci.cart_id = active_cart_id
        AND oi.order_id = NEW.id
        AND oi.product_id = ci.product_id
        AND ci.quantity > oi.quantity;

      UPDATE carts
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = active_cart_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_paid_cart_cleanup ON orders;
CREATE TRIGGER orders_paid_cart_cleanup
AFTER UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION miran_cleanup_paid_order_from_cart();
