CREATE TABLE `customer_accounts` (
	`auth_user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`full_name` text DEFAULT '' NOT NULL,
	`provider` text DEFAULT 'supabase' NOT NULL,
	`email_confirmed_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_accounts_email_unique` ON `customer_accounts` (`email`);--> statement-breakpoint
CREATE INDEX `customer_accounts_email_idx` ON `customer_accounts` (`email`);--> statement-breakpoint
CREATE INDEX `customer_accounts_last_seen_idx` ON `customer_accounts` (`last_seen_at`);