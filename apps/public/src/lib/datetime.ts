// `datetime-local` has no timezone, and a Worker runs in UTC — `new Date("2026-10-03T09:00")` is
// parsed as UTC there and as JST on a developer's machine. Every walk is a Japanese local time
// (PRD-01), so the offset is applied explicitly in both directions instead.
const JST_OFFSET = "+09:00";

/** A `datetime-local` value (JST) to the ISO string stored in D1. */
export function jstLocalToIso(value: string): string {
  return new Date(`${value}${JST_OFFSET}`).toISOString();
}

/** The stored ISO string back to the `YYYY-MM-DDTHH:mm` a `datetime-local` input wants. */
export function isoToJstLocal(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo" }).formatToParts(new Date(iso));
  const at = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
  // en-CA gives 24-hour parts with zero padding; "24" for midnight is the one case it does not.
  const hour = at("hour") === "24" ? "00" : at("hour");
  return `${at("year")}-${at("month")}-${at("day")}T${hour}:${at("minute")}`;
}
