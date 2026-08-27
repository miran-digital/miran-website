CREATE TABLE `customer_addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`recipient_name` text NOT NULL,
	`phone` text NOT NULL,
	`address_line` text NOT NULL,
	`city` text NOT NULL,
	`province` text NOT NULL,
	`postcode` text DEFAULT '' NOT NULL,
	`latitude_e6` integer,
	`longitude_e6` integer,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customer_addresses_owner_idx` ON `customer_addresses` (`owner_email`,`updated_at`);--> statement-breakpoint
CREATE INDEX `customer_addresses_default_idx` ON `customer_addresses` (`owner_email`,`is_default`);--> statement-breakpoint
ALTER TABLE `products` ADD `discount_type` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `discount_value` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `products`
SET `discount_type` = 'amount',
	`discount_value` = `compare_at_price_minor` - `price_minor`
WHERE `compare_at_price_minor` > `price_minor`;
