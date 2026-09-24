// SYS-05's review actions. A form POST from confirm-action.svelte, so the answer is a redirect
// back to the screen rather than JSON (DEV-04 §5-16).
//
// The resubmission token for `needs_more_info` is issued here rather than inside the transition:
// the Service records what changed, and the link only exists because a mail is about to carry it.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@app/schema/client";
import { AppError, ValidationError } from "@app/server-kit/http";
import { sendOrganizationReviewResultEmail, type ReviewOutcome } from "$lib/server/mail/organizations";
import { requireSession } from "$lib/server/auth/session";
import { getOrganizationByPublicId, hasAnyMember, issueActivationToken, issueApplicationToken, transitionOrganization, type OrganizationStatus, type TransitionResult } from "$lib/server/services/organizations";
import type { DbClient } from "@app/schema/client";

// The three outcomes the applicant hears about. `suspended` and the rest are operational and
// reach the shelter through its console, not a review mail (DEV-09 §2-1-4).
const NOTIFIED: ReviewOutcome[] = ["approved", "rejected", "needs_more_info"];

function isNotified(to: OrganizationStatus): to is ReviewOutcome {
  return (NOTIFIED as OrganizationStatus[]).includes(to);
}

// SYS-05 and SYS-07 post here alike. Which screen the operator came from is decided by the state
// they are leaving, not by a form field — a caller-supplied return path is an open redirect.
const REVIEW_STATES: OrganizationStatus[] = ["pending_review", "under_review", "needs_more_info"];

async function tokenFor(db: DbClient, to: ReviewOutcome, result: TransitionResult): Promise<string | undefined> {
  if (to === "needs_more_info") return issueApplicationToken(db, result.organizationId);
  // Only the first approval: a shelter coming back from `suspended` already has its accounts, and
  // a fresh activation link would create a second org_admin for anyone holding the mail.
  if (to === "approved" && !(await hasAnyMember(db, result.organizationId))) return issueActivationToken(db, result.organizationId, result.email!);
  return undefined;
}

export async function POST({ params, request, cookies, locals }: APIContext): Promise<Response> {
  const publicId = params.id!;
  let back = `/organization-applications/${publicId}`;

  try {
    const db = createDb(env.DB);
    const session = await requireSession(cookies, db);

    const before = await getOrganizationByPublicId(db, publicId);
    if (!REVIEW_STATES.includes(before.status)) back = `/organizations/${publicId}`;

    const form = await request.formData();
    const to = String(form.get("to") ?? "") as OrganizationStatus;
    const reason = String(form.get("reason") ?? "");

    const result = await transitionOrganization(db, publicId, to, session, reason);

    if (result.email && isNotified(to)) {
      // Two different tokens, two different tables (DEV-07 §5-25, §5-28): one sends the applicant
      // back to fix the application, the other creates the shelter's first account (F-03-06).
      // Issued only on the first approval — a second one would mint a live link for an account
      // that already exists.
      const token = await tokenFor(db, to, result);
      locals.cfContext.waitUntil(sendOrganizationReviewResultEmail(result.email, result.name, to, reason.trim() || null, token));
    }

    return new Response(null, { status: 303, headers: { Location: `${back}?status=saved` } });
  } catch (error) {
    if (error instanceof ValidationError) return new Response(null, { status: 303, headers: { Location: `${back}?error=reason` } });
    // An invalid transition means the screen was showing a stale state — say so rather than
    // leaving the operator looking at a button that silently did nothing.
    if (error instanceof AppError) return new Response(null, { status: 303, headers: { Location: `${back}?error=state` } });
    throw error;
  }
}
