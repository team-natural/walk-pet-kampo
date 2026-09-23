// Serving a private object (GOV-01 D-024): session first, signature second, bucket third. The
// order matters — a valid signature on someone else's file still has to fail, so the tenant
// check cannot come after it.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { verifyObjectPath } from "@app/server-kit/files";
import { ForbiddenError, toErrorResponse } from "@app/server-kit/http";
import { createDb } from "@app/schema/client";
import { requireOrganizationSession } from "$lib/server/auth/organization-session";
import { assertOwnsObject, getUpload } from "$lib/server/services/uploads";

export async function GET({ params, request, cookies }: APIContext): Promise<Response> {
  try {
    const key = params.key!;
    const session = await requireOrganizationSession(cookies, createDb(env.DB));
    assertOwnsObject(key, session.organizationId);

    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (!env.FILE_SIGNING_KEY) throw new ForbiddenError("ファイル配信が設定されていません。");
    if (!(await verifyObjectPath(key, token, env.FILE_SIGNING_KEY))) throw new ForbiddenError("リンクの有効期限が切れています。");

    const object = await getUpload(env.BUCKET, key);

    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
        // Private by definition: this body is one shelter's document, and a shared cache holding
        // it would hand it to the next request that guessed the key.
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
