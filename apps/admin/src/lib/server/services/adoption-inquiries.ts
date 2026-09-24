// SYS-21 / SYS-22 (F-15-11). Read-only by design, not by omission: the platform records the
// conversation and never advances it — the transfer follows each shelter's own process
// (PRD-01 §1-0, GOV-02 TBD-32). The state machine's writer lives in apps/public (DEV-09 §3-1).
import { adoptionInquiries, dogs, organizations, walkers } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { NotFoundError } from "@app/server-kit/http";
import { desc, eq, lt } from "drizzle-orm";
import type { AdoptionInquiryDetail, AdoptionInquirySummary } from "../../view-models/adoption-inquiry";

type InquiryRow = typeof adoptionInquiries.$inferSelect;

function toSummary(row: InquiryRow, names: { organizationName: string; dogName: string; walkerName: string }): AdoptionInquirySummary {
  return { id: row.publicId, status: row.status, createdAt: row.createdAt, ...names };
}

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

const joined = (db: DbClient) => db.select({ inquiry: adoptionInquiries, organizationName: organizations.name, dogName: dogs.name, walkerName: walkers.name }).from(adoptionInquiries).innerJoin(organizations, eq(adoptionInquiries.organizationId, organizations.id)).innerJoin(dogs, eq(adoptionInquiries.dogId, dogs.id)).innerJoin(walkers, eq(adoptionInquiries.walkerId, walkers.id));

export async function listAdoptionInquiries(db: DbClient, options: { beforeId?: number | null; perPage?: number } = {}) {
  const perPage = Math.min(Math.max(options.perPage ?? DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
  const rows = await joined(db)
    .where(options.beforeId ? lt(adoptionInquiries.id, options.beforeId) : undefined)
    .orderBy(desc(adoptionInquiries.id))
    .limit(perPage + 1);

  const hasMore = rows.length > perPage;
  const page = rows.slice(0, perPage);
  return { items: page.map((row) => toSummary(row.inquiry, row)), perPage, nextId: hasMore ? page[page.length - 1]!.inquiry.id : null };
}

export async function getAdoptionInquiryByPublicId(db: DbClient, publicId: string): Promise<AdoptionInquiryDetail> {
  const [row] = await joined(db).where(eq(adoptionInquiries.publicId, publicId)).limit(1);
  if (!row) throw new NotFoundError("里親相談が見つかりません。");

  return {
    ...toSummary(row.inquiry, row),
    motivation: row.inquiry.motivation,
    livingEnvironment: row.inquiry.livingEnvironment,
    organizationContactedAt: row.inquiry.organizationContactedAt,
    closedAt: row.inquiry.closedAt,
    updatedAt: row.inquiry.updatedAt,
  };
}
