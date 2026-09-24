import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Generated from DEV-07 (docs/3-development/07-database-schema.md) by the schema-build skill.
// DEV-07 is the source of truth: change it first, then regenerate. Enum values must stay
// byte-for-byte identical to the state names in PRD-01 §7 and DEV-09.

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

// ---------------------------------------------------------------------------
// Standard tables (DEV-07 §4)
// ---------------------------------------------------------------------------

export const adminUsers = sqliteTable(
  "admin_users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: text("status", { enum: ["active", "inactive"] }).notNull(),
    lastLoginAt: text("last_login_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_admin_users_public_id").on(table.publicId), uniqueIndex("uq_admin_users_email").on(table.email), index("idx_admin_users_status").on(table.status)],
);

export const adminSessions = sqliteTable(
  "admin_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    adminUserId: integer("admin_user_id")
      .notNull()
      .references(() => adminUsers.id),
    sessionToken: text("session_token").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("uq_admin_sessions_session_token").on(table.sessionToken), index("idx_admin_sessions_admin_user_id").on(table.adminUserId), index("idx_admin_sessions_expires_at").on(table.expiresAt)],
);

export const passwordResetTokens = sqliteTable(
  "password_reset_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    adminUserId: integer("admin_user_id")
      .notNull()
      .references(() => adminUsers.id),
    token: text("token").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("uq_password_reset_tokens_token").on(table.token), index("idx_password_reset_tokens_admin_user_id").on(table.adminUserId), index("idx_password_reset_tokens_expires_at").on(table.expiresAt)],
);

// Row metadata for an object in R2; `key` is the object key. Delete this table and the BUCKET
// binding together — neither is useful without the other.
export const media = sqliteTable(
  "media",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    uploaderId: integer("uploader_id").references(() => adminUsers.id),
    key: text("key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    altText: text("alt_text"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_media_public_id").on(table.publicId), uniqueIndex("uq_media_key").on(table.key), index("idx_media_uploader_id").on(table.uploaderId)],
);

export const inquiries = sqliteTable(
  "inquiries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    type: text("type"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    message: text("message").notNull(),
    status: text("status", { enum: ["new", "in_progress", "resolved"] }).notNull(),
    handledBy: integer("handled_by").references(() => adminUsers.id),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_inquiries_public_id").on(table.publicId), index("idx_inquiries_status").on(table.status), index("idx_inquiries_handled_by").on(table.handledBy), index("idx_inquiries_created_at").on(table.createdAt)],
);

// ---------------------------------------------------------------------------
// Walker — public-side participant account (DEV-07 §5-1〜§5-3, §5-23)
// ---------------------------------------------------------------------------

// One of three account systems that share no table, cookie or code path (DEV-02 §1-4). An
// AdminUser or OrganizationMember token must never authenticate here.
export const walkers = sqliteTable(
  "walkers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: text("email_verified_at"),
    // Account-level only. Whether this walker may reserve is walker_profiles.status.
    status: text("status", { enum: ["active", "suspended"] }).notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    lastLoginAt: text("last_login_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_walkers_public_id").on(table.publicId), uniqueIndex("uq_walkers_email").on(table.email), index("idx_walkers_status").on(table.status)],
);

export const walkerSessions = sqliteTable(
  "walker_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    walkerId: integer("walker_id")
      .notNull()
      .references(() => walkers.id),
    sessionToken: text("session_token").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("uq_walker_sessions_session_token").on(table.sessionToken), index("idx_walker_sessions_walker_id").on(table.walkerId), index("idx_walker_sessions_expires_at").on(table.expiresAt)],
);

