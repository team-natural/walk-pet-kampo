// Seeds a login account into the shared D1. It lives in this app because this app's
// wrangler.jsonc owns the database (migrations_dir); apps/public seeds through it too.
// D1 isn't reachable in-process outside the Workers runtime, so this shells out to
// `wrangler d1 execute`. Run via tsx, not node — that's what lets it import the real
// hashPassword/ulid instead of duplicating them.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { hashPassword } from "@app/server-kit/auth";
import { ulid } from "@app/schema/ulid";

// admin_users and walkers have no role column: AdminUser is always `admin` (GOV-01 D-011) and
// Walker has no role at all. organization_members does, and also needs an organization to belong
// to — see seedOrganizationMember().
const TABLES = ["admin_users", "walkers", "organization_members"];
const ORGANIZATION_ROLES = ["org_admin", "org_staff"];

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const match = arg.match(/^--([a-z_]+)(?:=(.*))?$/);
    if (match) args[match[1]] = match[2] ?? true;
  }
  return args;
}

// `--password S3cret!` (space instead of `=`) stores `true` here, which passes the usage guard
// and silently seeds an account whose password is the literal "true". Demand `--flag=value` for
// anything carrying a value; valueless flags like --remote stay boolean.
function requireValue(args, key) {
  const value = args[key];
  if (typeof value !== "string" || value === "") {
    console.error(`--${key} needs a value in --${key}=<value> form (a space-separated value is not picked up).`);
    process.exit(1);
  }
  return value;
}

const sqlQuote = (value) => `'${String(value).replaceAll("'", "''")}'`;

const USAGE = "Usage: pnpm seed -- --table=admin_users|walkers|organization_members --email=<email> --password=<password> --name=<name>" + " [--role=org_admin|org_staff] [--organization=<name>] [--db=<binding or database_name>] [--remote] [--env=<wrangler env>]";

// An OrganizationMember cannot exist without an organization (organization_id is NOT NULL), and
// before P6 nothing creates one. Insert the shelter if this name is new, then attach the member
// to it. `approved` because a member of an unapproved shelter cannot do anything.
function organizationMemberSql({ name, email, passwordHash, role, organizationName, now }) {
  const organization = [`INSERT INTO organizations (public_id, name, slug, representative_name, address_visibility, status, created_at, updated_at)`, `SELECT ${[ulid(), organizationName, `org-${ulid().toLowerCase()}`, name, "prefecture_only", "approved", now, now].map(sqlQuote).join(", ")}`, `WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name = ${sqlQuote(organizationName)});`].join(" ");

  const member = [`INSERT INTO organization_members (organization_id, role, name, email, password_hash, status, joined_at, created_at, updated_at)`, `SELECT id, ${[role, name, email, passwordHash, "active", now, now, now].map(sqlQuote).join(", ")}`, `FROM organizations WHERE name = ${sqlQuote(organizationName)} LIMIT 1;`].join(" ");

  return `${organization} ${member}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const table = TABLES.includes(args.table) ? args.table : null;

  if (!table || !args.email || !args.password || !args.name) {
    console.error(USAGE);
    process.exit(1);
  }

  const email = requireValue(args, "email");
  const password = requireValue(args, "password");
  const name = requireValue(args, "name");

  const role = typeof args.role === "string" ? args.role : "org_admin";
  if (table === "organization_members" && !ORGANIZATION_ROLES.includes(role)) {
    console.error(`--role must be one of ${ORGANIZATION_ROLES.join(" | ")}`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const columns = ["public_id", "name", "email", "password_hash", "status", "created_at", "updated_at"];
  const values = [ulid(), name, email, passwordHash, "active", now, now];
  const sql = table === "organization_members" ? organizationMemberSql({ name, email, passwordHash, role, organizationName: typeof args.organization === "string" ? args.organization : "開発用保護団体", now }) : `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.map(sqlQuote).join(", ")});`;

  // Binding name, not database_name: it's valid before a project replaces the placeholders.
  const db = typeof args.db === "string" && args.db !== "" ? args.db : "DB";
  const wranglerArgs = ["wrangler", "d1", "execute", db, args.remote ? "--remote" : "--local", "--command", sql];
  // Matches astro.config.mjs's persistState path — apps/admin and apps/public share local D1.
  if (!args.remote) wranglerArgs.push("--persist-to", "../../.wrangler-state");
  if (args.env) wranglerArgs.splice(4, 0, "--env", args.env);

  const result = spawnSync("npx", wranglerArgs, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`Seeded ${email} into ${table} (${args.remote ? "remote" : "local"}).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
