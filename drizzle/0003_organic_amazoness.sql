ALTER TABLE `products` ADD `currency` text DEFAULT 'GBP' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `amazing_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `amazing_starts_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `amazing_ends_at` text DEFAULT '' NOT NULL;