export const walkerProfiles = sqliteTable(
  "walker_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    walkerId: integer("walker_id")
      .notNull()
      .references(() => walkers.id),
    nameKana: text("name_kana"),
    // Nullable although the business requires them: registration (SCR-08) collects four fields
    // and these arrive with the profile form. `status` carries the requirement instead, and
    // `active` — the state reservations need — is unreachable until they are filled
    // (DEV-07 §5-3-1).
    birthdate: text("birthdate"),
    gender: text("gender"),
    postalCode: text("postal_code"),
    address: text("address"),
    phone: text("phone"),
    // Filled at the first reservation, not at signup (GOV-01 D-036): an unverified number is
    // only dangerous once someone is actually going to meet a dog.
    phoneVerifiedAt: text("phone_verified_at"),
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactPhone: text("emergency_contact_phone"),
    dogExperience: integer("dog_experience").notNull().default(0),
    largeDogWalkExperience: integer("large_dog_walk_experience").notNull().default(0),
    preferredArea: text("preferred_area"),
    guardianName: text("guardian_name"),
    guardianPhone: text("guardian_phone"),
    termsAgreedAt: text("terms_agreed_at"),
    // Which version was agreed to, not just when — a date alone cannot answer that after a
    // revision, and re-consent (F-01-06) is decided by comparing this with TERMS_VERSION.
    termsAgreedVersion: text("terms_agreed_version"),
    status: text("status", { enum: ["provisional", "pending_verification", "active", "restricted", "suspended", "withdrawn"] }).notNull(),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_walker_profiles_public_id").on(table.publicId), uniqueIndex("uq_walker_profiles_walker_id").on(table.walkerId), index("idx_walker_profiles_status").on(table.status)],
);

export const walkerPasswordResetTokens = sqliteTable(
  "walker_password_reset_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    walkerId: integer("walker_id")
      .notNull()
      .references(() => walkers.id),
    token: text("token").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("uq_walker_password_reset_tokens_token").on(table.token), index("idx_walker_password_reset_tokens_walker_id").on(table.walkerId), index("idx_walker_password_reset_tokens_expires_at").on(table.expiresAt)],
);

// Same shape as the reset tokens above, deliberately a separate table: one table with a
// `purpose` column means a single forgotten filter turns a verification link into a password
// reset (DEV-07 §5-26, same reasoning as GOV-01 D-020).
export const walkerEmailVerificationTokens = sqliteTable(
  "walker_email_verification_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    walkerId: integer("walker_id")
      .notNull()
      .references(() => walkers.id),
    token: text("token").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("uq_walker_email_verification_tokens_token").on(table.token), index("idx_walker_email_verification_tokens_walker_id").on(table.walkerId), index("idx_walker_email_verification_tokens_expires_at").on(table.expiresAt)],
);

// ---------------------------------------------------------------------------
// Organization — tenant and its staff accounts (DEV-07 §5-4〜§5-7, §5-24, §5-25)
// ---------------------------------------------------------------------------

export const organizations = sqliteTable(
  "organizations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    name: text("name").notNull(),
    nameKana: text("name_kana"),
    slug: text("slug").notNull(),
    orgType: text("org_type"),
    hasCorporateStatus: integer("has_corporate_status").notNull().default(0),
    representativeName: text("representative_name").notNull(),
    contactName: text("contact_name"),
    postalCode: text("postal_code"),
    address: text("address"),
    addressVisibility: text("address_visibility", { enum: ["prefecture_only", "city_only", "reservation_confirmed_only"] }).notNull(),
    latitude: real("latitude"),
    longitude: real("longitude"),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    snsLinks: text("sns_links"),
    activityArea: text("activity_area"),
    activityStartedOn: text("activity_started_on"),
    introduction: text("introduction"),
    protectedDogCount: integer("protected_dog_count"),
    adoptionTrackRecord: text("adoption_track_record"),
    logoKey: text("logo_key"),
    status: text("status", { enum: ["pending_review", "under_review", "needs_more_info", "approved", "rejected", "suspended", "deactivated", "withdrawn"] }).notNull(),
    reviewedBy: integer("reviewed_by").references(() => adminUsers.id),
    reviewedAt: text("reviewed_at"),
    rejectionReason: text("rejection_reason"),
    // The Connect account, never the bank details themselves.
    stripeConnectAccountId: text("stripe_connect_account_id"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_organizations_public_id").on(table.publicId), uniqueIndex("uq_organizations_slug").on(table.slug), index("idx_organizations_status").on(table.status), index("idx_organizations_reviewed_by").on(table.reviewedBy)],
);

// Holds its own credentials, unlike the template's membership pattern: this is a third account
// system, not a role attached to an existing one (PRD-01 §3-1).
export const organizationMembers = sqliteTable(
  "organization_members",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    role: text("role", { enum: ["org_admin", "org_staff"] }).notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: text("status", { enum: ["invited", "active", "suspended"] }).notNull(),
    joinedAt: text("joined_at").notNull(),
    leftAt: text("left_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_organization_members_email").on(table.email), index("idx_organization_members_organization_id_status").on(table.organizationId, table.status)],
);

