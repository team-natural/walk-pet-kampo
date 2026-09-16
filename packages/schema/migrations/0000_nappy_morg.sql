CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`log_name` text,
	`description` text NOT NULL,
	`subject_type` text,
	`subject_id` integer,
	`event` text,
	`causer_type` text,
	`causer_id` integer,
	`organization_id` integer,
	`properties` text,
	`batch_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_activity_log_subject` ON `activity_log` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE INDEX `idx_activity_log_causer` ON `activity_log` (`causer_type`,`causer_id`);--> statement-breakpoint
CREATE INDEX `idx_activity_log_log_name` ON `activity_log` (`log_name`);--> statement-breakpoint
CREATE INDEX `idx_activity_log_organization_id` ON `activity_log` (`organization_id`);--> statement-breakpoint
CREATE TABLE `admin_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`admin_user_id` integer NOT NULL,
	`session_token` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_admin_sessions_session_token` ON `admin_sessions` (`session_token`);--> statement-breakpoint
CREATE INDEX `idx_admin_sessions_admin_user_id` ON `admin_sessions` (`admin_user_id`);--> statement-breakpoint
CREATE INDEX `idx_admin_sessions_expires_at` ON `admin_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `admin_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`status` text NOT NULL,
	`last_login_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_admin_users_public_id` ON `admin_users` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_admin_users_email` ON `admin_users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_admin_users_status` ON `admin_users` (`status`);--> statement-breakpoint
CREATE TABLE `adoption_inquiries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`dog_id` integer NOT NULL,
	`organization_id` integer NOT NULL,
	`walker_id` integer NOT NULL,
	`motivation` text NOT NULL,
	`living_environment` text NOT NULL,
	`status` text NOT NULL,
	`organization_contacted_at` text,
	`closed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dogs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`walker_id`) REFERENCES `walkers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_adoption_inquiries_public_id` ON `adoption_inquiries` (`public_id`);--> statement-breakpoint
CREATE INDEX `idx_adoption_inquiries_organization_id_status` ON `adoption_inquiries` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_adoption_inquiries_dog_id` ON `adoption_inquiries` (`dog_id`);--> statement-breakpoint
CREATE INDEX `idx_adoption_inquiries_walker_id` ON `adoption_inquiries` (`walker_id`);--> statement-breakpoint
CREATE TABLE `dogs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`organization_id` integer NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`breed` text,
	`size` text,
	`weight` real,
	`gender` text,
	`estimated_age` text,
	`temperament` text,
	`human_sociability` text,
	`dog_sociability` text,
	`walk_notes` text,
	`required_experience` text NOT NULL,
	`beginner_allowed` integer DEFAULT 1 NOT NULL,
	`child_allowed` integer DEFAULT 0 NOT NULL,
	`multi_dog_allowed` integer DEFAULT 1 NOT NULL,
	`walk_eligible` integer DEFAULT 1 NOT NULL,
	`adoption_status` text NOT NULL,
	`introduction` text,
	`photo_key` text,
	`internal_notes` text,
	`is_published` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_dogs_public_id` ON `dogs` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_dogs_slug` ON `dogs` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_dogs_organization_id_is_published` ON `dogs` (`organization_id`,`is_published`);--> statement-breakpoint
