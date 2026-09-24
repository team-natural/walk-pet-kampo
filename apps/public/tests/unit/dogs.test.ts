// FG-05 and the public half of F-07-02. Two things this file exists to pin: another shelter's
// dog is never reachable, and the public view never carries `internalNotes`.
import { env } from "cloudflare:workers";
import { activityLog, dogs, organizationMembers, organizations, walkSlotDogs, walkSlots } from "@app/schema";
import { createDb } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { hashPassword } from "@app/server-kit/auth";
import { InvalidStateTransitionError, NotFoundError, ValidationError } from "@app/server-kit/http";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { OrganizationSession } from "../../src/lib/server/auth/organization-session";
import { allowedAdoptionTransitions, attachDogPhoto, createDog, deleteDog, getOwnDog, getPublishedDogBySlug, listOwnDogs, listPublishedDogs, transitionDog, updateDog, type DogInput } from "../../src/lib/server/services/dogs";

const db = createDb(env.DB);

const INPUT: DogInput = {
  name: "ハナ",
  breed: "柴犬ミックス",
  size: "medium",
  gender: "female",
  estimatedAge: "3歳くらい",
  weight: 9.4,
  temperament: "おだやか",
  humanSociability: "人好き",
  dogSociability: "小型犬とは相性がよい",
  walkNotes: "自転車に驚きやすいです。",
  requiredExperience: "none",
  beginnerAllowed: 1,
  childAllowed: 0,
  multiDogAllowed: 1,
  walkEligible: 1,
  introduction: "よろしくおねがいします。",
  internalNotes: "投薬中（2026-10 まで）。",
};

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngFile(): File {
  const body = new Uint8Array(64);
  body.set(PNG_HEADER);
  return new File([body], "dog.png", { type: "image/png" });
}

async function insertOrganization(status: (typeof organizations.$inferSelect)["status"] = "approved") {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizations)
    .values({ publicId: ulid(), name: `団体-${ulid()}`, slug: `org-${ulid().toLowerCase()}`, representativeName: "代表", addressVisibility: "prefecture_only", status, updatedAt: now })
    .returning();
  return row!;
}

async function sessionFor(organization: typeof organizations.$inferSelect): Promise<OrganizationSession> {
  const now = new Date().toISOString();
  const [member] = await db
    .insert(organizationMembers)
    .values({ organizationId: organization.id, role: "org_staff", name: "スタッフ", email: `member-${ulid().toLowerCase()}@example.test`, passwordHash: await hashPassword("correct horse battery staple"), status: "active", joinedAt: now, updatedAt: now })
    .returning();

  return { organizationMemberId: member!.id, organizationId: organization.id, organizationPublicId: organization.publicId, organizationName: organization.name, role: "org_staff", name: member!.name };
}

async function publish(publicId: string): Promise<void> {
  await db.update(dogs).set({ isPublished: 1 }).where(eq(dogs.publicId, publicId));
}

// Child rows first: none of these foreign keys cascade.
beforeEach(async () => {
  await db.delete(activityLog);
  await db.delete(walkSlotDogs);
  await db.delete(walkSlots);
  await db.delete(dogs);
  await db.delete(organizationMembers);
  await db.delete(organizations);
});

describe("createDog (F-05-02)", () => {
  it("starts unlisted and unpublished, whatever the form said", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);

    const { publicId } = await createDog(db, session, INPUT);

    const dog = await getOwnDog(db, organization.id, publicId);
    expect(dog).toMatchObject({ name: "ハナ", adoptionStatus: "not_listed", isPublished: 0, walkEligible: 1, childAllowed: 0 });
    // Derived, never taken from the name: two shelters may well use the same one.
    expect(dog.slug).toMatch(/^dog-[0-9a-hjkmnp-tv-z]{26}$/);
  });

  it("records who added it", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);

    await createDog(db, session, INPUT);

    const [entry] = await db.select().from(activityLog).where(eq(activityLog.event, "dog.created"));
    expect(entry).toMatchObject({ causerType: "organization_member", causerId: session.organizationMemberId, organizationId: organization.id });
  });
});