export const organizationSessions = sqliteTable(
  "organization_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationMemberId: integer("organization_member_id")
      .notNull()
      .references(() => organizationMembers.id),
    sessionToken: text("session_token").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("uq_organization_sessions_session_token").on(table.sessionToken), index("idx_organization_sessions_organization_member_id").on(table.organizationMemberId), index("idx_organization_sessions_expires_at").on(table.expiresAt)],
);

// Separate from walker_password_reset_tokens on purpose: a shared table would need a
// subject_type filter on every lookup, and omitting it lets one system's token reset the
// other's password (GOV-01 D-020).
export const organizationMemberPasswordResetTokens = sqliteTable(
  "organization_member_password_reset_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationMemberId: integer("organization_member_id")
      .notNull()
      .references(() => organizationMembers.id),
    token: text("token").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("uq_organization_member_password_reset_tokens_token").on(table.token), index("idx_organization_member_password_reset_tokens_organization_member_id").on(table.organizationMemberId), index("idx_organization_member_password_reset_tokens_expires_at").on(table.expiresAt)],
);

// Scoped to the application, not to an account: the applicant has none until approval
// (F-03-06), so this token carries the whole identity claim for the resubmission screen.
export const organizationApplicationTokens = sqliteTable(
  "organization_application_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    token: text("token").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("uq_organization_application_tokens_token").on(table.token), index("idx_organization_application_tokens_organization_id").on(table.organizationId), index("idx_organization_application_tokens_expires_at").on(table.expiresAt)],
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    email: text("email").notNull(),
    role: text("role", { enum: ["org_admin", "org_staff"] }).notNull(),
    token: text("token").notNull(),
    inviterId: integer("inviter_id")
      .notNull()
      .references(() => organizationMembers.id),
    status: text("status", { enum: ["pending", "accepted", "expired"] })
      .notNull()
      .default("pending"),
    expiresAt: text("expires_at").notNull(),
    acceptedAt: text("accepted_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_invitations_public_id").on(table.publicId), uniqueIndex("uq_invitations_token").on(table.token), index("idx_invitations_organization_id").on(table.organizationId), index("idx_invitations_inviter_id").on(table.inviterId), index("idx_invitations_email").on(table.email), index("idx_invitations_status").on(table.status)],
);

// ---------------------------------------------------------------------------
// Dogs and walk slots (DEV-07 §5-8〜§5-10)
// ---------------------------------------------------------------------------

export const dogs = sqliteTable(
  "dogs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    breed: text("breed"),
    size: text("size", { enum: ["small", "medium", "large"] }),
    weight: real("weight"),
    gender: text("gender"),
    estimatedAge: text("estimated_age"),
    temperament: text("temperament"),
    humanSociability: text("human_sociability"),
    dogSociability: text("dog_sociability"),
    walkNotes: text("walk_notes"),
    requiredExperience: text("required_experience", { enum: ["none", "some", "experienced"] }).notNull(),
    beginnerAllowed: integer("beginner_allowed").notNull().default(1),
    childAllowed: integer("child_allowed").notNull().default(0),
    multiDogAllowed: integer("multi_dog_allowed").notNull().default(1),
    walkEligible: integer("walk_eligible").notNull().default(1),
    adoptionStatus: text("adoption_status", { enum: ["not_listed", "listed", "in_consultation", "in_trial", "adopted", "listing_closed"] }).notNull(),
    introduction: text("introduction"),
    photoKey: text("photo_key"),
    // Health, bite and escape history. org_staff and above only — the Service layer enforces
    // it, so never select this column into a response shared with a walker.
    internalNotes: text("internal_notes"),
    isPublished: integer("is_published").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_dogs_public_id").on(table.publicId), uniqueIndex("uq_dogs_slug").on(table.slug), index("idx_dogs_organization_id_is_published").on(table.organizationId, table.isPublished), index("idx_dogs_adoption_status").on(table.adoptionStatus), index("idx_dogs_walk_eligible").on(table.walkEligible)],
);

