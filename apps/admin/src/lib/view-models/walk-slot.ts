import type { walkSlots } from "@app/schema";

type Row = typeof walkSlots.$inferSelect;

export type WalkSlotSummary = { id: string; organizationName: string } & Pick<Row, "title" | "startAt" | "areaPrefecture" | "areaCity" | "capacity" | "reservedCount" | "feePerPerson" | "status">;

export type WalkSlotDetail = WalkSlotSummary & Pick<Row, "description" | "acceptanceStartAt" | "acceptanceEndAt" | "durationMinutes" | "meetingPlace" | "latitude" | "longitude" | "staffAccompanied" | "beginnerAllowed" | "childAllowed" | "minAge" | "requiredExperience" | "clothingNotes" | "precautions" | "weatherPolicy" | "cancellationPolicy" | "updatedAt">;
