// In-app notifications and the per-type preferences behind them (F-13-01, F-13-03).
//
// Delivery is two channels, never one abstraction: the row inserted here is what SCR-32/ADM-22
// list, and the mail is sent separately through lib/server/mail (DEV-05 §4-1). Only the decision
// of *whether* to use each channel lives in this file.
import { notificationSettings, notifications } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { and, desc, eq, lt } from "drizzle-orm";
// Relative, not `$lib`: server modules run under Vitest too, where that alias is not configured.
import { NOTIFICATION_TYPES, optionalTypesFor, type NotificationAudience, type NotificationType } from "../../notification-types";
import type { NotificationSettingView, NotificationView } from "../../view-models/notification";

export interface Recipient {
  type: NotificationAudience;
  id: number;
}

export interface Channels {
  app: boolean;
  email: boolean;
}

type NotificationRow = typeof notifications.$inferSelect;

function toView(row: NotificationRow): NotificationView {
  // `payload` is a JSON string in the column; a screen must never parse a column value itself.
  const payload = JSON.parse(row.payload) as { body?: unknown };
  return {
    id: row.publicId,
    body: typeof payload.body === "string" ? payload.body : "",
    type: row.type,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

// Transactional types are not a preference (SCR-48 says so on screen), so they never reach the
// settings table. For the rest, a missing row means "not yet configured" and both channels are
// on — the same default the column carries.
export async function resolveChannels(db: DbClient, recipient: Recipient, type: NotificationType): Promise<Channels> {
  if (!NOTIFICATION_TYPES[type].optional) return { app: true, email: true };

  const [row] = await db
    .select()
    .from(notificationSettings)
    .where(and(eq(notificationSettings.subjectType, recipient.type), eq(notificationSettings.subjectId, recipient.id), eq(notificationSettings.notificationType, type)))
    .limit(1);

  if (!row) return { app: true, email: true };
  return { app: row.appEnabled === 1, email: row.emailEnabled === 1 };
}

// Returned unexecuted so a state transition can put it in the same batch as the change it
// announces — a notification about a rolled-back write must not survive (DEV-05 §4-1).
export function notificationInsert(db: DbClient, entry: { recipient: Recipient; type: NotificationType; body: string; href?: string }) {
  return db.insert(notifications).values({
    publicId: ulid(),
    recipientType: entry.recipient.type,
    recipientId: entry.recipient.id,
    type: entry.type,
    payload: JSON.stringify({ body: entry.body, href: entry.href }),
  });
}

const DEFAULT_PER_PAGE = 20;

export async function listNotifications(db: DbClient, recipient: Recipient, options: { beforeId?: number | null; perPage?: number } = {}) {
  const perPage = Math.min(Math.max(options.perPage ?? DEFAULT_PER_PAGE, 1), 100);
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientType, recipient.type), eq(notifications.recipientId, recipient.id), options.beforeId ? lt(notifications.id, options.beforeId) : undefined))
    .orderBy(desc(notifications.id))
    .limit(perPage + 1);

  const hasMore = rows.length > perPage;
  const page = rows.slice(0, perPage);
  return { items: page.map(toView), perPage, nextId: hasMore ? page[page.length - 1]!.id : null };
}

// Scoped by recipient, not just by public id: without it, anyone holding a ULID could mark — and
// therefore probe the existence of — someone else's notification.
export async function markNotificationRead(db: DbClient, recipient: Recipient, publicId: string): Promise<boolean> {
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(notifications.publicId, publicId), eq(notifications.recipientType, recipient.type), eq(notifications.recipientId, recipient.id)))
    .returning({ id: notifications.id });

  return updated.length > 0;
}

// The screen shows every optional type for this audience, configured or not, so a preference
// that has never been saved still renders with its default rather than going missing.
export async function getNotificationSettings(db: DbClient, recipient: Recipient): Promise<NotificationSettingView[]> {
  const rows = await db
    .select()
    .from(notificationSettings)
    .where(and(eq(notificationSettings.subjectType, recipient.type), eq(notificationSettings.subjectId, recipient.id)));

  const saved = new Map(rows.map((row) => [row.notificationType, row]));

  return optionalTypesFor(recipient.type).map((type) => {
    const row = saved.get(type);
    return {
      type,
      emailEnabled: row ? row.emailEnabled === 1 : true,
      inAppEnabled: row ? row.appEnabled === 1 : true,
    };
  });
}

export async function updateNotificationSettings(db: DbClient, recipient: Recipient, values: { type: NotificationType; emailEnabled: boolean; inAppEnabled: boolean }[]): Promise<void> {
  const now = new Date().toISOString();

  // One upsert per type rather than delete-then-insert: the unique index is the conflict target,
  // and a failed re-insert would otherwise leave the recipient with no preferences at all.
  const statements = values.map((value) =>
    db
      .insert(notificationSettings)
      .values({
        subjectType: recipient.type,
        subjectId: recipient.id,
        notificationType: value.type,
        emailEnabled: value.emailEnabled ? 1 : 0,
        appEnabled: value.inAppEnabled ? 1 : 0,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [notificationSettings.subjectType, notificationSettings.subjectId, notificationSettings.notificationType],
        set: { emailEnabled: value.emailEnabled ? 1 : 0, appEnabled: value.inAppEnabled ? 1 : 0, updatedAt: now },
      }),
  );

  // batch() is typed as a non-empty tuple, which a mapped array cannot prove it is.
  if (statements.length === 0) return;
  await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
}
