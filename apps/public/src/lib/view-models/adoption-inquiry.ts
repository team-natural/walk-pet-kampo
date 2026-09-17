import type { adoptionInquiries } from "@app/schema";
import type { DogSummary } from "./dog";
import type { OrganizationSummary } from "./organization";

type Row = typeof adoptionInquiries.$inferSelect;

export type AdoptionInquirySummary = { id: string; dog: DogSummary } & Pick<Row, "status" | "createdAt">;

export type AdoptionInquiryDetail = AdoptionInquirySummary & { organization: OrganizationSummary } & Pick<Row, "motivation" | "livingEnvironment" | "organizationContactedAt" | "closedAt">;
