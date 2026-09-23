// The only way bytes reach R2 (DEV-10 §4-4). Presigned PUT is not used in the MVP: it needs an
// R2 access key as a secret and moves the four checks off the server (GOV-01 D-024).
//
// Answers JSON with the key. The screens that will send here — a dog photo, a walk record, an
// incident attachment — arrive in P8/P15/P16 and store that key on their own row.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { ForbiddenError, ValidationError, jsonItem, toErrorResponse } from "@app/server-kit/http";
import { createDb } from "@app/schema/client";
import { requireOrganizationSession } from "$lib/server/auth/organization-session";
import { UPLOAD_KINDS, isUploadKind, putUpload } from "$lib/server/services/uploads";

export async function POST({ request, cookies }: APIContext): Promise<Response> {
  try {
    const session = await requireOrganizationSession(cookies, createDb(env.DB));
    const form = await request.formData();

    const kind = String(form.get("kind") ?? "");
    if (!isUploadKind(kind)) throw new ValidationError({ kind: ["アップロードの種別が不正です。"] });

    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError({ file: ["ファイルを選択してください。"] });

    // The scope comes from the session, never from the form: a subject id can be forged, the
    // organization it hangs under cannot (DEV-02 §3).
    const subjectParam = form.get("subject_id");
    const subjectId = subjectParam ? Number(subjectParam) : undefined;
    if (subjectId !== undefined && !Number.isInteger(subjectId)) throw new ValidationError({ subject_id: ["対象が不正です。"] });

    // Application documents belong to an applicant with no session yet, so they are uploaded
    // through the application token in P6 — not here.
    if (UPLOAD_KINDS[kind].visibility === "private" && kind === "applicationDocument") throw new ForbiddenError("この種別はこの経路では受け付けていません。");

    const stored = await putUpload(env.BUCKET, kind, { organizationId: session.organizationId, subjectId }, file);
    return jsonItem(stored, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
