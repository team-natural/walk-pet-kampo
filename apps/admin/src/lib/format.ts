// The Worker's clock is UTC and every timestamp in D1 is stored as UTC, so the zone has to be
// named here: without it the console shows operators a date that is a day off for nine hours.
const TIME_ZONE = "Asia/Tokyo";

const date = new Intl.DateTimeFormat("ja-JP", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const dateTime = new Intl.DateTimeFormat("ja-JP", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });

export function formatDate(iso: string): string {
  return date.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

export function formatYen(amount: number): string {
  return yen.format(amount);
}

// Stored as seven bare digits (DEV-07), which is unreadable in a table.
export function formatPostalCode(value: string | null): string {
  if (!value) return "";
  return /^\d{7}$/.test(value) ? `〒${value.slice(0, 3)}-${value.slice(3)}` : value;
}
