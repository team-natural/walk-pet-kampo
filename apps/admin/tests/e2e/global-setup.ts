import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

// Seeded below rather than read from env vars, so `pnpm test:e2e` works unconfigured.
// The application SYS-04/05 review. Fixed ids so the spec can navigate straight to it.
export const E2E_APPLICANT = {
  publicId: "01HZZE2EAPPLICANT000000001",
  name: "E2E 審査対象団体",
  slug: "org-e2e-applicant",
};

// SYS-09/10 read real rows now, so the list has something in it and the detail has a URL that
// resolves. Registration and editing are the shelter's (ADM-06/07), covered in apps/public.
export const E2E_DOG = {
  publicId: "01HZZE2EDOG00000000000001",
  name: "E2E ハナ",
  slug: "dog-e2e-hana",
};

export const E2E_ADMIN = {
  email: "e2e-admin@example.test",
  password: "e2e-only-password",
  name: "E2E Admin",
};

// Resolved from this file, not the cwd: `playwright test --config apps/admin/...` run from the
// repo root would otherwise point wrangler at paths that do not exist.
const appDir = path.join(import.meta.dirname, "../..");
const migrationsDir = path.join(appDir, "../../packages/schema/migrations");
// The store the dev server opens (astro.config.mjs `persistState`).
const persist = ["--persist-to", path.join(appDir, "../../.wrangler-state")];

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: appDir });
  if (result.status !== 0) throw new Error(`E2E setup failed: ${command} ${args.join(" ")}`);
}

export default function globalSetup() {
  if (!existsSync(migrationsDir)) {
    throw new Error("No D1 migrations found. Run `pnpm db:generate` from the repo root first.");
  }

  run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local", ...persist]);

  // Drop only this account, so a developer's own seeded admin survives a test run. Order matters
  // and none of these cascade: `organizations.reviewed_by` points at the admin a previous run
  // reviewed with, so anything referencing the account goes before the account itself.
  const email = E2E_ADMIN.email.replaceAll("'", "''");
  const adminScope = `(SELECT id FROM admin_users WHERE email = '${email}')`;
  const applicantScope = `(SELECT id FROM organizations WHERE name = '${E2E_APPLICANT.name}')`;

  run("npx", ["wrangler", "d1", "execute", "DB", "--local", ...persist, "--command", [`DELETE FROM organization_application_tokens WHERE organization_id IN ${applicantScope};`, `DELETE FROM dogs WHERE organization_id IN ${applicantScope};`, `DELETE FROM activity_log WHERE organization_id IN ${applicantScope};`, `DELETE FROM organizations WHERE name = '${E2E_APPLICANT.name}';`, `UPDATE organizations SET reviewed_by = NULL WHERE reviewed_by IN ${adminScope};`, `UPDATE activity_log SET causer_id = NULL, causer_type = 'system' WHERE causer_type = 'platform' AND causer_id IN ${adminScope};`, `DELETE FROM admin_sessions WHERE admin_user_id IN ${adminScope};`, `DELETE FROM admin_users WHERE email = '${email}';`].join(" ")]);

  run("pnpm", ["seed", "--", "--table=admin_users", `--email=${E2E_ADMIN.email}`, `--password=${E2E_ADMIN.password}`, `--name=${E2E_ADMIN.name}`]);

  // SYS-04/05 review a real row, and the spec moves it through the state machine — so it is
  // recreated each run rather than left in whatever state the last one ended in.
  run("npx", ["wrangler", "d1", "execute", "DB", "--local", ...persist, "--command", [`INSERT INTO organizations (public_id, name, slug, representative_name, email, address_visibility, status, created_at, updated_at)`, `VALUES ('${E2E_APPLICANT.publicId}', '${E2E_APPLICANT.name}', '${E2E_APPLICANT.slug}', '代表 太郎', 'e2e-applicant@example.test', 'prefecture_only', 'pending_review', datetime('now'), datetime('now'));`].join(" ")]);

  run("npx", ["wrangler", "d1", "execute", "DB", "--local", ...persist, "--command", [`INSERT INTO dogs (public_id, organization_id, slug, name, breed, size, required_experience, adoption_status, internal_notes, is_published, created_at, updated_at)`, `SELECT '${E2E_DOG.publicId}', id, '${E2E_DOG.slug}', '${E2E_DOG.name}', '柴犬ミックス', 'medium', 'none', 'listed', '投薬中（E2E）。', 1, datetime('now'), datetime('now') FROM organizations WHERE public_id = '${E2E_APPLICANT.publicId}';`].join(" ")]);
}
