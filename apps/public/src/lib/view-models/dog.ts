import type { dogs } from "@app/schema";

type Row = typeof dogs.$inferSelect;

// `internalNotes` is staff-only (PRD-04 §4-3) — it must never appear in a view model a public
// page renders. `organizationId` stays internal: re-expose it only as the organization's slug.
export type DogSummary = { id: string } & Pick<Row, "slug" | "name" | "breed" | "size" | "gender" | "estimatedAge" | "adoptionStatus" | "photoKey" | "walkEligible">;

export type DogDetail = DogSummary & Pick<Row, "weight" | "temperament" | "humanSociability" | "dogSociability" | "walkNotes" | "requiredExperience" | "beginnerAllowed" | "childAllowed" | "multiDogAllowed" | "introduction">;
