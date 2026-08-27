CREATE TABLE `payment_provider_configs` (
	`provider` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`sandbox` integer DEFAULT false NOT NULL,
	`credentials_ciphertext` text DEFAULT '' NOT NULL,
	`credentials_iv` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text NOT NULL
);
