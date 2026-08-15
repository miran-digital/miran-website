CREATE TABLE IF NOT EXISTS home_sections (
  section_key TEXT PRIMARY KEY,
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS header_messages (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  href TEXT,
  background_color TEXT NOT NULL DEFAULT '#111827',
  text_color TEXT NOT NULL DEFAULT '#ffffff',
  starts_at TEXT,
  ends_at TEXT,
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_header_messages_visibility
  ON header_messages(visible,sort_order,starts_at,ends_at);

CREATE TABLE IF NOT EXISTS storefront_banners (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  href TEXT,
  image_url TEXT,
  placement TEXT NOT NULL DEFAULT 'SMALL'
    CHECK (placement IN ('TOP','HERO','SMALL')),
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_storefront_banners_visibility
  ON storefront_banners(placement,visible,sort_order,starts_at,ends_at);

INSERT OR IGNORE INTO home_sections(section_key,visible,sort_order) VALUES
  ('hero',1,10),
  ('banners',1,20),
  ('categories',1,30),
  ('specialOffers',1,40),
  ('products',1,50),
  ('brands',1,60),
  ('trust',1,70);
