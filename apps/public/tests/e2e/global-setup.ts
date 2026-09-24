import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

// Seeded below rather than read from env vars, so `pnpm test:e2e` works unconfigured.
export const E2E_WALKER = {
  email: "e2e-walker@example.test",
  password: "e2e-only-password",
  name: "E2E Walker",
};

// A second walker, ready to book: email confirmed, profile filled in, terms agreed — everything
// SCR-17 needs except the phone check, which is the step the reservation spec walks through
// (GOV-01 D-036). E2E_WALKER stays deliberately incomplete; walker-profile.spec asserts that.
export const E2E_BOOKING_WALKER = {
  email: "e2e-booking-walker@example.test",
  password: "e2e-only-password",
  name: "E2E 予約参加者",
  phone: "09012345678",
};

// An approved shelter with nobody inside it, plus the link the approval mail would have carried
// (F-03-06). Issuing it is the operator's side and is covered in apps/admin; this is the half a
// shelter sees.
export const E2E_ACTIVATION = {
  organization: "E2E 有効化団体",
  email: "e2e-activation@example.test",
  token: "e2e-activation-token-0000000000",
};

// The same password as the Walker above, on purpose: the lockout counter keys per account system
// (GOV-01 D-021), and a shared credential is what would expose a counter that does not.
export const E2E_ORGANIZATION_MEMBER = {
  email: "e2e-org-staff@example.test",
  password: "e2e-only-password",
  name: "E2E 団体スタッフ",
  organization: "E2E 保護団体",
};

// Resolved from this file, not the cwd: `playwright test --config apps/public/...` run from the
// repo root would otherwise point wrangler at paths that do not exist.
const appDir = path.join(import.meta.dirname, "../..");
const adminDir = path.join(appDir, "../admin");
const migrationsDir = path.join(appDir, "../../packages/schema/migrations");
// The store the dev server opens (astro.config.mjs `persistState`).
const persist = ["--persist-to", path.join(appDir, "../../.wrangler-state")];

// Run from apps/admin: its wrangler.jsonc owns the shared database (migrations_dir), and the
// seeder lives alongside it.
function runInAdmin(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: adminDir });
  if (result.status !== 0) throw new Error(`E2E setup failed: ${command} ${args.join(" ")}`);
}

