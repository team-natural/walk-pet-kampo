import type { adoptionInquiries } from "@app/schema";

type Row = typeof adoptionInquiries.$inferSelect;

export type AdoptionInquirySummary = { id: string; organizationName: string; dogName: string; walkerName: string } & Pick<Row, "status" | "createdAt">;

export type AdoptionInquiryDetail = AdoptionInquirySummary & Pick<Row, "motivation" | "livingEnvironment" | "organizationContactedAt" | "closedAt" | "updatedAt">;
