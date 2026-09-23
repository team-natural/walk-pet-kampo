// D1 and R2 share no transaction, so every write is ordered to keep one invariant: a row must
// never point at bytes that are not there. Object first on create, row first on delete.
import { media } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { UPLOAD_FORMATS, assertValidUpload } from "@app/server-kit/files";
import { NotFoundError } from "@app/server-kit/http";
import { desc, eq, lt } from "drizzle-orm";
import type { Session } from "../auth/session";
import type { UpdateMediaInput } from "../validation/media";
import { activityLogInsert, platformActor } from "./activity-log";

// The four checks live in @app/server-kit/files so both apps enforce the same set — apps/admin
// accepting what apps/public rejects would mean a file nobody can serve (DEV-02 §4).
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type MediaRow = typeof media.$inferSelect;

// `key` is included so a screen can build the object's URL; `uploaderId` is another table's id.
export function toPublicMedia(row: MediaRow) {
  return {
    id: row.publicId,
    key: row.key,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    altText: row.altText,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

export async function listMedia(db: DbClient, options: { beforeId?: number | null; perPage?: number }) {
  const perPage = Math.min(Math.max(options.perPage ?? DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
  const rows = await db
    .select()
    .from(media)
    .where(options.beforeId ? lt(media.id, options.beforeId) : undefined)
    .orderBy(desc(media.id))
    .limit(perPage + 1);

  const hasMore = rows.length > perPage;
  const page = rows.slice(0, perPage);
  return { items: page.map(toPublicMedia), perPage, nextId: hasMore ? page[page.length - 1]!.id : null };
}

async function findMediaRow(db: DbClient, publicId: string): Promise<MediaRow> {
  const [row] = await db.select().from(media).where(eq(media.publicId, publicId)).limit(1);
  if (!row) throw new NotFoundError("メディアが見つかりません。");
  return row;
}

export async function getMediaByPublicId(db: DbClient, publicId: string) {
  return toPublicMedia(await findMediaRow(db, publicId));
}

// The key is generated, never taken from the upload: a caller-supplied name could overwrite
// another object or escape the prefix.
export async function uploadMedia(db: DbClient, bucket: R2Bucket, file: File, session: Session) {
  await assertValidUpload(file, { allowedMimeTypes: UPLOAD_FORMATS.map((format) => format.mimeType), maxBytes: MAX_UPLOAD_BYTES });

  const publicId = ulid();
  const key = `media/${publicId}`;
  // Bucket first (see the note at the top of this file).
  await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type } });

  const now = new Date().toISOString();
  const [row] = await db.insert(media).values({ publicId, uploaderId: session.adminUserId, key, mimeType: file.type, sizeBytes: file.size, altText: null, updatedAt: now }).returning();
  return toPublicMedia(row!);
}

export async function updateMedia(db: DbClient, publicId: string, input: UpdateMediaInput) {
  const row = await findMediaRow(db, publicId);
  const [updated] = await db
    .update(media)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(eq(media.id, row.id))
    .returning();
  return toPublicMedia(updated!);
}

export async function deleteMedia(db: DbClient, bucket: R2Bucket, publicId: string, session: Session): Promise<void> {
  const row = await findMediaRow(db, publicId);

  // The entry carries the key, so an object left behind by a failed bucket delete is findable.
  await db.batch([
    db.delete(media).where(eq(media.id, row.id)),
    activityLogInsert(db, {
      logName: "media",
      description: `Media deleted (${row.mimeType})`,
      subjectType: "Media",
      subjectId: row.id,
      event: "media.deleted",
      actor: platformActor(session),
      properties: { publicId, key: row.key },
    }),
  ]);

  await bucket.delete(row.key);
}
