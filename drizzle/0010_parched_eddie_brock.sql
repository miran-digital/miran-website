CREATE TABLE `customer_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`href` text DEFAULT '/account' NOT NULL,
	`read_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customer_notifications_owner_idx` ON `customer_notifications` (`owner_email`,`created_at`);--> statement-breakpoint
CREATE INDEX `customer_notifications_unread_idx` ON `customer_notifications` (`owner_email`,`read_at`);--> statement-breakpoint
CREATE TABLE `product_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`customer_email` text NOT NULL,
	`customer_name` text NOT NULL,
	`order_id` text NOT NULL,
	`rating` integer NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`moderated_by` text DEFAULT '' NOT NULL,
	`moderated_at` text DEFAULT '' NOT NULL,
	`moderation_note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `product_reviews_product_status_idx` ON `product_reviews` (`product_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `product_reviews_customer_idx` ON `product_reviews` (`customer_email`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_reviews_customer_product_unique` ON `product_reviews` (`customer_email`,`product_id`);--> statement-breakpoint
CREATE TABLE `support_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`author_email` text NOT NULL,
	`author_role` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `support_messages_ticket_idx` ON `support_messages` (`ticket_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_number` text NOT NULL,
	`customer_email` text NOT NULL,
	`customer_name` text NOT NULL,
	`order_id` text DEFAULT '' NOT NULL,
	`subject` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `support_tickets_ticket_number_unique` ON `support_tickets` (`ticket_number`);--> statement-breakpoint
CREATE INDEX `support_tickets_customer_idx` ON `support_tickets` (`customer_email`,`updated_at`);--> statement-breakpoint
CREATE INDEX `support_tickets_status_idx` ON `support_tickets` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `support_tickets_order_idx` ON `support_tickets` (`order_id`);