ALTER TABLE storefront_banners ADD COLUMN storage_key TEXT;
ALTER TABLE storefront_banners ADD COLUMN mime_type TEXT;
ALTER TABLE storefront_banners ADD COLUMN size_bytes INTEGER;
ALTER TABLE storefront_banners ADD COLUMN sha256 TEXT;

CREATE UNIQUE INDEX storefront_banners_storage_key_uq
  ON storefront_banners(storage_key);
