// Secrets are never written to wrangler.jsonc, so `wrangler types` cannot see them and the
// generated Cloudflare.Env has no property for one. Declared here instead, optional because a
// local machine or a preview may legitimately run without it (lib/server/mail/client.ts skips
// the send and logs). The key list itself is DEV-10 §11.
declare namespace Cloudflare {
  interface Env {
    RESEND_API_KEY?: string;
  }
}
