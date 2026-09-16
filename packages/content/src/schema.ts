import { z } from "zod";

// Developer-maintained content (git-committed Markdown, no admin UI) — the counterpart to
// packages/schema's D1 tables, which hold transactional data only (GOV-01 D-016). Shared here so
// every app reading these files (apps/public today) validates against the same shape.
export const newsSchema = z.object({
  title: z.string(),
  category: z.string(),
  publishedDate: z.coerce.date(),
  // Exclude in the listing AND in getStaticPaths() — filtering only the listing leaves the
  // detail URL live, reachable by anyone who guesses the slug.
  draft: z.boolean().default(false),
});

export type News = z.infer<typeof newsSchema>;
