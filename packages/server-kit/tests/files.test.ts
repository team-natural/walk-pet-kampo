// The four upload checks and the signed link. Both are pure rules shared by the two apps, so a
// regression here is a regression in both at once.
import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/http/errors";
import { IMAGE_MIME_TYPES, assertValidUpload, signObjectPath, verifyObjectPath } from "../src/files";

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RULES = { allowedMimeTypes: IMAGE_MIME_TYPES, maxBytes: 1024 };

function file(name: string, type: string, bytes: number[], padTo = 32): File {
  const body = new Uint8Array(padTo);
  body.set(bytes);
  return new File([body], name, { type });
}

describe("assertValidUpload", () => {
  it("accepts a file whose name, type and bytes all agree", async () => {
    await expect(assertValidUpload(file("dog.png", "image/png", PNG_HEADER), RULES)).resolves.toMatchObject({ mimeType: "image/png" });
  });

  it("rejects a type outside the allowed list", async () => {
    await expect(assertValidUpload(file("doc.pdf", "application/pdf", [0x25, 0x50, 0x44, 0x46, 0x2d]), RULES)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an extension that contradicts the type", async () => {
    // The classic double extension: a .png body announced as .jpg, or the reverse.
    await expect(assertValidUpload(file("dog.jpg", "image/png", PNG_HEADER), RULES)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an empty file and one over the limit", async () => {
    await expect(assertValidUpload(new File([], "dog.png", { type: "image/png" }), RULES)).rejects.toBeInstanceOf(ValidationError);
    await expect(assertValidUpload(file("dog.png", "image/png", PNG_HEADER, 2048), RULES)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects bytes that do not match the declared type", async () => {
    // Name and MIME are whatever the client typed; this is the check they cannot forge past.
    const executable = file("dog.png", "image/png", [0x4d, 0x5a, 0x90, 0x00]);
    await expect(assertValidUpload(executable, RULES)).rejects.toBeInstanceOf(ValidationError);
  });

  it("requires both signature fragments for a WebP", async () => {
    // RIFF at 0 is shared with WAV and AVI; only "WEBP" at 8 makes it an image.
    const riffOnly = file("dog.webp", "image/webp", [0x52, 0x49, 0x46, 0x46]);
    await expect(assertValidUpload(riffOnly, RULES)).rejects.toBeInstanceOf(ValidationError);

    const webp = file("dog.webp", "image/webp", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    await expect(assertValidUpload(webp, RULES)).resolves.toMatchObject({ mimeType: "image/webp" });
  });
});

describe("signed object paths", () => {
  const SECRET = "test-only-secret";
  const KEY = "organizations/1/applications/01HZZ.pdf";

  it("verifies a link it just signed", async () => {
    const { token } = await signObjectPath(KEY, SECRET, 900);
    await expect(verifyObjectPath(KEY, token, SECRET)).resolves.toBe(true);
  });

  it("refuses the same token on a different object", async () => {
    // The key is signed with the deadline, so editing the path in the URL invalidates the link.
    const { token } = await signObjectPath(KEY, SECRET, 900);
    await expect(verifyObjectPath("organizations/2/applications/01HZZ.pdf", token, SECRET)).resolves.toBe(false);
  });

  it("refuses an expired link", async () => {
    const { token } = await signObjectPath(KEY, SECRET, 900, Date.now() - 1000 * 1000);
    await expect(verifyObjectPath(KEY, token, SECRET)).resolves.toBe(false);
  });

  it("refuses a tampered deadline and a tampered signature", async () => {
    const { token, expiresAt } = await signObjectPath(KEY, SECRET, 900);
    const [, sig] = token.split(".");

    await expect(verifyObjectPath(KEY, `${expiresAt + 86400}.${sig}`, SECRET)).resolves.toBe(false);
    await expect(verifyObjectPath(KEY, `${expiresAt}.aaaa`, SECRET)).resolves.toBe(false);
    await expect(verifyObjectPath(KEY, token, "a-different-secret")).resolves.toBe(false);
  });

  it("refuses a malformed token instead of throwing", async () => {
    await expect(verifyObjectPath(KEY, "", SECRET)).resolves.toBe(false);
    await expect(verifyObjectPath(KEY, "not-a-token", SECRET)).resolves.toBe(false);
  });
});
