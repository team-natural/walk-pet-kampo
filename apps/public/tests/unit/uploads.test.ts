// The bucket layout and the tenant boundary. The four format checks are covered once in
// @app/server-kit/tests/files.test.ts; what is app-specific is where an object lands and who is
// allowed to ask for it back.
import { env } from "cloudflare:workers";
import { ForbiddenError, NotFoundError } from "@app/server-kit/http";
import { describe, expect, it } from "vitest";
import { assertOwnsObject, deleteUpload, getUpload, putUpload } from "../../src/lib/server/services/uploads";

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngFile(name = "dog.png"): File {
  const body = new Uint8Array(64);
  body.set(PNG_HEADER);
  return new File([body], name, { type: "image/png" });
}

describe("putUpload", () => {
  it("files the object under the shelter that owns it", async () => {
    const stored = await putUpload(env.BUCKET, "dogPhoto", { organizationId: 7, subjectId: 42 }, pngFile());

    expect(stored.key).toMatch(/^organizations\/7\/dogs\/42\/[0-9A-HJKMNP-TV-Z]{26}\.png$/);
    expect(stored).toMatchObject({ mimeType: "image/png", sizeBytes: 64 });
  });

  it("names the object itself, so an uploaded filename cannot pick the key", async () => {
    // "../../site/logo/evil.png" as a name would otherwise escape the prefix entirely.
    const stored = await putUpload(env.BUCKET, "organizationLogo", { organizationId: 7 }, pngFile("../../site/logo/evil.png"));

    expect(stored.key.startsWith("organizations/7/logo/")).toBe(true);
    expect(stored.key).not.toContain("..");
  });

  it("actually stores the bytes with their content type", async () => {
    const stored = await putUpload(env.BUCKET, "dogPhoto", { organizationId: 7, subjectId: 1 }, pngFile());

    const object = await getUpload(env.BUCKET, stored.key);
    expect(object.httpMetadata?.contentType).toBe("image/png");
  });

  it("rejects a document where only images are allowed", async () => {
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0])], "doc.pdf", { type: "application/pdf" });

    await expect(putUpload(env.BUCKET, "dogPhoto", { organizationId: 7, subjectId: 1 }, pdf)).rejects.toThrow();
  });
});

describe("reading and deleting", () => {
  it("reports a missing object rather than returning an empty body", async () => {
    await expect(getUpload(env.BUCKET, "organizations/7/dogs/1/does-not-exist.png")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("removes the object", async () => {
    const stored = await putUpload(env.BUCKET, "dogPhoto", { organizationId: 7, subjectId: 1 }, pngFile());
    await deleteUpload(env.BUCKET, stored.key);

    await expect(getUpload(env.BUCKET, stored.key)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("assertOwnsObject", () => {
  it("passes for the shelter's own prefix", () => {
    expect(() => assertOwnsObject("organizations/7/incidents/3/report.pdf", 7)).not.toThrow();
  });

  it("refuses another shelter's object, including a prefix that merely starts the same", () => {
    expect(() => assertOwnsObject("organizations/8/incidents/3/report.pdf", 7)).toThrow(ForbiddenError);
    // organizations/70/... must not pass for organization 7 — the trailing slash is what stops it.
    expect(() => assertOwnsObject("organizations/70/incidents/3/report.pdf", 7)).toThrow(ForbiddenError);
  });

  it("refuses anything outside the organizations prefix", () => {
    expect(() => assertOwnsObject("media/01HZZ", 7)).toThrow(ForbiddenError);
    expect(() => assertOwnsObject("site/logo/logo.png", 7)).toThrow(ForbiddenError);
  });
});
