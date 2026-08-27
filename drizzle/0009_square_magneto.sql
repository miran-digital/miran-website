CREATE TABLE `bank_transfer_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`customer_email` text NOT NULL,
	`storage_key` text NOT NULL,
	`original_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`transfer_reference` text DEFAULT '' NOT NULL,
	`customer_note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text DEFAULT '' NOT NULL,
	`reviewed_at` text DEFAULT '' NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bank_transfer_receipts_order_idx` ON `bank_transfer_receipts` (`order_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `bank_transfer_receipts_customer_idx` ON `bank_transfer_receipts` (`customer_email`,`created_at`);--> statement-breakpoint
CREATE INDEX `bank_transfer_receipts_status_idx` ON `bank_transfer_receipts` (`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_transfer_receipts_pending_order_unique` ON `bank_transfer_receipts` (`order_id`) WHERE status = 'pending';