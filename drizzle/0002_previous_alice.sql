ALTER TABLE `products` ADD `video_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `seller_applications` ADD `legal_type` text DEFAULT 'individual' NOT NULL;--> statement-breakpoint
ALTER TABLE `seller_applications` ADD `registration_number` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `seller_applications` ADD `address` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `seller_applications` ADD `guarantee_type` text DEFAULT 'review_later' NOT NULL;--> statement-breakpoint
ALTER TABLE `seller_applications` ADD `guarantee_amount_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `seller_applications` ADD `documents_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `seller_applications` ADD `document_status` text DEFAULT 'missing' NOT NULL;--> statement-breakpoint
ALTER TABLE `seller_applications` ADD `guarantee_status` text DEFAULT 'not_requested' NOT NULL;--> statement-breakpoint
ALTER TABLE `seller_applications` ADD `agreement_status` text DEFAULT 'not_sent' NOT NULL;--> statement-breakpoint
ALTER TABLE `seller_applications` ADD `admin_notes` text DEFAULT '' NOT NULL;