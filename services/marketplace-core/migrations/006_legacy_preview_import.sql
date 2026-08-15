ALTER TABLE header_messages ADD COLUMN legacy_key TEXT;
ALTER TABLE storefront_banners ADD COLUMN legacy_key TEXT;
ALTER TABLE products ADD COLUMN legacy_key TEXT;

CREATE UNIQUE INDEX header_messages_legacy_key_uq
  ON header_messages(legacy_key);
CREATE UNIQUE INDEX storefront_banners_legacy_key_uq
  ON storefront_banners(legacy_key);
CREATE UNIQUE INDEX products_legacy_key_uq
  ON products(legacy_key);
