// Routes that must neither be crawled nor indexed: members-only, transactional, auth, error and
// the shelter console (DEV-06 §11-1).
//
// One list, read by both the sitemap filter in astro.config.mjs and the `noindex` default in
// Layout.astro. They answer different questions — "list this URL?" and "may a crawler index this
// page?" — and a URL that fails one always fails the other, so keeping two copies is how they
// drift. `public/robots.txt` mirrors it by hand because a static file cannot import anything.
export const PRIVATE_ROUTE_PREFIXES = ["/404", "/500", "/auth", "/mypage", "/checkout", "/register", "/verify", "/organization"];

export function isPrivateRoute(pathname: string): boolean {
  // SCR-49/50 sit under a public dog URL but require a session, so they match by shape.
  if (pathname.includes("/adoption-inquiry")) return true;
  // Match whole segments. A plain startsWith on "/organization/" misses "/organization" itself —
  // the dashboard — while a plain startsWith on "/organization" would swallow "/organizations",
  // the public listing. Both halves of this condition are load-bearing.
  return PRIVATE_ROUTE_PREFIXES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
