ALTER TABLE `orders` ADD `address_source_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `address_label` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `province` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `latitude_e6` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `longitude_e6` integer;