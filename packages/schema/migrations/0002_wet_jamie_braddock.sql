CREATE TABLE `walker_email_verification_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`walker_id` integer NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`walker_id`) REFERENCES `walkers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_walker_email_verification_tokens_token` ON `walker_email_verification_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_walker_email_verification_tokens_walker_id` ON `walker_email_verification_tokens` (`walker_id`);--> statement-breakpoint
CREATE INDEX `idx_walker_email_verification_tokens_expires_at` ON `walker_email_verification_tokens` (`expires_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_walker_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`walker_id` integer NOT NULL,
	`name_kana` text,
	`birthdate` text,
	`gender` text,
	`postal_code` text,
	`address` text,
	`phone` text,
	`phone_verified_at` text,
	`emergency_contact_name` text,
	`emergency_contact_phone` text,
	`dog_experience` integer DEFAULT 0 NOT NULL,
	`large_dog_walk_experience` integer DEFAULT 0 NOT NULL,
	`preferred_area` text,
	`guardian_name` text,
	`guardian_phone` text,
	`terms_agreed_at` text,
	`terms_agreed_version` text,
	`status` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`walker_id`) REFERENCES `walkers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_walker_profiles`("id", "public_id", "walker_id", "name_kana", "birthdate", "gender", "postal_code", "address", "phone", "phone_verified_at", "emergency_contact_name", "emergency_contact_phone", "dog_experience", "large_dog_walk_experience", "preferred_area", "guardian_name", "guardian_phone", "terms_agreed_at", "terms_agreed_version", "status", "created_at", "updated_at") SELECT "id", "public_id", "walker_id", "name_kana", "birthdate", "gender", "postal_code", "address", "phone", "phone_verified_at", "emergency_contact_name", "emergency_contact_phone", "dog_experience", "large_dog_walk_experience", "preferred_area", "guardian_name", "guardian_phone", "terms_agreed_at", "terms_agreed_version", "status", "created_at", "updated_at" FROM `walker_profiles`;--> statement-breakpoint
DROP TABLE `walker_profiles`;--> statement-breakpoint
ALTER TABLE `__new_walker_profiles` RENAME TO `walker_profiles`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_walker_profiles_public_id` ON `walker_profiles` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_walker_profiles_walker_id` ON `walker_profiles` (`walker_id`);--> statement-breakpoint
CREATE INDEX `idx_walker_profiles_status` ON `walker_profiles` (`status`);--> statement-breakpoint
ALTER TABLE `walkers` ADD `email_verified_at` text;