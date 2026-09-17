// The terms and the privacy policy are written directly in their .astro pages (GOV-01 D-016).
// Only the version lives here, because it is the one part the code compares against:
// walker_profiles.terms_agreed_version. Bump it in the same commit that edits /terms, or the
// re-consent check silently passes for everyone (GOV-02 TBD-42).
export const TERMS_VERSION = "2026-09-01";
export const PRIVACY_VERSION = "2026-09-01";
