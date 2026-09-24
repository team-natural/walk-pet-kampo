CREATE TABLE `walker_phone_verification_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`walker_id` integer NOT NULL,
	`phone` text NOT NULL,
	`code` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`walker_id`) REFERENCES `walkers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_walker_phone_verification_tokens_walker_id` ON `walker_phone_verification_tokens` (`walker_id`);--> statement-breakpoint
CREATE INDEX `idx_walker_phone_verification_tokens_expires_at` ON `walker_phone_verification_tokens` (`expires_at`);