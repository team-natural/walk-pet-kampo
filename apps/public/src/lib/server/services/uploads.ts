// R2 access for the marketplace side. The bucket layout is DEV-10 §4-2 and the keys are built
// here, never taken from the request: a caller-supplied name can overwrite another object or
// escape its prefix with "..".
//
// D1 and R2 share no transaction, so callers order their writes the way apps/admin's media
// service does — object first on create, row first on delete — and a row never points at bytes
// that are not there.
import { ulid } from "@app/schema/ulid";
import { ForbiddenError, NotFoundError } from "@app/server-kit/http";
import { DOCUMENT_MIME_TYPES, IMAGE_MIME_TYPES, assertValidUpload, type UploadRules } from "@app/server-kit/files";

const MB = 1024 * 1024;

export interface UploadKind extends UploadRules {
  /** Where the object lands, relative to the bucket root (DEV-10 §4-2). */
  prefix: (scope: UploadScope) => string;
  /** private = never served by key; the API route checks the session and a signature first. */
  visibility: "public" | "private";
}

export interface UploadScope {
  organizationId: number;
  /** The row the file belongs to — a dog, a walk slot, an incident. Absent for a shelter logo. */
  subjectId?: number;
}

export const UPLOAD_KINDS = {
  organizationLogo: { prefix: (scope) => `organizations/${scope.organizationId}/logo`, allowedMimeTypes: IMAGE_MIME_TYPES, maxBytes: 2 * MB, visibility: "public" },
  dogPhoto: { prefix: (scope) => `organizations/${scope.organizationId}/dogs/${scope.subjectId}`, allowedMimeTypes: IMAGE_MIME_TYPES, maxBytes: 8 * MB, visibility: "public" },
  walkRecordPhoto: { prefix: (scope) => `organizations/${scope.organizationId}/walk-records/${scope.subjectId}`, allowedMimeTypes: IMAGE_MIME_TYPES, maxBytes: 8 * MB, visibility: "public" },
  // Private: an incident attachment can show an injury, and the documents carry identity papers.
  incidentAttachment: { prefix: (scope) => `organizations/${scope.organizationId}/incidents/${scope.subjectId}`, allowedMimeTypes: DOCUMENT_MIME_TYPES, maxBytes: 8 * MB, visibility: "private" },
  applicationDocument: { prefix: (scope) => `organizations/${scope.organizationId}/applications`, allowedMimeTypes: DOCUMENT_MIME_TYPES, maxBytes: 10 * MB, visibility: "private" },
} as const satisfies Record<string, UploadKind>;

export type UploadKindName = keyof typeof UPLOAD_KINDS;

export function isUploadKind(value: string): value is UploadKindName {
  return value in UPLOAD_KINDS;
}

export interface StoredObject {
  key: string;
  mimeType: string;
  sizeBytes: number;
}

export async function putUpload(bucket: R2Bucket, kind: UploadKindName, scope: UploadScope, file: File): Promise<StoredObject> {
  const definition = UPLOAD_KINDS[kind];
  const format = await assertValidUpload(file, definition);

  // ULID, not the uploaded name: the original can collide, carry a path, or be non-ASCII in ways
  // that make the key unquotable (DEV-06 §8).
  const key = `${definition.prefix(scope)}/${ulid()}${format.extensions[0]}`;
  await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type } });

  return { key, mimeType: file.type, sizeBytes: file.size };
}

export async function getUpload(bucket: R2Bucket, key: string): Promise<R2ObjectBody> {
  const object = await bucket.get(key);
  if (!object) throw new NotFoundError("ファイルが見つかりません。");
  return object;
}

export async function deleteUpload(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key);
}

// The public half of DEV-10 §4-3, expressed on the key. Anything not matched here is served only
// through the signed route — an incident attachment and an application document sit under the
// same `organizations/{id}/` prefix as a dog photo, and only the segment after it tells them
// apart.
const PUBLIC_KEY = /^(site\/|organizations\/\d+\/(logo|dogs|walk-records)\/)/;

export function isPublicObjectKey(key: string): boolean {
  return PUBLIC_KEY.test(key);
}

// The tenant boundary, expressed on the key itself. Every marketplace object lives under the
// shelter that owns it, so one string comparison is the whole check — and it holds for objects
// whose owning row has already been deleted.
export function assertOwnsObject(key: string, organizationId: number): void {
  if (!key.startsWith(`organizations/${organizationId}/`)) throw new ForbiddenError("このファイルにアクセスする権限がありません。");
}
