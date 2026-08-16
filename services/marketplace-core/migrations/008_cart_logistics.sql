CREATE TABLE carts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','CHECKED_OUT')) DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX carts_one_active_per_user_uq
  ON carts(user_id)
  WHERE status='ACTIVE';

CREATE TABLE cart_items (
  cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 1000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cart_id, product_id)
);

CREATE INDEX cart_items_product_id_idx ON cart_items(product_id);

CREATE TABLE shipping_methods (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_irr INTEGER NOT NULL CHECK (price_irr >= 0),
  free_over_irr INTEGER CHECK (free_over_irr IS NULL OR free_over_irr >= 0),
  min_delivery_days INTEGER CHECK (min_delivery_days IS NULL OR min_delivery_days >= 0),
  max_delivery_days INTEGER CHECK (max_delivery_days IS NULL OR max_delivery_days >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (min_delivery_days IS NULL OR max_delivery_days IS NULL OR min_delivery_days <= max_delivery_days)
);

CREATE INDEX shipping_methods_active_sort_idx ON shipping_methods(active, sort_order);

ALTER TABLE orders ADD COLUMN source_cart_id TEXT REFERENCES carts(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN shipping_method_code TEXT;
ALTER TABLE orders ADD COLUMN shipping_method_name TEXT;
ALTER TABLE orders ADD COLUMN shipping_irr INTEGER NOT NULL DEFAULT 0 CHECK (shipping_irr >= 0);
CREATE INDEX orders_source_cart_id_idx ON orders(source_cart_id);
