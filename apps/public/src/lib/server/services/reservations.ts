// Reservation (F-07-06, F-08-01). P11 covers the hold: `processing` on submit and
// `awaiting_payment` when the walker goes to pay. Everything past that is Stripe's webhook (P12).
import { organizations, reservations, walkSlots, walkerProfiles } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { ConflictError, InvalidStateTransitionError, NotFoundError, ValidationError } from "@app/server-kit/http";
import { assertWithinRateLimit } from "@app/server-kit/rate-limit";
import { and, eq } from "drizzle-orm";
import type { Session } from "../auth/session";
import { activityLogInsert, walkerActor } from "./activity-log";
import { countTakenSeats } from "./walk-slots";

type ReservationRow = typeof reservations.$inferSelect;
export type ReservationStatus = ReservationRow["status"];

// DEV-09 §2-7-2, transcribed. P11 only drives the first two rows; the rest are here because the
// table is the specification and a half-copied matrix is worse than none.
const TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  processing: ["awaiting_payment", "cancelled_by_walker"],
  awaiting_payment: ["confirmed", "cancelled_by_walker"],
  confirmed: ["organization_reviewing", "scheduled", "cancelled_by_walker", "cancelled_by_organization", "cancelled_by_platform", "cancelled_weather", "cancelled_dog_condition"],
  organization_reviewing: ["scheduled", "cancelled_by_walker", "cancelled_by_organization", "cancelled_by_platform", "cancelled_weather", "cancelled_dog_condition"],
  scheduled: ["completed", "cancelled_by_walker", "cancelled_by_organization", "cancelled_by_platform", "no_show", "cancelled_weather", "cancelled_dog_condition"],
  completed: [],
  cancelled_by_walker: [],
  cancelled_by_organization: [],
  cancelled_by_platform: [],
  no_show: [],
  cancelled_weather: [],
  cancelled_dog_condition: [],
};

export function allowedReservationTransitions(status: ReservationStatus): ReservationStatus[] {
  return TRANSITIONS[status] ?? [];
}

// GOV-01 D-025: the hold expires on its own, and the free-seat count already ignores an expired
// one. Thirty minutes is the checkout window.
const PAYMENT_WINDOW_MINUTES = 30;

// Why a reservation was refused, so the screen can send the walker somewhere useful instead of
// showing one generic error (DEV-09 §2-7-3).
export type ReservationBlock = "profile_incomplete" | "phone_unverified";

export class ReservationNotAllowedError extends Error {
  constructor(readonly reason: ReservationBlock) {
    super(reason);
  }
}

export interface ReservationInput {
  participantCount: number;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

export interface ReservationEligibility {
  /** Null when the walker may book. */
  block: ReservationBlock | null;
}

// One predicate, used by both the screen and the endpoint — the screen to explain, the endpoint
// to refuse. Two copies of this rule would drift the first time either changed.
export async function checkReservationEligibility(db: DbClient, walkerId: number): Promise<ReservationEligibility> {
  const [profile] = await db.select().from(walkerProfiles).where(eq(walkerProfiles.walkerId, walkerId)).limit(1);

  if (!profile || profile.status !== "active") return { block: "profile_incomplete" };
  // The phone check is separate from `status` on purpose: `active` means "may use the service",
  // and this means "we can reach them on the day" (GOV-01 D-036).
  if (!profile.phoneVerifiedAt) return { block: "phone_unverified" };
  return { block: null };
}

export async function createReservation(db: DbClient, kv: KVNamespace, session: Session, walkSlotPublicId: string, input: ReservationInput): Promise<{ publicId: string }> {
  // Before anything is read or written: a script holding seats is the abuse this endpoint invites
  // (DEV-02 §7, 10 per hour per Walker).
  await assertWithinRateLimit(kv, "reservationCreate", session.walkerId);

  const { block } = await checkReservationEligibility(db, session.walkerId);
  if (block) throw new ReservationNotAllowedError(block);

  const [slot] = await db.select().from(walkSlots).where(eq(walkSlots.publicId, walkSlotPublicId)).limit(1);
  if (!slot) throw new NotFoundError("おさんぽ募集が見つかりません。");

  const now = new Date().toISOString();
  if (slot.status !== "open") throw new ConflictError("このおさんぽは現在申し込みを受け付けていません。");
  if (now < slot.acceptanceStartAt) throw new ConflictError("このおさんぽの受付はまだ始まっていません。");
  if (now > slot.acceptanceEndAt) throw new ConflictError("このおさんぽの受付は終了しました。");

  if (input.participantCount < 1) throw new ValidationError({ participantCount: ["参加人数は 1 名以上で入力してください。"] });

  // Counted, not read from `reserved_count`: the stored counter does not know about expired holds
  // (GOV-01 D-025), and this is the number the walker was shown.
  const taken = await countTakenSeats(db, slot.id);
  if (slot.capacity - taken < input.participantCount) throw new ConflictError("空きが足りません。人数を減らすか、ほかのおさんぽをお選びください。");

  const publicId = ulid();
  await db.batch([
    db.insert(reservations).values({
      publicId,
      // The deadline starts here, not at the payment step: a walker who closes the tab half-way
      // through the form must not hold the seat until the walk happens (GOV-01 D-025).
      expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60 * 1000).toISOString(),
      walkSlotId: slot.id,
      organizationId: slot.organizationId,
      walkerId: session.walkerId,
      participantCount: input.participantCount,
      // Snapshotted: the profile can change after booking, and the staff on the day need what was
      // agreed at booking time (DEV-07 §5-11).
      emergencyContactNameSnapshot: input.emergencyContactName,
      emergencyContactPhoneSnapshot: input.emergencyContactPhone,
      status: "processing",
      updatedAt: now,
    }),
    activityLogInsert(db, {
      logName: "reservation",
      description: `Reservation created (${slot.title})`,
      subjectType: "Reservation",
      event: "reservation.processing",
      actor: walkerActor(session.walkerId),
      organizationId: slot.organizationId,
      properties: { walkSlotPublicId, participantCount: input.participantCount },
    }),
  ]);

