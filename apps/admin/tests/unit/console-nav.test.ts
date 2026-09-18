// The sidebar's active state, which review does not catch: a wrong highlight looks like a
// working page. Pinned because every href here is a prefix of at least one other admin route.
import { describe, expect, it } from "vitest";
import { CONSOLE_NAV, isCurrentRoute } from "../../src/lib/console-nav";

describe("isCurrentRoute", () => {
  it("matches the route itself", () => {
    expect(isCurrentRoute("/dashboard", "/dashboard")).toBe(true);
  });

  it("matches a detail screen under the route", () => {
    expect(isCurrentRoute("/organizations/01HZZ", "/organizations")).toBe(true);
    expect(isCurrentRoute("/organizations/01HZZ/members", "/organizations")).toBe(true);
  });

  it("stops at the segment boundary", () => {
    // The pair that a bare startsWith gets wrong: both nav entries would light up at once.
    expect(isCurrentRoute("/organization-applications", "/organizations")).toBe(false);
    expect(isCurrentRoute("/walkers", "/walks")).toBe(false);
  });

  it("does not match a longer sibling segment", () => {
    expect(isCurrentRoute("/dashboards", "/dashboard")).toBe(false);
  });
});

describe("CONSOLE_NAV", () => {
  it("never highlights two entries for one path", () => {
    const hrefs = CONSOLE_NAV.flatMap((group) => group.items.map((item) => item.href));
    for (const pathname of hrefs) {
      expect(hrefs.filter((href) => isCurrentRoute(pathname, href))).toEqual([pathname]);
    }
  });

  it("has no duplicate destinations", () => {
    const hrefs = CONSOLE_NAV.flatMap((group) => group.items.map((item) => item.href));
    expect(hrefs).toEqual([...new Set(hrefs)]);
  });
});
