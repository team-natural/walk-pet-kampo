import type { notifications } from "@app/schema";

type Row = typeof notifications.$inferSelect;

// `payload` is stored as a JSON string. The Service parses it into `body` — a page must not call
// JSON.parse on a column value in its frontmatter.
export type NotificationView = { id: string; body: string } & Pick<Row, "type" | "readAt" | "createdAt">;

// Walker and OrganizationMember share the notification_settings table (DEV-07 §5-18), so the
// system the row belongs to is part of the key, not an assumption the screen makes.
export type NotificationSettingView = { type: string; emailEnabled: boolean; inAppEnabled: boolean };