export default function globalSetup() {
  if (!existsSync(migrationsDir)) {
    throw new Error("No D1 migrations found. Run `pnpm db:generate` from the repo root first.");
  }

  runInAdmin("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local", ...persist]);

  // Drop only these accounts, so a developer's own data survives a test run. Child rows go first:
  // none of these foreign keys cascade — and notifications / notification_settings have none at
  // all, so a stale row would outlive the account and land in the next run's inbox.
  // `LIKE 'e2e-signup-%'` sweeps the accounts the registration spec creates: it needs a fresh
  // address every run, so it cannot clean up by name the way the seeded accounts do.
  const email = E2E_WALKER.email.replaceAll("'", "''");
  const bookingEmail = E2E_BOOKING_WALKER.email.replaceAll("'", "''");
  const walkerEmails = `'${email}', '${bookingEmail}'`;
  const walkerScope = `(SELECT id FROM walkers WHERE email IN (${walkerEmails}) OR email LIKE 'e2e-signup-%')`;
  // Incidents and reservations first of all: they point at the walker, the walk slot, the dog and
  // the shelter, so a leftover row blocks every delete below.
  runInAdmin("npx", ["wrangler", "d1", "execute", "DB", "--local", ...persist, "--command", [`DELETE FROM incidents WHERE walker_id IN ${walkerScope};`, `DELETE FROM reservations WHERE walker_id IN ${walkerScope};`, `DELETE FROM walker_sessions WHERE walker_id IN ${walkerScope};`, `DELETE FROM walker_password_reset_tokens WHERE walker_id IN ${walkerScope};`, `DELETE FROM walker_email_verification_tokens WHERE walker_id IN ${walkerScope};`, `DELETE FROM walker_phone_verification_tokens WHERE walker_id IN ${walkerScope};`, `DELETE FROM walker_profiles WHERE walker_id IN ${walkerScope};`, `DELETE FROM walkers WHERE email IN (${walkerEmails}) OR email LIKE 'e2e-signup-%';`].join(" ")]);

  const memberEmail = E2E_ORGANIZATION_MEMBER.email.replaceAll("'", "''");
  const organizationName = E2E_ORGANIZATION_MEMBER.organization.replaceAll("'", "''");
  runInAdmin("npx", ["wrangler", "d1", "execute", "DB", "--local", ...persist, "--command", [`DELETE FROM organization_sessions WHERE organization_member_id IN (SELECT id FROM organization_members WHERE email = '${memberEmail}');`, `DELETE FROM organization_member_password_reset_tokens WHERE organization_member_id IN (SELECT id FROM organization_members WHERE email = '${memberEmail}');`, `DELETE FROM activity_log WHERE organization_id IN (SELECT id FROM organizations WHERE name = '${organizationName}');`, `DELETE FROM notifications WHERE recipient_type = 'organization_member' AND recipient_id IN (SELECT id FROM organization_members WHERE email = '${memberEmail}');`, `DELETE FROM notification_settings WHERE subject_type = 'organization_member' AND subject_id IN (SELECT id FROM organization_members WHERE email = '${memberEmail}');`, `DELETE FROM invitations WHERE organization_id IN (SELECT id FROM organizations WHERE name = '${organizationName}');`, `DELETE FROM incidents WHERE organization_id IN (SELECT id FROM organizations WHERE name = '${organizationName}');`, `DELETE FROM walk_slot_dogs WHERE walk_slot_id IN (SELECT id FROM walk_slots WHERE organization_id IN (SELECT id FROM organizations WHERE name = '${organizationName}'));`, `DELETE FROM walk_slots WHERE organization_id IN (SELECT id FROM organizations WHERE name = '${organizationName}');`, `DELETE FROM dogs WHERE organization_id IN (SELECT id FROM organizations WHERE name = '${organizationName}');`, `DELETE FROM organization_members WHERE email = '${memberEmail}';`, `DELETE FROM organizations WHERE name = '${organizationName}';`].join(" ")]);

  // The shelter waiting to be activated, recreated each run because the spec consumes the token.
  const activationName = E2E_ACTIVATION.organization.replaceAll("'", "''");
  const activationScope = `(SELECT id FROM organizations WHERE name = '${activationName}')`;
  runInAdmin("npx", ["wrangler", "d1", "execute", "DB", "--local", ...persist, "--command", [`DELETE FROM organization_sessions WHERE organization_member_id IN (SELECT id FROM organization_members WHERE organization_id IN ${activationScope});`, `DELETE FROM organization_members WHERE organization_id IN ${activationScope};`, `DELETE FROM organization_activation_tokens WHERE organization_id IN ${activationScope};`, `DELETE FROM activity_log WHERE organization_id IN ${activationScope};`, `DELETE FROM organizations WHERE name = '${activationName}';`, `INSERT INTO organizations (public_id, name, slug, representative_name, email, address_visibility, status, created_at, updated_at) VALUES ('01HZZE2EACTIVATION0000001', '${activationName}', 'org-e2e-activation', '代表 太郎', '${E2E_ACTIVATION.email}', 'prefecture_only', 'approved', datetime('now'), datetime('now'));`, `INSERT INTO organization_activation_tokens (organization_id, email, token, expires_at, created_at) SELECT id, '${E2E_ACTIVATION.email}', '${E2E_ACTIVATION.token}', datetime('now', '+7 days'), datetime('now') FROM organizations WHERE name = '${activationName}';`].join(" ")]);

  // The application spec needs a name nobody has applied for, so it generates one per run and
  // cannot clean up by name the way the seeded shelter does.
  const applicantScope = `(SELECT id FROM organizations WHERE name LIKE 'E2E 申請団体%')`;
  runInAdmin("npx", ["wrangler", "d1", "execute", "DB", "--local", ...persist, "--command", [`DELETE FROM organization_application_tokens WHERE organization_id IN ${applicantScope};`, `DELETE FROM activity_log WHERE organization_id IN ${applicantScope};`, `DELETE FROM organizations WHERE name LIKE 'E2E 申請団体%';`].join(" ")]);

  runInAdmin("pnpm", ["seed", "--", "--table=walkers", `--email=${E2E_WALKER.email}`, `--password=${E2E_WALKER.password}`, `--name=${E2E_WALKER.name}`]);
  runInAdmin("pnpm", ["seed", "--", "--table=walkers", `--email=${E2E_BOOKING_WALKER.email}`, `--password=${E2E_BOOKING_WALKER.password}`, `--name=${E2E_BOOKING_WALKER.name}`]);

  // The seeder creates a provisional profile, which is where a real signup starts. Booking needs
  // `active` (DEV-09 §2-4), and reaching it through the UI is walker-registration.spec's subject,
  // not this one's — so the finished state is written directly.
  const bookingScope = `(SELECT id FROM walkers WHERE email = '${bookingEmail}')`;
  runInAdmin("npx", ["wrangler", "d1", "execute", "DB", "--local", ...persist, "--command", [`UPDATE walkers SET email_verified_at = datetime('now') WHERE email = '${bookingEmail}';`, `UPDATE walker_profiles SET status = 'active', name_kana = 'ヨヤク サンカシャ', birthdate = '1990-01-01', postal_code = '1150045', address = '東京都北区赤羽1-1-1', phone = '${E2E_BOOKING_WALKER.phone}', phone_verified_at = NULL, emergency_contact_name = '山田 花子', emergency_contact_phone = '09000000000', terms_agreed_at = datetime('now'), terms_agreed_version = '1.0' WHERE walker_id IN ${bookingScope};`].join(" ")]);
  runInAdmin("pnpm", ["seed", "--", "--table=organization_members", `--email=${E2E_ORGANIZATION_MEMBER.email}`, `--password=${E2E_ORGANIZATION_MEMBER.password}`, `--name=${E2E_ORGANIZATION_MEMBER.name}`, `--organization=${E2E_ORGANIZATION_MEMBER.organization}`, "--role=org_admin"]);
}
