import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

// Seeded below rather than read from env vars, so `pnpm test:e2e` works unconfigured.
export const E2E_WALKER = {
  email: "e2e-walker@example.test",
  password: "e2e-only-password",
  name: "E2E Walker",
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
  const walkerScope = `(SELECT id FROM walkers WHERE email = '${email}' OR email LIKE 'e2e-signup-%')`;
  runInAdmin("npx", ["wrangler", "d1", "execute", "DB", "--local", ...persist, "--command", [`DELETE FROM walker_sessions WHERE walker_id IN ${walkerScope};`, `DELETE FROM walker_password_reset_tokens WHERE walker_id IN ${walkerScope};`, `DELETE FROM walker_email_verification_tokens WHERE walker_id IN ${walkerScope};`, `DELETE FROM walker_profiles WHERE walker_id IN ${walkerScope};`, `DELETE FROM walkers WHERE email = '${email}' OR email LIKE 'e2e-signup-%';`].join(" ")]);

  const memberEmail = E2E_ORGANIZATION_MEMBER.email.replaceAll("'", "''");
  const organizationName = E2E_ORGANIZATION_MEMBER.organization.replaceAll("'", "''");
  runInAdmin("npx", ["wrangler", "d1", "execute", "DB", "--local", ...persist, "--command", [`DELETE FROM organization_sessions WHERE organization_member_id IN (SELECT id FROM organization_members WHERE email = '${memberEmail}');`, `DELETE FROM organization_member_password_reset_tokens WHERE organization_member_id IN (SELECT id FROM organization_members WHERE email = '${memberEmail}');`, `DELETE FROM activity_log WHERE organization_id IN (SELECT id FROM organizations WHERE name = '${organizationName}');`, `DELETE FROM notifications WHERE recipient_type = 'organization_member' AND recipient_id IN (SELECT id FROM organization_members WHERE email = '${memberEmail}');`, `DELETE FROM notification_settings WHERE subject_type = 'organization_member' AND subject_id IN (SELECT id FROM organization_members WHERE email = '${memberEmail}');`, `DELETE FROM invitations WHERE organization_id IN (SELECT id FROM organizations WHERE name = '${organizationName}');`, `DELETE FROM walk_slot_dogs WHERE walk_slot_id IN (SELECT id FROM walk_slots WHERE organization_id IN (SELECT id FROM organizations WHERE name = '${organizationName}'));`, `DELETE FROM walk_slots WHERE organization_id IN (SELECT id FROM organizations WHERE name = '${organizationName}');`, `DELETE FROM dogs WHERE organization_id IN (SELECT id FROM organizations WHERE name = '${organizationName}');`, `DELETE FROM organization_members WHERE email = '${memberEmail}';`, `DELETE FROM organizations WHERE name = '${organizationName}';`].join(" ")]);

  // The application spec needs a name nobody has applied for, so it generates one per run and
  // cannot clean up by name the way the seeded shelter does.
  const applicantScope = `(SELECT id FROM organizations WHERE name LIKE 'E2E 申請団体%')`;
  runInAdmin("npx", ["wrangler", "d1", "execute", "DB", "--local", ...persist, "--command", [`DELETE FROM organization_application_tokens WHERE organization_id IN ${applicantScope};`, `DELETE FROM activity_log WHERE organization_id IN ${applicantScope};`, `DELETE FROM organizations WHERE name LIKE 'E2E 申請団体%';`].join(" ")]);

  runInAdmin("pnpm", ["seed", "--", "--table=walkers", `--email=${E2E_WALKER.email}`, `--password=${E2E_WALKER.password}`, `--name=${E2E_WALKER.name}`]);
  runInAdmin("pnpm", ["seed", "--", "--table=organization_members", `--email=${E2E_ORGANIZATION_MEMBER.email}`, `--password=${E2E_ORGANIZATION_MEMBER.password}`, `--name=${E2E_ORGANIZATION_MEMBER.name}`, `--organization=${E2E_ORGANIZATION_MEMBER.organization}`, "--role=org_admin"]);
}
