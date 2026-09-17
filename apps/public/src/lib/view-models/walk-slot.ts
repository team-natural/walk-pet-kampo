import type { walkSlots } from "@app/schema";
import type { DogSummary } from "./dog";
import type { OrganizationSummary } from "./organization";

type Row = typeof walkSlots.$inferSelect;

// `reservedCount` is the stored counter. A screen showing remaining seats must not subtract it
// from `capacity` directly — expired awaiting_payment reservations are excluded at count time
// (GOV-01 D-025), so the Service supplies `remainingCapacity` and the page renders that.
export type WalkSlotSummary = { id: string; remainingCapacity: number } & Pick<Row, "title" | "startAt" | "durationMinutes" | "areaPrefecture" | "areaCity" | "capacity" | "feePerPerson" | "status" | "beginnerAllowed">;

export type WalkSlotDetail = WalkSlotSummary & { organization: OrganizationSummary; dogs: DogSummary[] } & Pick<Row, "description" | "meetingPlace" | "latitude" | "longitude" | "acceptanceStartAt" | "acceptanceEndAt" | "staffAccompanied" | "childAllowed" | "minAge" | "requiredExperience" | "clothingNotes" | "precautions" | "weatherPolicy" | "cancellationPolicy">;
