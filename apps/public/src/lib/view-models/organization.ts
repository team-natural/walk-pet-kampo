// The shape a screen renders, fixed before its Service exists so skeleton pages bind to a real
// type instead of inventing one. Pick from the table row rather than restating the fields: a
// column that does not exist then fails to compile, instead of surviving until the Service is
// written.
import type { organizations } from "@app/schema";

type Row = typeof organizations.$inferSelect;

// `id` is the public ULID. The internal integer id never leaves the Service layer.
export type OrganizationSummary = { id: string } & Pick<Row, "name" | "slug" | "status" | "activityArea" | "logoKey" | "protectedDogCount">;

export type OrganizationDetail = OrganizationSummary & Pick<Row, "nameKana" | "orgType" | "representativeName" | "addressVisibility" | "address" | "latitude" | "longitude" | "website" | "snsLinks" | "activityStartedOn" | "introduction" | "adoptionTrackRecord">;