CREATE INDEX `idx_dogs_adoption_status` ON `dogs` (`adoption_status`);--> statement-breakpoint
CREATE INDEX `idx_dogs_walk_eligible` ON `dogs` (`walk_eligible`);--> statement-breakpoint
CREATE TABLE `favorites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`walker_id` integer NOT NULL,
	`favoritable_type` text NOT NULL,
	`favoritable_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`walker_id`) REFERENCES `walkers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_favorites_walker_id_favoritable_type_favoritable_id` ON `favorites` (`walker_id`,`favoritable_type`,`favoritable_id`);--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`organization_id` integer NOT NULL,
	`reservation_id` integer,
	`dog_id` integer,
	`walker_id` integer,
	`severity` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`occurred_at` text NOT NULL,
	`location` text,
	`reported_by_type` text NOT NULL,
	`reported_by_id` integer NOT NULL,
	`status` text NOT NULL,
	`prevention_measures` text,
	`attachment_keys` text,
	`resolved_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dog_id`) REFERENCES `dogs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`walker_id`) REFERENCES `walkers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_incidents_public_id` ON `incidents` (`public_id`);--> statement-breakpoint
CREATE INDEX `idx_incidents_organization_id_status` ON `incidents` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_incidents_severity` ON `incidents` (`severity`);--> statement-breakpoint
CREATE INDEX `idx_incidents_reservation_id` ON `incidents` (`reservation_id`);--> statement-breakpoint
CREATE INDEX `idx_incidents_dog_id` ON `incidents` (`dog_id`);--> statement-breakpoint
CREATE INDEX `idx_incidents_walker_id` ON `incidents` (`walker_id`);--> statement-breakpoint
CREATE TABLE `inquiries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`type` text,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`message` text NOT NULL,
	`status` text NOT NULL,
	`handled_by` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`handled_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_inquiries_public_id` ON `inquiries` (`public_id`);--> statement-breakpoint
CREATE INDEX `idx_inquiries_status` ON `inquiries` (`status`);--> statement-breakpoint
CREATE INDEX `idx_inquiries_handled_by` ON `inquiries` (`handled_by`);--> statement-breakpoint
CREATE INDEX `idx_inquiries_created_at` ON `inquiries` (`created_at`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`organization_id` integer NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token` text NOT NULL,
	`inviter_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inviter_id`) REFERENCES `organization_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_invitations_public_id` ON `invitations` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_invitations_token` ON `invitations` (`token`);--> statement-breakpoint
CREATE INDEX `idx_invitations_organization_id` ON `invitations` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_invitations_inviter_id` ON `invitations` (`inviter_id`);--> statement-breakpoint
CREATE INDEX `idx_invitations_email` ON `invitations` (`email`);--> statement-breakpoint
CREATE INDEX `idx_invitations_status` ON `invitations` (`status`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`uploader_id` integer,
	`key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`alt_text` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`uploader_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_media_public_id` ON `media` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_media_key` ON `media` (`key`);--> statement-breakpoint
CREATE INDEX `idx_media_uploader_id` ON `media` (`uploader_id`);--> statement-breakpoint
CREATE TABLE `notification_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` integer NOT NULL,
	`notification_type` text NOT NULL,
	`email_enabled` integer DEFAULT 1 NOT NULL,
	`app_enabled` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_notification_settings_subject_type_subject_id_notification_type` ON `notification_settings` (`subject_type`,`subject_id`,`notification_type`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`recipient_type` text NOT NULL,
	`recipient_id` integer NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`read_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_notifications_public_id` ON `notifications` (`public_id`);--> statement-breakpoint
CREATE INDEX `idx_notifications_recipient_type_recipient_id_read_at` ON `notifications` (`recipient_type`,`recipient_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `organization_application_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_organization_application_tokens_token` ON `organization_application_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_organization_application_tokens_organization_id` ON `organization_application_tokens` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_organization_application_tokens_expires_at` ON `organization_application_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `organization_member_password_reset_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_member_id` integer NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`organization_member_id`) REFERENCES `organization_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_organization_member_password_reset_tokens_token` ON `organization_member_password_reset_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_organization_member_password_reset_tokens_organization_member_id` ON `organization_member_password_reset_tokens` (`organization_member_id`);--> statement-breakpoint
CREATE INDEX `idx_organization_member_password_reset_tokens_expires_at` ON `organization_member_password_reset_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `organization_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`status` text NOT NULL,
	`joined_at` text NOT NULL,
	`left_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_organization_members_email` ON `organization_members` (`email`);--> statement-breakpoint
CREATE INDEX `idx_organization_members_organization_id_status` ON `organization_members` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `organization_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_member_id` integer NOT NULL,
	`session_token` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`organization_member_id`) REFERENCES `organization_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_organization_sessions_session_token` ON `organization_sessions` (`session_token`);--> statement-breakpoint