describe("the tenant boundary (DEV-02 §3)", () => {
  it("hides another shelter's dog from every entry point", async () => {
    const mine = await insertOrganization();
    const theirs = await insertOrganization();
    const mySession = await sessionFor(mine);
    const theirSession = await sessionFor(theirs);
    const { publicId } = await createDog(db, theirSession, INPUT);

    await expect(listOwnDogs(db, mine.id)).resolves.toHaveLength(0);
    await expect(getOwnDog(db, mine.id, publicId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateDog(db, mySession, publicId, { ...INPUT, isPublished: 1 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(transitionDog(db, mySession, publicId, "listed")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("transitionDog (DEV-09 §2-5-2)", () => {
  it("walks the documented path and stops at the terminal state", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);
    const { publicId } = await createDog(db, session, INPUT);

    await transitionDog(db, session, publicId, "listed");
    await transitionDog(db, session, publicId, "in_consultation");
    await transitionDog(db, session, publicId, "in_trial");
    await transitionDog(db, session, publicId, "adopted");

    await expect(getOwnDog(db, organization.id, publicId)).resolves.toMatchObject({ adoptionStatus: "adopted" });
    expect(allowedAdoptionTransitions("adopted")).toEqual([]);
    await expect(transitionDog(db, session, publicId, "listed")).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it("refuses a move the matrix does not have", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);
    const { publicId } = await createDog(db, session, INPUT);

    // not_listed → adopted: a dog nobody was looking for cannot have been adopted through us.
    await expect(transitionDog(db, session, publicId, "adopted")).rejects.toBeInstanceOf(InvalidStateTransitionError);
    await expect(getOwnDog(db, organization.id, publicId)).resolves.toMatchObject({ adoptionStatus: "not_listed" });
  });

  it("logs the move next to the change", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);
    const { publicId } = await createDog(db, session, INPUT);

    await transitionDog(db, session, publicId, "listed");

    const [entry] = await db.select().from(activityLog).where(eq(activityLog.event, "dog.listed"));
    expect(JSON.parse(entry!.properties!)).toMatchObject({ from: "not_listed", to: "listed" });
  });
});

describe("the public view (SCR-04, SCR-05)", () => {
  it("shows only published dogs of approved shelters", async () => {
    const approved = await insertOrganization();
    const suspended = await insertOrganization("suspended");
    const approvedSession = await sessionFor(approved);
    const suspendedSession = await sessionFor(suspended);

    const listed = await createDog(db, approvedSession, { ...INPUT, name: "公開中" });
    await createDog(db, approvedSession, { ...INPUT, name: "非公開" });
    const hidden = await createDog(db, suspendedSession, { ...INPUT, name: "停止中の団体の子" });
    await publish(listed.publicId);
    await publish(hidden.publicId);

    const visible = await listPublishedDogs(db);
    expect(visible.map((dog) => dog.name)).toEqual(["公開中"]);
  });

  it("never carries the staff-only note", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);
    const { publicId } = await createDog(db, session, INPUT);
    await publish(publicId);
    const { slug } = await getOwnDog(db, organization.id, publicId);

    const dog = await getPublishedDogBySlug(db, slug);

    expect(dog).not.toHaveProperty("internalNotes");
    expect(dog).not.toHaveProperty("isPublished");
    expect(dog.organizationName).toBe(organization.name);
  });

  it("answers 404 for a dog that is not published", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);
    const { publicId } = await createDog(db, session, INPUT);
    const { slug } = await getOwnDog(db, organization.id, publicId);

    await expect(getPublishedDogBySlug(db, slug)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("attachDogPhoto (F-05-02)", () => {
  it("files the photo under its own shelter and stores the key", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);
    const { publicId } = await createDog(db, session, INPUT);

    await attachDogPhoto(db, env.BUCKET, session, publicId, pngFile());

    const dog = await getOwnDog(db, organization.id, publicId);
    expect(dog.photoKey).toMatch(new RegExp(`^organizations/${organization.id}/dogs/\\d+/`));
    await expect(env.BUCKET.get(dog.photoKey!)).resolves.not.toBeNull();
  });

  it("refuses to hang a photo on another shelter's dog", async () => {
    const mine = await insertOrganization();
    const theirs = await insertOrganization();
    const mySession = await sessionFor(mine);
    const { publicId } = await createDog(db, await sessionFor(theirs), INPUT);

    await expect(attachDogPhoto(db, env.BUCKET, mySession, publicId, pngFile())).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("deleteDog (F-05-04)", () => {
  it("removes a dog nothing points at, and its photo with it", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);
    const { publicId } = await createDog(db, session, INPUT);
    await attachDogPhoto(db, env.BUCKET, session, publicId, pngFile());
    const { photoKey } = await getOwnDog(db, organization.id, publicId);

    await deleteDog(db, env.BUCKET, session, publicId);

    await expect(listOwnDogs(db, organization.id)).resolves.toHaveLength(0);
    await expect(env.BUCKET.get(photoKey!)).resolves.toBeNull();
  });

  it("refuses once the dog has a history, and says to unpublish instead", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);
    const { publicId } = await createDog(db, session, INPUT);
    const [dog] = await db.select().from(dogs).where(eq(dogs.publicId, publicId));
    const now = new Date().toISOString();
    const [slot] = await db.insert(walkSlots).values({ publicId: ulid(), organizationId: organization.id, title: "朝のおさんぽ", startAt: now, acceptanceStartAt: now, acceptanceEndAt: now, durationMinutes: 60, meetingPlace: "赤羽駅", areaPrefecture: "東京都", capacity: 4, requiredExperience: "none", status: "open", updatedAt: now }).returning();
    await db.insert(walkSlotDogs).values({ walkSlotId: slot!.id, dogId: dog!.id });

    await expect(deleteDog(db, env.BUCKET, session, publicId)).rejects.toBeInstanceOf(ValidationError);
    await expect(listOwnDogs(db, organization.id)).resolves.toHaveLength(1);
  });

  it("refuses another shelter's dog", async () => {
    const mine = await insertOrganization();
    const theirs = await insertOrganization();
    const { publicId } = await createDog(db, await sessionFor(theirs), INPUT);

    await expect(deleteDog(db, env.BUCKET, await sessionFor(mine), publicId)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("updateDog (F-05-02, F-05-04)", () => {
  it("saves the edit and leaves the adoption status alone", async () => {
    const organization = await insertOrganization();
    const session = await sessionFor(organization);
    const { publicId } = await createDog(db, session, INPUT);
    await transitionDog(db, session, publicId, "listed");

    const updated = await updateDog(db, session, publicId, { ...INPUT, name: "ハナ（改名）", walkEligible: 0, isPublished: 1 });

    expect(updated).toMatchObject({ name: "ハナ（改名）", walkEligible: 0, isPublished: 1, adoptionStatus: "listed" });
  });
});
