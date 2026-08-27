CREATE TABLE `catalog_attribute_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`category_slug` text NOT NULL,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`data_type` text DEFAULT 'text' NOT NULL,
	`unit` text,
	`filterable` integer DEFAULT false NOT NULL,
	`searchable` integer DEFAULT false NOT NULL,
	`comparable` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_attribute_category_code_unique` ON `catalog_attribute_definitions` (`category_slug`,`code`);--> statement-breakpoint
CREATE INDEX `catalog_attribute_category_active_idx` ON `catalog_attribute_definitions` (`category_slug`,`active`);--> statement-breakpoint
CREATE TABLE `product_attribute_values` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`attribute_id` text NOT NULL,
	`value_text` text,
	`value_number` real,
	`value_boolean` integer,
	`normalized_value` text DEFAULT '' NOT NULL,
	`key_feature` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_attribute_product_definition_unique` ON `product_attribute_values` (`product_id`,`attribute_id`);--> statement-breakpoint
CREATE INDEX `product_attribute_product_visible_idx` ON `product_attribute_values` (`product_id`,`visible`,`sort_order`);--> statement-breakpoint
CREATE INDEX `product_attribute_filter_text_idx` ON `product_attribute_values` (`attribute_id`,`normalized_value`,`visible`);--> statement-breakpoint
CREATE INDEX `product_attribute_filter_number_idx` ON `product_attribute_values` (`attribute_id`,`value_number`,`visible`);--> statement-breakpoint
CREATE TABLE `product_price_history` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`previous_price_minor` integer NOT NULL,
	`new_price_minor` integer NOT NULL,
	`previous_compare_at_price_minor` integer DEFAULT 0 NOT NULL,
	`new_compare_at_price_minor` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'IRR' NOT NULL,
	`changed_by` text NOT NULL,
	`changed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `product_price_history_product_time_idx` ON `product_price_history` (`product_id`,`changed_at`);--> statement-breakpoint
CREATE INDEX `product_price_history_source_time_idx` ON `product_price_history` (`source_type`,`source_id`,`changed_at`);--> statement-breakpoint
CREATE TABLE `product_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`customer_email` text NOT NULL,
	`customer_name` text NOT NULL,
	`body` text NOT NULL,
	`answer` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`answered_by` text DEFAULT '' NOT NULL,
	`answered_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `product_questions_product_status_idx` ON `product_questions` (`product_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `product_questions_customer_idx` ON `product_questions` (`customer_email`,`created_at`);--> statement-breakpoint
CREATE TABLE `product_variant_attribute_values` (
	`id` text PRIMARY KEY NOT NULL,
	`variant_id` text NOT NULL,
	`attribute_id` text NOT NULL,
	`value_text` text,
	`value_number` real,
	`value_boolean` integer,
	`normalized_value` text DEFAULT '' NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `variant_attribute_variant_definition_unique` ON `product_variant_attribute_values` (`variant_id`,`attribute_id`);--> statement-breakpoint
CREATE INDEX `variant_attribute_filter_text_idx` ON `product_variant_attribute_values` (`attribute_id`,`normalized_value`,`visible`);--> statement-breakpoint
CREATE INDEX `variant_attribute_filter_number_idx` ON `product_variant_attribute_values` (`attribute_id`,`value_number`,`visible`);--> statement-breakpoint
ALTER TABLE `products` ADD `english_title` text;--> statement-breakpoint
ALTER TABLE `products` ADD `short_description` text;