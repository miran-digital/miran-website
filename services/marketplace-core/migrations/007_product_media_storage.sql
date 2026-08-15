ALTER TABLE product_media ADD COLUMN storage_key TEXT;
ALTER TABLE product_media ADD COLUMN mime_type TEXT;
ALTER TABLE product_media ADD COLUMN size_bytes INTEGER;
ALTER TABLE product_media ADD COLUMN sha256 TEXT;

CREATE UNIQUE INDEX product_media_storage_key_uq
  ON product_media(storage_key);
