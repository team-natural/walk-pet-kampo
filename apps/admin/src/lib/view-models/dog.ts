import type { dogs } from "@app/schema";

type Row = typeof dogs.$inferSelect;

// Unlike apps/public's DogSummary, the operator console does render `internalNotes` — it is the
// cross-organization view (SYS-09/10) and staff-only fields are in scope here.
export type DogSummary = { id: string; organizationName: string } & Pick<Row, "slug" | "name" | "breed" | "size" | "adoptionStatus" | "walkEligible" | "isPublished">;

export type DogDetail = DogSummary & Pick<Row, "gender" | "weight" | "estimatedAge" | "temperament" | "humanSociability" | "dogSociability" | "walkNotes" | "requiredExperience" | "beginnerAllowed" | "childAllowed" | "multiDogAllowed" | "introduction" | "photoKey" | "internalNotes" | "updatedAt">;