CREATE INDEX `idx_organization_sessions_organization_member_id` ON `organization_sessions` (`organization_member_id`);--> statement-breakpoint
CREATE INDEX `idx_organization_sessions_expires_at` ON `organization_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`name` text NOT NULL,
	`name_kana` text,
	`slug` text NOT NULL,
	`org_type` text,
	`has_corporate_status` integer DEFAULT 0 NOT NULL,
	`representative_name` text NOT NULL,
	`contact_name` text,
	`postal_code` text,
	`address` text,
	`address_visibility` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`phone` text,
	`email` text,
	`website` text,
	`sns_links` text,
	`activity_area` text,
	`activity_started_on` text,
	`introduction` text,
	`protected_dog_count` integer,
	`adoption_track_record` text,
	`logo_key` text,
	`status` text NOT NULL,
	`reviewed_by` integer,
	`reviewed_at` text,
	`rejection_reason` text,
	`stripe_connect_account_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`reviewed_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_organizations_public_id` ON `organizations` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_organizations_slug` ON `organizations` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_organizations_status` ON `organizations` (`status`);--> statement-breakpoint
CREATE INDEX `idx_organizations_reviewed_by` ON `organizations` (`reviewed_by`);--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`admin_user_id` integer NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_password_reset_tokens_token` ON `password_reset_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_password_reset_tokens_admin_user_id` ON `password_reset_tokens` (`admin_user_id`);--> statement-breakpoint
CREATE INDEX `idx_password_reset_tokens_expires_at` ON `password_reset_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`reservation_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`organization_share_amount` integer NOT NULL,
	`platform_fee_amount` integer NOT NULL,
	`currency` text DEFAULT 'JPY' NOT NULL,
	`status` text NOT NULL,
	`stripe_payment_intent_id` text,
	`stripe_checkout_session_id` text,
	`paid_at` text,
	`refunded_at` text,
	`refund_amount` integer,
	`failure_reason` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_payments_public_id` ON `payments` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_payments_reservation_id` ON `payments` (`reservation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_payments_stripe_payment_intent_id` ON `payments` (`stripe_payment_intent_id`);--> statement-breakpoint
CREATE INDEX `idx_payments_status` ON `payments` (`status`);--> statement-breakpoint
CREATE TABLE `payouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`organization_id` integer NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`total_reservations` integer DEFAULT 0 NOT NULL,
	`total_participants` integer DEFAULT 0 NOT NULL,
	`gross_amount` integer NOT NULL,
	`adjustment_amount` integer DEFAULT 0 NOT NULL,
	`payout_amount` integer NOT NULL,
	`status` text NOT NULL,
	`stripe_transfer_id` text,
	`scheduled_at` text,
	`paid_at` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_payouts_public_id` ON `payouts` (`public_id`);--> statement-breakpoint
CREATE INDEX `idx_payouts_organization_id_period_start` ON `payouts` (`organization_id`,`period_start`);--> statement-breakpoint
CREATE INDEX `idx_payouts_status` ON `payouts` (`status`);--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`walk_slot_id` integer NOT NULL,
	`organization_id` integer NOT NULL,
	`walker_id` integer NOT NULL,
	`participant_count` integer DEFAULT 1 NOT NULL,
	`emergency_contact_name_snapshot` text NOT NULL,
	`emergency_contact_phone_snapshot` text NOT NULL,
	`status` text NOT NULL,
	`cancelled_reason` text,
	`cancelled_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`walk_slot_id`) REFERENCES `walk_slots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`walker_id`) REFERENCES `walkers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_reservations_public_id` ON `reservations` (`public_id`);--> statement-breakpoint
CREATE INDEX `idx_reservations_organization_id_status` ON `reservations` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_reservations_walker_id` ON `reservations` (`walker_id`);--> statement-breakpoint
CREATE INDEX `idx_reservations_walk_slot_id` ON `reservations` (`walk_slot_id`);--> statement-breakpoint
CREATE TABLE `stripe_event_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stripe_event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`processed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_stripe_event_logs_stripe_event_id` ON `stripe_event_logs` (`stripe_event_id`);--> statement-breakpoint
CREATE TABLE `walk_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`walk_slot_id` integer NOT NULL,
	`conducted` integer NOT NULL,
	`conducted_at` text,
	`staff_in_charge_id` integer,
	`dogs_walked` text,
	`photo_keys` text,
	`staff_comment` text,
	`incident_flag` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`walk_slot_id`) REFERENCES `walk_slots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`staff_in_charge_id`) REFERENCES `organization_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_walk_records_public_id` ON `walk_records` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_walk_records_walk_slot_id` ON `walk_records` (`walk_slot_id`);--> statement-breakpoint
