// The third account system's own tests. Walker's live in auth.test.ts and stay separate for the
// same reason the code does: proving one works says nothing about the other (DEV-02 §1-4).
import { env } from "cloudflare:workers";
import { activityLog, invitations, organizationActivationTokens, organizationMemberPasswordResetTokens, organizationMembers, organizationSessions, organizations } from "@app/schema";
import { createDb } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { hashPassword, newSessionToken, verifyPassword } from "@app/server-kit/auth";
import { UnauthenticatedError } from "@app/server-kit/http";
import type { AstroCookies } from "astro";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { WALKER_SESSION_COOKIE } from "../../src/lib/server/auth/session";
import { ORGANIZATION_SESSION_COOKIE, createOrganizationSession, getOrganizationSession } from "../../src/lib/server/auth/organization-session";
import { InvalidTokenError, acceptInvitation, activateOrganization, getPendingActivation, getPendingInvitation, login, requestPasswordReset, resetPassword } from "../../src/lib/server/services/organization-auth";

const db = createDb(env.DB);
const EMAIL = "staff@example.test";
const PASSWORD = "correct horse battery staple";

function cookiesWith(token?: string, name = ORGANIZATION_SESSION_COOKIE) {
  return { get: (requested: string) => (token && requested === name ? { value: token } : undefined) } as unknown as AstroCookies;
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function insertOrganization() {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizations)
    .values({ publicId: ulid(), name: "テスト保護団体", slug: `org-${ulid().toLowerCase()}`, representativeName: "代表", addressVisibility: "prefecture_only", status: "approved", updatedAt: now })
    .returning();
  return row!;
}

async function insertMember(organizationId: number, overrides: Partial<typeof organizationMembers.$inferInsert> = {}) {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizationMembers)
    .values({
      organizationId,
      role: "org_admin",
      name: "スタッフ",
      email: EMAIL,
      passwordHash: await hashPassword(PASSWORD),
      status: "active",
      joinedAt: now,
      updatedAt: now,
      ...overrides,
    })
    .returning();
  return row!;
}

// Child rows first: every one of these has a foreign key into the next, and none of them cascade.
beforeEach(async () => {
  await db.delete(activityLog);
  await db.delete(organizationSessions);
  await db.delete(organizationMemberPasswordResetTokens);
  await db.delete(invitations);
  await db.delete(organizationActivationTokens);
  await db.delete(organizationMembers);
  await db.delete(organizations);
});

