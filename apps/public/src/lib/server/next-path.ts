// A "come back here afterwards" parameter, kept to paths on this site. An absolute URL would
// make any screen carrying one an open redirect, and `//evil.test` is a URL, not a path.
export function safeNext(value: FormDataEntryValue | string | null): string | null {
  if (typeof value !== "string") return null;
  return value.startsWith("/") && !value.startsWith("//") ? value : null;
}
