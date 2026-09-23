// Time-limited signatures for private objects (GOV-01 D-024). The API Route checks the session
// first and this second — the signature limits how long a link works, the session decides who may
// ask at all. R2's S3 presigned URLs are not used: a presigned URL is a capability, so forwarding
// it hands over the file, and it cannot express "only this shelter's staff".
import { fromBase64Url, toBase64Url } from "../auth/encoding";

export interface SignedPath {
  token: string;
  expiresAt: number;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

// The object key is signed along with the deadline, so a token minted for one file cannot be
// moved to another by editing the URL.
async function signature(key: string, expiresAt: number, secret: string): Promise<string> {
  const signed = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(`${key}:${expiresAt}`));
  return toBase64Url(new Uint8Array(signed));
}

export async function signObjectPath(key: string, secret: string, ttlSeconds: number, now = Date.now()): Promise<SignedPath> {
  const expiresAt = Math.floor(now / 1000) + ttlSeconds;
  return { token: `${expiresAt}.${await signature(key, expiresAt, secret)}`, expiresAt };
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function verifyObjectPath(key: string, token: string, secret: string, now = Date.now()): Promise<boolean> {
  const [expiresPart, provided] = token.split(".");
  const expiresAt = Number(expiresPart);
  if (!provided || !Number.isInteger(expiresAt)) return false;
  if (expiresAt * 1000 <= now) return false;

  const expected = await signature(key, expiresAt, secret);
  return timingSafeEqual(fromBase64Url(provided), fromBase64Url(expected));
}
