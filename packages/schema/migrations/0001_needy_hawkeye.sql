ALTER TABLE `reservations` ADD `expires_at` text;--> statement-breakpoint
CREATE INDEX `idx_reservations_status_expires_at` ON `reservations` (`status`,`expires_at`);