// The public-URL half of DEV-10 §4-3. R2 has no public bucket domain in this project, so the
// Worker serves those objects itself — no session, no signature, but only for the prefixes
// isPublicObjectKey() allows: the private route next door exists precisely because the rest of
// the bucket must not be reachable this way.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { NotFoundError, toErrorResponse } from "@app/server-kit/http";
import { getUpload, isPublicObjectKey } from "$lib/server/services/uploads";

export async function GET({ params }: APIContext): Promise<Response> {
  try {
    const key = params.key!;
    // Same answer as a missing object: which keys exist under a private prefix is not something
    // an anonymous caller may learn by the status code.
    if (!isPublicObjectKey(key)) throw new NotFoundError("ファイルが見つかりません。");

    const object = await getUpload(env.BUCKET, key);

    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
        // Immutable: every key carries a ULID, so replacing a photo writes a new key rather than
        // new bytes under the old one.
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: object.httpEtag,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