describe("login", () => {
  it("issues a session for an active member", async () => {
    const organization = await insertOrganization();
    const member = await insertMember(organization.id);

    const { session } = await login(db, EMAIL, PASSWORD, 30);

    await expect(getOrganizationSession(cookiesWith(session.token), db)).resolves.toMatchObject({
      organizationMemberId: member.id,
      organizationId: organization.id,
      organizationName: organization.name,
      role: "org_admin",
    });
  });

  it("rejects a wrong password, an unknown address and a suspended member alike", async () => {
    const organization = await insertOrganization();
    await insertMember(organization.id);

    await expect(login(db, EMAIL, "wrong", 30)).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(login(db, "nobody@example.test", PASSWORD, 30)).rejects.toBeInstanceOf(UnauthenticatedError);

    await db.update(organizationMembers).set({ status: "suspended" }).where(eq(organizationMembers.email, EMAIL));
    await expect(login(db, EMAIL, PASSWORD, 30)).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("refuses an invited member who has not accepted yet", async () => {
    // The row exists with a password hash the invitation flow has not written, so letting
    // `invited` log in would mean logging in with whatever placeholder created the row.
    const organization = await insertOrganization();
    await insertMember(organization.id, { status: "invited" });

    await expect(login(db, EMAIL, PASSWORD, 30)).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("leaves no session behind when it fails", async () => {
    const organization = await insertOrganization();
    await insertMember(organization.id);

    await login(db, EMAIL, "wrong", 30).catch(() => {});
    expect(await db.select().from(organizationSessions)).toHaveLength(0);
  });
});

describe("cross-system isolation (DEV-02 §1-4)", () => {
  it("does not read an OrganizationMember session out of the Walker cookie", async () => {
    const organization = await insertOrganization();
    const member = await insertMember(organization.id);
    const { token } = await createOrganizationSession(db, member.id, 30);

    // Same token, wrong cookie name: this is what a shared cookie name would silently allow.
    await expect(getOrganizationSession(cookiesWith(token, WALKER_SESSION_COOKIE), db)).resolves.toBeNull();
  });

  it("does not accept a token that is not in organization_sessions", async () => {
    await expect(getOrganizationSession(cookiesWith(newSessionToken()), db)).resolves.toBeNull();
  });
});

describe("password reset", () => {
  it("issues a token only for an address that can use it", async () => {
    const organization = await insertOrganization();
    await insertMember(organization.id);

    await expect(requestPasswordReset(db, EMAIL)).resolves.not.toBeNull();
    await expect(requestPasswordReset(db, "nobody@example.test")).resolves.toBeNull();
  });

  it("changes the password, ends every existing session and signs the member in", async () => {
    const organization = await insertOrganization();
    const member = await insertMember(organization.id);
    const stale = await createOrganizationSession(db, member.id, 30);
    const issued = await requestPasswordReset(db, EMAIL);

    const { session } = await resetPassword(db, issued!.token, "a-brand-new-password", 30);

    const [updated] = await db.select().from(organizationMembers).where(eq(organizationMembers.id, member.id));
    await expect(verifyPassword("a-brand-new-password", updated!.passwordHash)).resolves.toBe(true);
    await expect(getOrganizationSession(cookiesWith(stale.token), db)).resolves.toBeNull();
    await expect(getOrganizationSession(cookiesWith(session.token), db)).resolves.not.toBeNull();
  });

  it("spends the token, so the link cannot be replayed", async () => {
    const organization = await insertOrganization();
    await insertMember(organization.id);
    const issued = await requestPasswordReset(db, EMAIL);

    await resetPassword(db, issued!.token, "first-new-password", 30);
    await expect(resetPassword(db, issued!.token, "second-new-password", 30)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("rejects an unknown token", async () => {
    await expect(resetPassword(db, newSessionToken(), "whatever-password", 30)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("records the change in the audit log with the tenant it belongs to", async () => {
    const organization = await insertOrganization();
    const member = await insertMember(organization.id);
    const issued = await requestPasswordReset(db, EMAIL);

    await resetPassword(db, issued!.token, "a-brand-new-password", 30);

    const [entry] = await db.select().from(activityLog);
    // causer_type is Actor.type verbatim, and organization_id carries the tenant (GOV-01 D-033).
    expect(entry).toMatchObject({ causerType: "organization_member", causerId: member.id, organizationId: organization.id, event: "organization_member.password_reset" });
  });
});

describe("invitation acceptance", () => {
  async function invite(organizationId: number, inviterId: number, overrides: Partial<typeof invitations.$inferInsert> = {}) {
    const now = new Date().toISOString();
    const [row] = await db
      .insert(invitations)
      .values({ publicId: ulid(), organizationId, email: "invitee@example.test", role: "org_staff", token: newSessionToken(), inviterId, status: "pending", expiresAt: hoursFromNow(24), updatedAt: now, ...overrides })
      .returning();
    return row!;
  }

  it("creates an active member on the invited organization and signs them in", async () => {
    const organization = await insertOrganization();
    const inviter = await insertMember(organization.id);
    const invitation = await invite(organization.id, inviter.id);

    const { session, organizationMemberId } = await acceptInvitation(db, invitation.token, "新しいスタッフ", "a-brand-new-password", 30);

    const [created] = await db.select().from(organizationMembers).where(eq(organizationMembers.id, organizationMemberId));
    expect(created).toMatchObject({ organizationId: organization.id, email: "invitee@example.test", role: "org_staff", status: "active" });
    await expect(getOrganizationSession(cookiesWith(session.token), db)).resolves.toMatchObject({ role: "org_staff" });
  });

  it("closes the invitation in the same transaction as the member it creates", async () => {
    const organization = await insertOrganization();
    const inviter = await insertMember(organization.id);
    const invitation = await invite(organization.id, inviter.id);

    await acceptInvitation(db, invitation.token, "新しいスタッフ", "a-brand-new-password", 30);

    const [closed] = await db.select().from(invitations).where(eq(invitations.id, invitation.id));
    expect(closed).toMatchObject({ status: "accepted" });
    expect(closed!.acceptedAt).not.toBeNull();
  });

  it("cannot be redeemed twice, or after it expired", async () => {
    const organization = await insertOrganization();
    const inviter = await insertMember(organization.id);
    const invitation = await invite(organization.id, inviter.id);
    await acceptInvitation(db, invitation.token, "新しいスタッフ", "a-brand-new-password", 30);

    await expect(acceptInvitation(db, invitation.token, "別の人", "another-password", 30)).rejects.toBeInstanceOf(InvalidTokenError);

    const expired = await invite(organization.id, inviter.id, { email: "late@example.test", token: newSessionToken(), expiresAt: hoursFromNow(-1) });
    await expect(acceptInvitation(db, expired.token, "遅れた人", "another-password", 30)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("shows ADM-26 who the invitation is for, and nothing for a dead link", async () => {
    const organization = await insertOrganization();
    const inviter = await insertMember(organization.id);
    const invitation = await invite(organization.id, inviter.id);

    await expect(getPendingInvitation(db, invitation.token)).resolves.toEqual({ email: "invitee@example.test", role: "org_staff", organizationName: organization.name });
    await expect(getPendingInvitation(db, newSessionToken())).resolves.toBeNull();
  });
});

// F-03-06. The shelter's first account: nobody inside it can invite anyone, so the approval mail
// carries the only link that creates one (GOV-01 D-038).
describe("activation after approval", () => {
  async function issueActivation(organizationId: number, overrides: Partial<typeof organizationActivationTokens.$inferInsert> = {}) {
    const [row] = await db
      .insert(organizationActivationTokens)
      .values({ organizationId, email: "founder@example.test", token: newSessionToken(), expiresAt: hoursFromNow(24), ...overrides })
      .returning();
    return row!;
  }

  it("creates the first org_admin and signs them in", async () => {
    const organization = await insertOrganization();
    const activation = await issueActivation(organization.id);

    const { session, organizationMemberId } = await activateOrganization(db, activation.token, "代表 太郎", "a-brand-new-password", 30);

    const [created] = await db.select().from(organizationMembers).where(eq(organizationMembers.id, organizationMemberId));
    expect(created).toMatchObject({ organizationId: organization.id, email: "founder@example.test", role: "org_admin", status: "active" });
    await expect(getOrganizationSession(cookiesWith(session.token), db)).resolves.toMatchObject({ role: "org_admin" });
  });

  it("spends the token, so the link cannot make a second administrator", async () => {
    const organization = await insertOrganization();
    const activation = await issueActivation(organization.id);
    await activateOrganization(db, activation.token, "代表 太郎", "a-brand-new-password", 30);

    const [spent] = await db.select().from(organizationActivationTokens).where(eq(organizationActivationTokens.id, activation.id));
    expect(spent!.usedAt).not.toBeNull();
    await expect(activateOrganization(db, activation.token, "別の人", "another-password", 30)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("refuses an expired link, and one whose shelter is no longer approved", async () => {
    const organization = await insertOrganization();
    const expired = await issueActivation(organization.id, { expiresAt: hoursFromNow(-1) });
    await expect(activateOrganization(db, expired.token, "遅れた人", "another-password", 30)).rejects.toBeInstanceOf(InvalidTokenError);

    // Suspended between the mail going out and the link being opened.
    const suspended = await insertOrganization();
    await db.update(organizations).set({ status: "suspended" }).where(eq(organizations.id, suspended.id));
    const activation = await issueActivation(suspended.id, { email: "suspended@example.test" });
    await expect(activateOrganization(db, activation.token, "代表", "another-password", 30)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("refuses when the address already has an account", async () => {
    const organization = await insertOrganization();
    await insertMember(organization.id, { email: "founder@example.test" });
    const activation = await issueActivation(organization.id);

    await expect(activateOrganization(db, activation.token, "二人目", "another-password", 30)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("shows ADM-26 the shelter the link belongs to, and never resolves an invitation token", async () => {
    const organization = await insertOrganization();
    const activation = await issueActivation(organization.id);
    const inviter = await insertMember(organization.id, { email: "admin@example.test" });
    const now = new Date().toISOString();
    const [invitation] = await db
      .insert(invitations)
      .values({ publicId: ulid(), organizationId: organization.id, email: "invitee@example.test", role: "org_staff", token: newSessionToken(), inviterId: inviter.id, status: "pending", expiresAt: hoursFromNow(24), updatedAt: now })
      .returning();

    await expect(getPendingActivation(db, activation.token)).resolves.toEqual({ email: "founder@example.test", organizationName: organization.name });
    // The two tables never answer for each other — that separation is the point (D-038, D-020).
    await expect(getPendingActivation(db, invitation.token)).resolves.toBeNull();
    await expect(getPendingInvitation(db, activation.token)).resolves.toBeNull();
    await expect(activateOrganization(db, invitation.token, "招待された人", "another-password", 30)).rejects.toBeInstanceOf(InvalidTokenError);
  });
});
