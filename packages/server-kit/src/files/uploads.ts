// The four checks every upload passes, in one place for both apps (DEV-02 §4, DEV-06 §8):
// declared MIME, file extension, size, and the leading bytes. The first three are caller-supplied
// and therefore worthless alone — a renamed executable claims image/png as easily as a real one.
//
// Shared rather than copied because the two apps disagreeing on what is allowed is the whole
// failure mode: apps/admin accepting what apps/public rejects means a file nobody can serve.
import { ValidationError } from "../http/errors";

interface UploadFormat {
  mimeType: string;
  extensions: readonly string[];
  /** Byte signature and where it starts. Two entries = both must match (WebP, AVIF). */
  signatures: readonly { at: number; bytes: readonly number[] }[];
}

// `image/svg+xml` is absent on purpose: XML has no signature to check, and SVG can carry script.
// Add it only alongside sanitising, or serving it as an attachment.
export const UPLOAD_FORMATS: readonly UploadFormat[] = [
  { mimeType: "image/jpeg", extensions: [".jpg", ".jpeg"], signatures: [{ at: 0, bytes: [0xff, 0xd8, 0xff] }] },
  { mimeType: "image/png", extensions: [".png"], signatures: [{ at: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }] },
  {
    mimeType: "image/webp",
    extensions: [".webp"],
    signatures: [
      { at: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
      { at: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
    ],
  },
  { mimeType: "image/avif", extensions: [".avif"], signatures: [{ at: 4, bytes: [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66] }] },
  { mimeType: "application/pdf", extensions: [".pdf"], signatures: [{ at: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }] },
];

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export const DOCUMENT_MIME_TYPES = ["application/pdf", ...IMAGE_MIME_TYPES] as const;

export interface UploadRules {
  allowedMimeTypes: readonly string[];
  maxBytes: number;
}

function matchesAt(header: Uint8Array, at: number, bytes: readonly number[]): boolean {
  return bytes.every((byte, index) => header[at + index] === byte);
}

function invalid(message: string): ValidationError {
  return new ValidationError({ file: [message] });
}

// Throws rather than returning a result: an upload that fails any check must not continue to the
// bucket, and a boolean invites a caller that forgets to look at it.
export async function assertValidUpload(file: File, rules: UploadRules): Promise<UploadFormat> {
  const format = UPLOAD_FORMATS.find((candidate) => candidate.mimeType === file.type);
  if (!format || !rules.allowedMimeTypes.includes(file.type)) {
    throw invalid(`許可されていない形式です（${rules.allowedMimeTypes.join(", ")}）。`);
  }

  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!format.extensions.includes(extension)) {
    throw invalid(`拡張子が形式と一致しません（${format.extensions.join(", ")}）。`);
  }

  if (file.size === 0 || file.size > rules.maxBytes) {
    throw invalid(`ファイルサイズは 1 バイト以上 ${Math.floor(rules.maxBytes / 1024 / 1024)} MB 以下にしてください。`);
  }

  // The bytes are the only part of an upload the caller does not get to assert.
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!format.signatures.every((signature) => matchesAt(header, signature.at, signature.bytes))) {
    throw invalid("ファイルの内容が形式と一致しません。");
  }

  return format;
}