export const walkSlots = sqliteTable(
  "walk_slots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    title: text("title").notNull(),
    description: text("description"),
    startAt: text("start_at").notNull(),
    acceptanceStartAt: text("acceptance_start_at").notNull(),
    acceptanceEndAt: text("acceptance_end_at").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    meetingPlace: text("meeting_place").notNull(),
    areaPrefecture: text("area_prefecture").notNull(),
    areaCity: text("area_city"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    capacity: integer("capacity").notNull(),
    // Maintained by the Service layer on reserve/cancel, not by a DB trigger.
    reservedCount: integer("reserved_count").notNull().default(0),
    feePerPerson: integer("fee_per_person").notNull().default(500),
    staffAccompanied: integer("staff_accompanied").notNull().default(1),
    beginnerAllowed: integer("beginner_allowed").notNull().default(1),
    childAllowed: integer("child_allowed").notNull().default(0),
    minAge: integer("min_age"),
    requiredExperience: text("required_experience", { enum: ["none", "some", "experienced"] }).notNull(),
    clothingNotes: text("clothing_notes"),
    precautions: text("precautions"),
    weatherPolicy: text("weather_policy"),
    cancellationPolicy: text("cancellation_policy"),
    status: text("status", { enum: ["draft", "scheduled", "open", "full", "closed", "cancelled", "completed", "unpublished"] }).notNull(),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_walk_slots_public_id").on(table.publicId), index("idx_walk_slots_organization_id_status").on(table.organizationId, table.status), index("idx_walk_slots_area_prefecture_start_at").on(table.areaPrefecture, table.startAt), index("idx_walk_slots_status_start_at").on(table.status, table.startAt)],
);

export const walkSlotDogs = sqliteTable(
  "walk_slot_dogs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    walkSlotId: integer("walk_slot_id")
      .notNull()
      .references(() => walkSlots.id),
    dogId: integer("dog_id")
      .notNull()
      .references(() => dogs.id),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("uq_walk_slot_dogs_walk_slot_id_dog_id").on(table.walkSlotId, table.dogId), index("idx_walk_slot_dogs_dog_id").on(table.dogId)],
);

// ---------------------------------------------------------------------------
// Reservations, payments and payouts (DEV-07 §5-11〜§5-13)
// ---------------------------------------------------------------------------

export const reservations = sqliteTable(
  "reservations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    walkSlotId: integer("walk_slot_id")
      .notNull()
      .references(() => walkSlots.id),
    // Denormalised from walk_slots so the organization's own lists filter without a join.
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    walkerId: integer("walker_id")
      .notNull()
      .references(() => walkers.id),
    participantCount: integer("participant_count").notNull().default(1),
    // Snapshotted: the profile can change after booking, and the staff on the day need what
    // was agreed at booking time.
    emergencyContactNameSnapshot: text("emergency_contact_name_snapshot").notNull(),
    emergencyContactPhoneSnapshot: text("emergency_contact_phone_snapshot").notNull(),
    status: text("status", {
      enum: ["processing", "awaiting_payment", "confirmed", "organization_reviewing", "scheduled", "completed", "cancelled_by_walker", "cancelled_by_organization", "cancelled_by_platform", "no_show", "cancelled_weather", "cancelled_dog_condition"],
    }).notNull(),
    // Free-seat counts exclude awaiting_payment rows past this instant, so a stalled checkout
    // releases the slot without waiting for the cleanup cron to fire.
    expiresAt: text("expires_at"),
    cancelledReason: text("cancelled_reason"),
    cancelledAt: text("cancelled_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_reservations_public_id").on(table.publicId), index("idx_reservations_organization_id_status").on(table.organizationId, table.status), index("idx_reservations_walker_id").on(table.walkerId), index("idx_reservations_walk_slot_id").on(table.walkSlotId), index("idx_reservations_status_expires_at").on(table.status, table.expiresAt)],
);

