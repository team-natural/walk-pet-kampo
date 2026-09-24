// FG-02: the profile a walker keeps, the favourites they collect, and leaving. The state machine
// side of profile edits (reaching `active`) is in walker-registration.test.ts; here the subject
// is ownership — a walker touching only their own rows.
import { env } from "cloudflare:workers";
import { activityLog, dogs, favorites, organizations, walkerEmailVerificationTokens, walkerPasswordResetTokens, walkerProfiles, walkerSessions, walkers } from "@app/schema";
import { createDb } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createSession } from "../../src/lib/server/auth/session";
import { addFavorite, getWalkerProfile, listFavorites, removeFavorite, updateWalkerProfile, withdrawWalker } from "../../src/lib/server/services/walker-profile";
import { registerWalker, verifyEmail } from "../../src/lib/server/services/walker-registration";

const db = createDb(env.DB);

const FILLED = {
  nameKana: "ヤマダ タロウ",
  birthdate: "1990-01-01",
  postalCode: "1150045",
  address: "東京都北区赤羽2-2-2",
  phone: "090-0000-0000",
  preferredArea: "東京都北区",
  emergencyContactName: "緊急 連絡先",
  emergencyContactPhone: "090-1111-1111",
};

async function newWalker(email: string) {
  const { walkerId, token } = await registerWalker(db, { name: "参加者", email, password: "correct horse battery staple" });
  return { walkerId, token };
}

async function insertDog(organizationId: number, name: string) {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(dogs)
    .values({ publicId: ulid(), organizationId, slug: `dog-${ulid().toLowerCase()}`, name, adoptionStatus: "listed", requiredExperience: "none", walkEligible: 1, isPublished: 1, updatedAt: now })
    .returning();
  return row!;
}

async function insertOrganization() {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizations)
    .values({ publicId: ulid(), name: "テスト保護団体", slug: `org-${ulid().toLowerCase()}`, representativeName: "代表", addressVisibility: "prefecture_only", status: "approved", updatedAt: now })
    .returning();
  return row!;
}

beforeEach(async () => {
  await db.delete(activityLog);
  await db.delete(favorites);
  await db.delete(dogs);
  await db.delete(organizations);
  await db.delete(walkerEmailVerificationTokens);
  await db.delete(walkerPasswordResetTokens);
  await db.delete(walkerSessions);
  await db.delete(walkerProfiles);
  await db.delete(walkers);
});

describe("the profile", () => {
  it("saves the fields SCR-22 submits", async () => {
    const { walkerId } = await newWalker("profile@example.test");

    await updateWalkerProfile(db, walkerId, FILLED);

    expect(await getWalkerProfile(db, walkerId)).toMatchObject({ birthdate: FILLED.birthdate, phone: FILLED.phone, emergencyContactPhone: FILLED.emergencyContactPhone });
  });

  it("completes the set and reaches active once the email is verified too", async () => {
    const { walkerId, token } = await newWalker("profile-active@example.test");
    await verifyEmail(db, token);

    await updateWalkerProfile(db, walkerId, FILLED);

    expect(await getWalkerProfile(db, walkerId)).toMatchObject({ status: "active" });
  });

  it("un-verifies the phone number when it changes", async () => {
    // The old confirmation was for a different line; keeping the flag would put a verified badge
    // on an unverified number (GOV-01 D-036).
    const { walkerId } = await newWalker("profile-phone@example.test");
    await updateWalkerProfile(db, walkerId, FILLED);
    await db.update(walkerProfiles).set({ phoneVerifiedAt: new Date().toISOString() }).where(eq(walkerProfiles.walkerId, walkerId));

    await updateWalkerProfile(db, walkerId, { ...FILLED, phone: "090-2222-3333" });

    expect((await getWalkerProfile(db, walkerId)).phoneVerifiedAt).toBeNull();
  });

  it("keeps the verification when the number is submitted unchanged", async () => {
    const { walkerId } = await newWalker("profile-phone-same@example.test");
    await updateWalkerProfile(db, walkerId, FILLED);
    await db.update(walkerProfiles).set({ phoneVerifiedAt: new Date().toISOString() }).where(eq(walkerProfiles.walkerId, walkerId));

    await updateWalkerProfile(db, walkerId, { ...FILLED, address: "東京都北区赤羽3-3-3" });

    expect((await getWalkerProfile(db, walkerId)).phoneVerifiedAt).not.toBeNull();
  });
});

