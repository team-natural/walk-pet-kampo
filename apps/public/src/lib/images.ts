// Where a stored public object is read from (DEV-10 §4-3). One place, so swapping the Worker
// route for an R2 custom domain later is a one-line change instead of a search across templates.
export function imageUrl(key: string): string {
  return `/images/${key}`;
}