export const payments = sqliteTable(
  "payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    reservationId: integer("reservation_id")
      .notNull()
      .references(() => reservations.id),
    amount: integer("amount").notNull(),
    organizationShareAmount: integer("organization_share_amount").notNull(),
    platformFeeAmount: integer("platform_fee_amount").notNull(),
    currency: text("currency").notNull().default("JPY"),
    status: text("status", { enum: ["unpaid", "processing", "paid", "failed", "refund_processing", "refunded", "partially_refunded"] }).notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    paidAt: text("paid_at"),
    refundedAt: text("refunded_at"),
    refundAmount: integer("refund_amount"),
    failureReason: text("failure_reason"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_payments_public_id").on(table.publicId), uniqueIndex("uq_payments_reservation_id").on(table.reservationId), uniqueIndex("uq_payments_stripe_payment_intent_id").on(table.stripePaymentIntentId), index("idx_payments_status").on(table.status)],
);

export const payouts = sqliteTable(
  "payouts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    totalReservations: integer("total_reservations").notNull().default(0),
    totalParticipants: integer("total_participants").notNull().default(0),
    grossAmount: integer("gross_amount").notNull(),
    // Refunds and reversals land here and may be negative.
    adjustmentAmount: integer("adjustment_amount").notNull().default(0),
    payoutAmount: integer("payout_amount").notNull(),
    status: text("status", { enum: ["uncollected", "aggregating", "confirmed", "scheduled", "paid", "on_hold", "failed"] }).notNull(),
    stripeTransferId: text("stripe_transfer_id"),
    scheduledAt: text("scheduled_at"),
    paidAt: text("paid_at"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_payouts_public_id").on(table.publicId), index("idx_payouts_organization_id_period_start").on(table.organizationId, table.periodStart), index("idx_payouts_status").on(table.status)],
);

// ---------------------------------------------------------------------------
// Post-walk records, incidents and adoption (DEV-07 §5-14〜§5-16)
// ---------------------------------------------------------------------------

export const walkRecords = sqliteTable(
  "walk_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    walkSlotId: integer("walk_slot_id")
      .notNull()
      .references(() => walkSlots.id),
    conducted: integer("conducted").notNull(),
    conductedAt: text("conducted_at"),
    staffInChargeId: integer("staff_in_charge_id").references(() => organizationMembers.id),
    dogsWalked: text("dogs_walked"),
    photoKeys: text("photo_keys"),
    staffComment: text("staff_comment"),
    incidentFlag: integer("incident_flag").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_walk_records_public_id").on(table.publicId), uniqueIndex("uq_walk_records_walk_slot_id").on(table.walkSlotId), index("idx_walk_records_staff_in_charge_id").on(table.staffInChargeId)],
);

// The reporter can be any of the three account systems, so it is polymorphic rather than a FK
// — the same shape as activity_log.causer_type.
export const incidents = sqliteTable(
  "incidents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    reservationId: integer("reservation_id").references(() => reservations.id),
    dogId: integer("dog_id").references(() => dogs.id),
    walkerId: integer("walker_id").references(() => walkers.id),
    severity: text("severity", { enum: ["P0", "P1", "P2", "P3"] }).notNull(),
    category: text("category", { enum: ["bite", "escape", "injury", "dog_condition", "walker_condition", "property_damage", "interpersonal_trouble", "unauthorized_photo", "harassment", "other"] }).notNull(),
    description: text("description").notNull(),
    occurredAt: text("occurred_at").notNull(),
    location: text("location"),
    reportedByType: text("reported_by_type", { enum: ["walker", "organization_member", "admin_user"] }).notNull(),
    reportedById: integer("reported_by_id").notNull(),
    status: text("status", { enum: ["reported", "investigating", "in_progress", "resolved", "closed"] }).notNull(),
    preventionMeasures: text("prevention_measures"),
    attachmentKeys: text("attachment_keys"),
    resolvedAt: text("resolved_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_incidents_public_id").on(table.publicId), index("idx_incidents_organization_id_status").on(table.organizationId, table.status), index("idx_incidents_severity").on(table.severity), index("idx_incidents_reservation_id").on(table.reservationId), index("idx_incidents_dog_id").on(table.dogId), index("idx_incidents_walker_id").on(table.walkerId)],
);

export const adoptionInquiries = sqliteTable(
  "adoption_inquiries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    dogId: integer("dog_id")
      .notNull()
      .references(() => dogs.id),
    // Denormalised from dogs, as on reservations.
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    walkerId: integer("walker_id")
      .notNull()
      .references(() => walkers.id),
    motivation: text("motivation").notNull(),
    livingEnvironment: text("living_environment").notNull(),
    status: text("status", { enum: ["received", "organization_reviewing", "contacted", "interview_scheduled", "transferred_to_organization_process", "closed", "withdrawn"] }).notNull(),
    organizationContactedAt: text("organization_contacted_at"),
    closedAt: text("closed_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_adoption_inquiries_public_id").on(table.publicId), index("idx_adoption_inquiries_organization_id_status").on(table.organizationId, table.status), index("idx_adoption_inquiries_dog_id").on(table.dogId), index("idx_adoption_inquiries_walker_id").on(table.walkerId)],
);

