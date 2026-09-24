// Secrets are never written to wrangler.jsonc, so `wrangler types` cannot see them and the
// generated Cloudflare.Env has no property for one. Declared here instead, optional because a
// local machine or a preview may legitimately run without it (lib/server/mail/client.ts skips
// the send and logs). The key list itself is DEV-10 §11.
declare namespace Cloudflare {
  interface Env {
    RESEND_API_KEY?: string;
    /** HMAC key for time-limited links to private R2 objects (GOV-01 D-024). */
    FILE_SIGNING_KEY?: string;
    /** SMS provider credential for phone verification (F-01-02). The provider itself is still
     *  undecided (GOV-02 TBD-61), so this is the one value lib/server/sms/client.ts needs. */
    SMS_API_KEY?: string;
  }
}
