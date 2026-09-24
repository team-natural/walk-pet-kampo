// The issuing half of GOV-01 D-024. The verifying half lives in `/api/v1/files/[...key]` and is
// covered by @app/server-kit/tests/files.test.ts; what belongs here is the shape of the link a
// page renders, and what happens when the key is missing.
import { env } from "cloudflare:workers";
import { verifyObjectPath } from "@app/server-kit/files";
import { describe, expect, it } from "vitest";
import { parseAttachmentKeys, signedAttachments, signedFileUrl } from "../../src/lib/server/files";

const KEY = "organizations/7/incidents/12/01HZZATTACHMENT0000000001.png";

describe("signedFileUrl", () => {
  it("points at the private route and carries a token that verifies", async () => {
    const url = await signedFileUrl(KEY);

    expect(url).toMatch(`/api/v1/files/${KEY}?token=`);
    const token = decodeURIComponent(new URL(url!, "https://example.test").searchParams.get("token")!);
    await expect(verifyObjectPath(KEY, token, env.FILE_SIGNING_KEY!)).resolves.toBe(true);
    // The signature covers the key, so the same token cannot be moved to another file.
    await expect(verifyObjectPath("organizations/7/incidents/12/other.png", token, env.FILE_SIGNING_KEY!)).resolves.toBe(false);
  });

  it("expires, so a forwarded link stops working", async () => {
    const url = await signedFileUrl(KEY);
    const token = decodeURIComponent(new URL(url!, "https://example.test").searchParams.get("token")!);

    const anHourLater = Date.now() + 60 * 60 * 1000;
    await expect(verifyObjectPath(KEY, token, env.FILE_SIGNING_KEY!, anHourLater)).resolves.toBe(false);
  });
});

describe("attachment keys (DEV-07 §5-15)", () => {
  it("reads the JSON array, and treats anything else as empty", () => {
    expect(parseAttachmentKeys(JSON.stringify([KEY]))).toEqual([KEY]);
    expect(parseAttachmentKeys(null)).toEqual([]);
    expect(parseAttachmentKeys("not json")).toEqual([]);
    expect(parseAttachmentKeys(JSON.stringify({ key: KEY }))).toEqual([]);
  });

  it("names each attachment by its stored filename", async () => {
    const [attachment] = await signedAttachments(JSON.stringify([KEY]));

    expect(attachment).toMatchObject({ key: KEY, name: "01HZZATTACHMENT0000000001.png" });
    expect(attachment!.url).toContain("token=");
  });
});