  return { publicId };
}

async function findOwnReservation(db: DbClient, walkerId: number, publicId: string): Promise<ReservationRow> {
  const [row] = await db
    .select()
    .from(reservations)
    .where(and(eq(reservations.publicId, publicId), eq(reservations.walkerId, walkerId)))
    .limit(1);
  if (!row) throw new NotFoundError("予約が見つかりません。");
  return row;
}

// The only writer of `reservations.status` on this side. P12's webhook and P13's cancellations
// come through here too.
export async function transitionReservation(db: DbClient, walkerId: number, publicId: string, to: ReservationStatus, extra: Partial<typeof reservations.$inferInsert> = {}): Promise<void> {
  const row = await findOwnReservation(db, walkerId, publicId);
  const from = row.status;
  if (from === to) return;
  if (!allowedReservationTransitions(from).includes(to)) throw new InvalidStateTransitionError("Reservation", from, to);

  const now = new Date().toISOString();
  await db.batch([
    db
      .update(reservations)
      .set({ status: to, updatedAt: now, ...extra })
      .where(eq(reservations.id, row.id)),
    activityLogInsert(db, {
      logName: "reservation",
      description: `Reservation ${from} -> ${to}`,
      subjectType: "Reservation",
      subjectId: row.id,
      event: `reservation.${to}`,
      actor: walkerActor(walkerId),
      organizationId: row.organizationId,
      properties: { from, to },
    }),
  ]);
}

// SCR-18's entry point: the walker confirmed the details and is going to pay. The deadline is set
// here because it is what makes the seat releasable without a Cron (GOV-01 D-025).
export async function startPayment(db: DbClient, walkerId: number, publicId: string): Promise<{ expiresAt: string }> {
  const expiresAt = new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60 * 1000).toISOString();
  await transitionReservation(db, walkerId, publicId, "awaiting_payment", { expiresAt });
  return { expiresAt };
}

export interface OwnReservationView {
  id: string;
  status: ReservationStatus;
  participantCount: number;
  emergencyContactName: string;
  emergencyContactPhone: string;
  expiresAt: string | null;
  amount: number;
  walkSlot: { id: string; title: string; startAt: string; durationMinutes: number; meetingPlace: string; feePerPerson: number; organizationName: string };
}

export async function getOwnReservation(db: DbClient, walkerId: number, publicId: string): Promise<OwnReservationView> {
  const row = await findOwnReservation(db, walkerId, publicId);
  const [joined] = await db.select({ slot: walkSlots, organizationName: organizations.name }).from(walkSlots).innerJoin(organizations, eq(walkSlots.organizationId, organizations.id)).where(eq(walkSlots.id, row.walkSlotId)).limit(1);
  const slot = joined!.slot;

  return {
    id: row.publicId,
    status: row.status,
    participantCount: row.participantCount,
    emergencyContactName: row.emergencyContactNameSnapshot,
    emergencyContactPhone: row.emergencyContactPhoneSnapshot,
    expiresAt: row.expiresAt,
    amount: slot!.feePerPerson * row.participantCount,
    walkSlot: { id: slot.publicId, title: slot.title, startAt: slot.startAt, durationMinutes: slot.durationMinutes, meetingPlace: slot.meetingPlace, feePerPerson: slot.feePerPerson, organizationName: joined!.organizationName },
  };
}
