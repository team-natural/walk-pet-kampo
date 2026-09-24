// Form bodies for the shelter console (DEV-04 §5-16). A checkbox renders a hidden "0" next to it
// so unchecked reaches the server at all, which means two values arrive for one name — the last
// one is the answer, and `form.get()` returns the first.
export function lastValues(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}
