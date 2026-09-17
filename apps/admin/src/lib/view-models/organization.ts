import type { organizations } from "@app/schema";

type Row = typeof organizations.$inferSelect;

// The operator console sees the review columns the public site never renders. It is a separate
// type from apps/public's OrganizationSummary on purpose: the two apps must not import each
// other, and widening the public one to fit admin would leak review data into public templates.
export type OrganizationSummary = { id: string } & Pick<Row, "name" | "slug" | "status" | "activityArea" | "createdAt">;

export type OrganizationDetail = OrganizationSummary & { reviewedByName: string | null } & Pick<Row, "nameKana" | "orgType" | "hasCorporateStatus" | "representativeName" | "contactName" | "postalCode" | "address" | "addressVisibility" | "phone" | "email" | "website" | "activityStartedOn" | "introduction" | "protectedDogCount" | "adoptionTrackRecord" | "stripeConnectAccountId" | "reviewedAt" | "rejectionReason" | "updatedAt">;
