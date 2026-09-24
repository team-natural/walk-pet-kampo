CREATE TABLE `organization_activation_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`email` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_organization_activation_tokens_token` ON `organization_activation_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_organization_activation_tokens_organization_id` ON `organization_activation_tokens` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_organization_activation_tokens_expires_at` ON `organization_activation_tokens` (`expires_at`);