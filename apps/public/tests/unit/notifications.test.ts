// What the two channels do is covered here; what they say is in the mail templates, which are
// pure functions and tested below without touching Resend (DEV-10 §10).
import { env } from "cloudflare:workers";
import { notificationSettings, notifications } from "@app/schema";
import { createDb } from "@app/schema/client";
import { beforeEach, describe, expect, it } from "vitest";
import { getNotificationSettings, listNotifications, markNotificationRead, notificationInsert, resolveChannels, updateNotificationSettings, type Recipient } from "../../src/lib/server/services/notifications";
import { optionalTypesFor } from "../../src/lib/notification-types";

const db = createDb(env.DB);
const WALKER = { type: "walker", id: 1 } as const;
const OTHER_WALKER = { type: "walker", id: 2 } as const;
const MEMBER = { type: "organization_member", id: 1 } as const;

beforeEach(async () => {
  await db.delete(notifications);
  await db.delete(notificationSettings);
});

describe("channels", () => {
  it("defaults to both when nothing has been configured", async () => {
    await expect(resolveChannels(db, WALKER, "walk_reminder")).resolves.toEqual({ app: true, email: true });
  });

  it("honours a preference once it is saved", async () => {
    await updateNotificationSettings(db, WALKER, [{ type: "walk_reminder", emailEnabled: false, inAppEnabled: false }]);

    await expect(resolveChannels(db, WALKER, "walk_reminder")).resolves.toEqual({ app: false, email: false });
  });

  it("ignores preferences for a transactional type", async () => {
    // SCR-48 promises the confirmation always arrives, so reservation_confirmed must not be
    // switchable — not even by writing the row directly.
    await db.insert(notificationSettings).values({ subjectType: "walker", subjectId: WALKER.id, notificationType: "reservation_confirmed", emailEnabled: 0, appEnabled: 0, updatedAt: new Date().toISOString() });

    await expect(resolveChannels(db, WALKER, "reservation_confirmed")).resolves.toEqual({ app: true, email: true });
  });

  it("keeps one recipient's preferences off another's", async () => {
    await updateNotificationSettings(db, WALKER, [{ type: "walk_reminder", emailEnabled: false, inAppEnabled: false }]);

    await expect(resolveChannels(db, OTHER_WALKER, "walk_reminder")).resolves.toEqual({ app: true, email: true });
  });

  it("does not let a Walker's row answer for the OrganizationMember with the same id", async () => {
    // notification_settings is keyed by (subject_type, subject_id): the two systems have
    // overlapping integer ids, and subject_type is the only thing keeping them apart.
    await updateNotificationSettings(db, WALKER, [{ type: "walk_reminder", emailEnabled: false, inAppEnabled: false }]);

    await expect(resolveChannels(db, MEMBER, "incident_update")).resolves.toEqual({ app: true, email: true });
  });
});

describe("settings", () => {
  it("lists every optional type for the audience, and only that audience's", async () => {
    const walkerSettings = await getNotificationSettings(db, WALKER);
    const memberSettings = await getNotificationSettings(db, MEMBER);

    expect(walkerSettings.map((setting) => setting.type)).toEqual(optionalTypesFor("walker"));
    expect(memberSettings.map((setting) => setting.type)).toEqual(optionalTypesFor("organization_member"));
    expect(walkerSettings.every((setting) => setting.emailEnabled && setting.inAppEnabled)).toBe(true);
  });

  it("upserts rather than duplicating on a second save", async () => {
    await updateNotificationSettings(db, WALKER, [{ type: "walk_reminder", emailEnabled: false, inAppEnabled: true }]);
    await updateNotificationSettings(db, WALKER, [{ type: "walk_reminder", emailEnabled: true, inAppEnabled: false }]);

    const rows = await db.select().from(notificationSettings);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ emailEnabled: 1, appEnabled: 0 });
  });
});

describe("the inbox", () => {
  async function arrive(recipient: Recipient, body = "お散歩の 3 日前になりました。") {
    await db.batch([notificationInsert(db, { recipient, type: "walk_reminder", body })]);
  }

  it("returns the recipient's own notifications, newest first", async () => {
    await arrive(WALKER, "1 通目");
    await arrive(WALKER, "2 通目");
    await arrive(OTHER_WALKER, "別の参加者宛");

    const { items } = await listNotifications(db, WALKER);
    expect(items.map((item) => item.body)).toEqual(["2 通目", "1 通目"]);
  });

  it("separates the two account systems even on the same id", async () => {
    await arrive(WALKER, "参加者宛");
    await arrive(MEMBER, "団体スタッフ宛");

    const { items } = await listNotifications(db, MEMBER);
    expect(items.map((item) => item.body)).toEqual(["団体スタッフ宛"]);
  });

  it("marks a notification read, once", async () => {
    await arrive(WALKER);
    const { items } = await listNotifications(db, WALKER);

    await expect(markNotificationRead(db, WALKER, items[0]!.id)).resolves.toBe(true);

    const { items: after } = await listNotifications(db, WALKER);
    expect(after[0]!.readAt).not.toBeNull();
  });

  it("refuses to mark someone else's notification, and says nothing about it", async () => {
    await arrive(WALKER);
    const { items } = await listNotifications(db, WALKER);

    // Same answer as a ULID that does not exist at all — otherwise the endpoint confirms which
    // ids are real.
    await expect(markNotificationRead(db, OTHER_WALKER, items[0]!.id)).resolves.toBe(false);
    await expect(markNotificationRead(db, OTHER_WALKER, "01HZZNOTAREALNOTIFICATION")).resolves.toBe(false);
  });
});
