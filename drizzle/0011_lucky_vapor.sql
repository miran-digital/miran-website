CREATE TABLE `request_rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`identity_hash` text NOT NULL,
	`window_start` integer NOT NULL,
	`hit_count` integer DEFAULT 1 NOT NULL,
	`blocked_count` integer DEFAULT 0 NOT NULL,
	`limit_value` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `request_rate_limits_window_idx` ON `request_rate_limits` (`window_start`);--> statement-breakpoint
CREATE INDEX `request_rate_limits_scope_idx` ON `request_rate_limits` (`scope`,`updated_at`);