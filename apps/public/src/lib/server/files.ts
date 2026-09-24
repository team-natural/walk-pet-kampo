// The issuing half of GOV-01 D-024 — the verifying half is `/api/v1/files/[...key]`. Kept out of
// the Service files because it is about links, not data: a page asks for one when it is about to
// render an attachment.
import { env } from "cloudflare:workers";
import { signObjectPath } from "@app/server-kit/files";

// Fifteen minutes (DEV-10 §4-3). The link is a capability the moment it is rendered, so it
// outlives the page by as little as is still usable.
const LINK_TTL_SECONDS = 15 * 60;

/** Null when file serving is not configured — the caller renders the name without a link. */
export async function signedFileUrl(key: string): Promise<string | null> {
  if (!env.FILE_SIGNING_KEY) return null;
  const { token } = await signObjectPath(key, env.FILE_SIGNING_KEY, LINK_TTL_SECONDS);
  return `/api/v1/files/${key}?token=${encodeURIComponent(token)}`;
}

// Attachment keys are stored as a JSON array in one column (DEV-07 §5-15). Anything else in that
// column is treated as "no attachments" rather than crashing a page that only wants to list them.
export function parseAttachmentKeys(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

export async function signedAttachments(raw: string | null): Promise<{ key: string; url: string | null; name: string }[]> {
  const keys = parseAttachmentKeys(raw);
  return Promise.all(
    keys.map(async (key) => ({
      key,
      url: await signedFileUrl(key),
      // The stored name is a ULID (uploads.ts), so the last segment is all there is to show.
      name: key.split("/").pop() ?? key,
    })),
  );
}
