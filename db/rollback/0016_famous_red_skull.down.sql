DROP TABLE IF EXISTS `product_variant_attribute_values`;--> statement-breakpoint
DROP TABLE IF EXISTS `product_attribute_values`;--> statement-breakpoint
DROP TABLE IF EXISTS `catalog_attribute_definitions`;--> statement-breakpoint
DROP TABLE IF EXISTS `product_questions`;--> statement-breakpoint
DROP TABLE IF EXISTS `product_price_history`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `short_description`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `english_title`;
