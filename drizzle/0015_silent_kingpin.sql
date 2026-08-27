CREATE TABLE `admin_owner_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_iterations` integer NOT NULL,
	`owner_email` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_owner_credentials_username_unique` ON `admin_owner_credentials` (`username`);--> statement-breakpoint
CREATE TABLE `admin_owner_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_owner_sessions_owner_idx` ON `admin_owner_sessions` (`owner_email`,`created_at`);--> statement-breakpoint
CREATE INDEX `admin_owner_sessions_expires_idx` ON `admin_owner_sessions` (`expires_at`);