// ---------------------------------------------------------------------------
// Favorites, notifications and Stripe bookkeeping (DEV-07 §5-17〜§5-20)
// ---------------------------------------------------------------------------

export const favorites = sqliteTable(
  "favorites",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    walkerId: integer("walker_id")
      .notNull()
      .references(() => walkers.id),
    favoritableType: text("favoritable_type", { enum: ["Organization", "Dog"] }).notNull(),
    favoritableId: integer("favoritable_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("uq_favorites_walker_id_favoritable_type_favoritable_id").on(table.walkerId, table.favoritableType, table.favoritableId)],
);

export const notificationSettings = sqliteTable(
  "notification_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    subjectType: text("subject_type", { enum: ["walker", "organization_member"] }).notNull(),
    subjectId: integer("subject_id").notNull(),
    notificationType: text("notification_type").notNull(),
    emailEnabled: integer("email_enabled").notNull().default(1),
    appEnabled: integer("app_enabled").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_notification_settings_subject_type_subject_id_notification_type").on(table.subjectType, table.subjectId, table.notificationType)],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull(),
    recipientType: text("recipient_type", { enum: ["walker", "organization_member"] }).notNull(),
    recipientId: integer("recipient_id").notNull(),
    type: text("type").notNull(),
    payload: text("payload").notNull(),
    readAt: text("read_at"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("uq_notifications_public_id").on(table.publicId), index("idx_notifications_recipient_type_recipient_id_read_at").on(table.recipientType, table.recipientId, table.readAt)],
);

// Webhook idempotency: Stripe redelivers, and a replayed payment or transfer event must not
// move the same reservation twice.
export const stripeEventLogs = sqliteTable(
  "stripe_event_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    stripeEventId: text("stripe_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: text("payload").notNull(),
    processedAt: text("processed_at"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("uq_stripe_event_logs_stripe_event_id").on(table.stripeEventId)],
);

// ---------------------------------------------------------------------------
// Audit log (DEV-07 §4-4) — last, because organization_id references organizations
// ---------------------------------------------------------------------------

// Spans all three account systems, so the actor is polymorphic rather than a foreign key.
export const activityLog = sqliteTable(
  "activity_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    logName: text("log_name"),
    description: text("description").notNull(),
    subjectType: text("subject_type"),
    subjectId: integer("subject_id"),
    event: text("event"),
    causerType: text("causer_type"),
    causerId: integer("causer_id"),
    // NULL for platform-wide actions that belong to no tenant.
    organizationId: integer("organization_id").references(() => organizations.id),
    properties: text("properties"),
    batchId: text("batch_id"),
    createdAt: createdAt(),
  },
  (table) => [index("idx_activity_log_subject").on(table.subjectType, table.subjectId), index("idx_activity_log_causer").on(table.causerType, table.causerId), index("idx_activity_log_log_name").on(table.logName), index("idx_activity_log_organization_id").on(table.organizationId)],
);
