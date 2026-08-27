CREATE TABLE `payment_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`provider` text NOT NULL,
	`authority` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`amount_minor` integer NOT NULL,
	`provider_reference` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payment_attempts_order_idx` ON `payment_attempts` (`order_id`);--> statement-breakpoint
CREATE INDEX `payment_attempts_authority_idx` ON `payment_attempts` (`authority`);--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`title` text NOT NULL,
	`sku` text DEFAULT '' NOT NULL,
	`price_minor` integer NOT NULL,
	`compare_at_price_minor` integer DEFAULT 0 NOT NULL,
	`stock_quantity` integer DEFAULT 0 NOT NULL,
	`reserved_quantity` integer DEFAULT 0 NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `product_variants_product_idx` ON `product_variants` (`product_id`,`visible`);--> statement-breakpoint
CREATE INDEX `product_variants_sku_idx` ON `product_variants` (`sku`);--> statement-breakpoint
CREATE TABLE `seller_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`seller_application_id` text NOT NULL,
	`seller_name` text NOT NULL,
	`price_minor` integer NOT NULL,
	`stock_quantity` integer DEFAULT 0 NOT NULL,
	`reserved_quantity` integer DEFAULT 0 NOT NULL,
	`guarantee_label` text DEFAULT '' NOT NULL,
	`delivery_label` text DEFAULT '' NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `seller_offers_product_idx` ON `seller_offers` (`product_id`,`visible`);--> statement-breakpoint
CREATE INDEX `seller_offers_seller_idx` ON `seller_offers` (`seller_application_id`);--> statement-breakpoint
CREATE TABLE `storefront_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`actor_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `storefront_revisions_created_idx` ON `storefront_revisions` (`created_at`);--> statement-breakpoint
ALTER TABLE `order_items` ADD `variant_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `seller_offer_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `selection_label` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `reservation_expires_at` text DEFAULT '' NOT NULL;