describe("favourites", () => {
  it("lists the walker's own, resolved to dogs and organizations", async () => {
    const { walkerId } = await newWalker("fav@example.test");
    const organization = await insertOrganization();
    const dog = await insertDog(organization.id, "モモ");

    await addFavorite(db, walkerId, "Dog", dog.id);
    await addFavorite(db, walkerId, "Organization", organization.id);

    const result = await listFavorites(db, walkerId);
    expect(result.dogs.map((entry) => entry.name)).toEqual(["モモ"]);
    expect(result.organizations.map((entry) => entry.name)).toEqual([organization.name]);
  });

  it("does not show another walker's favourites", async () => {
    const mine = await newWalker("fav-mine@example.test");
    const theirs = await newWalker("fav-theirs@example.test");
    const organization = await insertOrganization();
    const dog = await insertDog(organization.id, "モモ");
    await addFavorite(db, theirs.walkerId, "Dog", dog.id);

    expect((await listFavorites(db, mine.walkerId)).dogs).toEqual([]);
  });

  it("treats a second tap as a no-op rather than an error", async () => {
    const { walkerId } = await newWalker("fav-twice@example.test");
    const organization = await insertOrganization();
    const dog = await insertDog(organization.id, "モモ");

    await addFavorite(db, walkerId, "Dog", dog.id);
    await addFavorite(db, walkerId, "Dog", dog.id);

    expect(await db.select().from(favorites)).toHaveLength(1);
  });

  it("removes only the walker's own row", async () => {
    const mine = await newWalker("fav-remove-mine@example.test");
    const theirs = await newWalker("fav-remove-theirs@example.test");
    const organization = await insertOrganization();
    const dog = await insertDog(organization.id, "モモ");
    await addFavorite(db, mine.walkerId, "Dog", dog.id);
    await addFavorite(db, theirs.walkerId, "Dog", dog.id);

    await removeFavorite(db, mine.walkerId, "Dog", dog.id);

    expect((await listFavorites(db, theirs.walkerId)).dogs).toHaveLength(1);
  });

  it("drops a favourite whose target no longer exists", async () => {
    // favoritable_type/_id is polymorphic, so no foreign key protects this — the alternative is
    // a blank card on SCR-29.
    const { walkerId } = await newWalker("fav-dangling@example.test");
    const organization = await insertOrganization();
    const dog = await insertDog(organization.id, "モモ");
    await addFavorite(db, walkerId, "Dog", dog.id);
    await db.delete(dogs).where(eq(dogs.id, dog.id));

    await expect(listFavorites(db, walkerId)).resolves.toMatchObject({ dogs: [] });
  });
});

describe("withdrawal", () => {
  it("ends the profile, suspends the account and revokes every session", async () => {
    const { walkerId } = await newWalker("withdraw@example.test");
    await createSession(db, walkerId, 30);

    await withdrawWalker(db, walkerId);

    expect(await getWalkerProfile(db, walkerId)).toMatchObject({ status: "withdrawn" });
    const [walker] = await db.select().from(walkers).where(eq(walkers.id, walkerId));
    expect(walker!.status).toBe("suspended");
    expect(await db.select().from(walkerSessions)).toHaveLength(0);
  });

  it("records it in the audit log", async () => {
    const { walkerId } = await newWalker("withdraw-log@example.test");

    await withdrawWalker(db, walkerId);

    const entries = await db.select().from(activityLog).where(eq(activityLog.event, "walker_profile.withdrawn"));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ causerType: "walker", causerId: walkerId });
  });

  it("is idempotent, and terminal", async () => {
    const { walkerId } = await newWalker("withdraw-twice@example.test");
    await withdrawWalker(db, walkerId);
    await withdrawWalker(db, walkerId);

    // Filling the profile in afterwards must not revive it (DEV-09 §2-4-2: withdrawn is terminal).
    await updateWalkerProfile(db, walkerId, FILLED);
    expect(await getWalkerProfile(db, walkerId)).toMatchObject({ status: "withdrawn" });
  });
});