CREATE INDEX `idx_walk_records_staff_in_charge_id` ON `walk_records` (`staff_in_charge_id`);--> statement-breakpoint
CREATE TABLE `walk_slot_dogs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`walk_slot_id` integer NOT NULL,
	`dog_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`walk_slot_id`) REFERENCES `walk_slots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dog_id`) REFERENCES `dogs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_walk_slot_dogs_walk_slot_id_dog_id` ON `walk_slot_dogs` (`walk_slot_id`,`dog_id`);--> statement-breakpoint
CREATE INDEX `idx_walk_slot_dogs_dog_id` ON `walk_slot_dogs` (`dog_id`);--> statement-breakpoint
CREATE TABLE `walk_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`organization_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`start_at` text NOT NULL,
	`acceptance_start_at` text NOT NULL,
	`acceptance_end_at` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`meeting_place` text NOT NULL,
	`area_prefecture` text NOT NULL,
	`area_city` text,
	`latitude` real,
	`longitude` real,
	`capacity` integer NOT NULL,
	`reserved_count` integer DEFAULT 0 NOT NULL,
	`fee_per_person` integer DEFAULT 500 NOT NULL,
	`staff_accompanied` integer DEFAULT 1 NOT NULL,
	`beginner_allowed` integer DEFAULT 1 NOT NULL,
	`child_allowed` integer DEFAULT 0 NOT NULL,
	`min_age` integer,
	`required_experience` text NOT NULL,
	`clothing_notes` text,
	`precautions` text,
	`weather_policy` text,
	`cancellation_policy` text,
	`status` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_walk_slots_public_id` ON `walk_slots` (`public_id`);--> statement-breakpoint
CREATE INDEX `idx_walk_slots_organization_id_status` ON `walk_slots` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_walk_slots_area_prefecture_start_at` ON `walk_slots` (`area_prefecture`,`start_at`);--> statement-breakpoint
CREATE INDEX `idx_walk_slots_status_start_at` ON `walk_slots` (`status`,`start_at`);--> statement-breakpoint
CREATE TABLE `walker_password_reset_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`walker_id` integer NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`walker_id`) REFERENCES `walkers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_walker_password_reset_tokens_token` ON `walker_password_reset_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_walker_password_reset_tokens_walker_id` ON `walker_password_reset_tokens` (`walker_id`);--> statement-breakpoint
CREATE INDEX `idx_walker_password_reset_tokens_expires_at` ON `walker_password_reset_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `walker_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`walker_id` integer NOT NULL,
	`name_kana` text,
	`birthdate` text NOT NULL,
	`gender` text,
	`postal_code` text,
	`address` text,
	`phone` text NOT NULL,
	`phone_verified_at` text,
	`emergency_contact_name` text NOT NULL,
	`emergency_contact_phone` text NOT NULL,
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
CREATE UNIQUE INDEX `uq_walker_profiles_public_id` ON `walker_profiles` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_walker_profiles_walker_id` ON `walker_profiles` (`walker_id`);--> statement-breakpoint
CREATE INDEX `idx_walker_profiles_status` ON `walker_profiles` (`status`);--> statement-breakpoint
CREATE TABLE `walker_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`walker_id` integer NOT NULL,
	`session_token` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`walker_id`) REFERENCES `walkers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_walker_sessions_session_token` ON `walker_sessions` (`session_token`);--> statement-breakpoint
CREATE INDEX `idx_walker_sessions_walker_id` ON `walker_sessions` (`walker_id`);--> statement-breakpoint
CREATE INDEX `idx_walker_sessions_expires_at` ON `walker_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `walkers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`status` text NOT NULL,
	`stripe_customer_id` text,
	`last_login_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_walkers_public_id` ON `walkers` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_walkers_email` ON `walkers` (`email`);--> statement-breakpoint
CREATE INDEX `idx_walkers_status` ON `walkers` (`status`);