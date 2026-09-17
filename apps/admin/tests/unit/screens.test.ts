// The sitemap, enforced rather than described. PRD-04 §3-3 lists every platform screen and the
// file that serves it; this compares that list against the files on disk in both directions. A
// screen with no file fails, and a page with no row fails too — the second direction is the one
// review misses, because an orphan route looks like working code.
//
// Deliberately a copy of apps/public's screens.test.ts rather than a shared helper: the two apps
// must not import each other (DEV-01 §1), and the rules they check differ (this app has no SSG
// screen and one account system).
import { describe, expect, it } from "vitest";
import doc from "../../../../docs/2-product/04-ui-ux-design.md?raw";

const pages = import.meta.glob<string>("../../src/pages/**/*.astro", { query: "?raw", import: "default", eager: true });

const pagesByDocPath = new Map(Object.entries(pages).map(([path, source]) => [path.replace("../../src/", "apps/admin/src/"), source]));

interface Screen {
  id: string;
  name: string;
  path: string;
  authRequired: boolean;
}

// SYS-00 is the login screen itself; the two error pages render for anyone (PRD-04 §3-3).
const UNGUARDED = new Set(["SYS-00", "SYS-26", "SYS-27"]);

function parseScreens(markdown: string): Screen[] {
  const screens: Screen[] = [];
  for (const line of markdown.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length < 8) continue;
    const [, id, name, , component] = cells;
    if (!id || !/^SYS-\d+$/.test(id)) continue;

    // Strip the `（実装済み）` annotation and the backticks around the path.
    const path = component
      ?.replace(/（[^）]*）/g, "")
      .replace(/`/g, "")
      .trim();
    if (!path?.startsWith("apps/admin/")) continue;

    screens.push({ id, name: name ?? "", path, authRequired: !UNGUARDED.has(id) });
  }
  return screens;
}

const screens = parseScreens(doc);

it("finds the screen table", () => {
  // Guards the parser: if PRD-04's table format changed, every test below would pass vacuously.
  expect(screens.length).toBeGreaterThan(20);
  expect(screens.map((screen) => screen.id)).toContain("SYS-01");
});

describe("coverage", () => {
  it("has a file for every screen PRD-04 §3-3 lists", () => {
    const missing = screens.filter((screen) => !pagesByDocPath.has(screen.path)).map((screen) => `${screen.id} ${screen.name} -> ${screen.path}`);
    expect(missing).toEqual([]);
  });

  it("has a screen in PRD-04 §3-3 for every page on disk", () => {
    const listed = new Set(screens.map((screen) => screen.path));
    const orphans = [...pagesByDocPath.keys()].filter((path) => !listed.has(path));
    expect(orphans).toEqual([]);
  });

  it("gives every screen a matching id comment", () => {
    const wrong = screens.filter((screen) => !pagesByDocPath.get(screen.path)?.includes(`// ${screen.id} `)).map((screen) => screen.id);
    expect(wrong).toEqual([]);
  });
});

describe("delivery", () => {
  it("prerenders nothing", () => {
    // The admin console is behind a session on every screen; a prerendered one would serve the
    // same HTML to whoever asked.
    const prerendered = screens.filter((screen) => pagesByDocPath.get(screen.path)?.includes("export const prerender = true")).map((screen) => screen.id);
    expect(prerendered).toEqual([]);
  });
});

describe("guards", () => {
  it("redirects instead of answering 401 on every screen but the login and error pages", () => {
    const unguarded = screens
      .filter((screen) => screen.authRequired)
      .filter((screen) => !/if \(!session\) return Astro\.redirect\(/.test(pagesByDocPath.get(screen.path) ?? ""))
      .map((screen) => `${screen.id} ${screen.name}`);
    expect(unguarded).toEqual([]);
  });

  it("does not use requireRole", () => {
    // AdminUser is a single role, so a valid session is the whole authorization check. A
    // requireRole here would imply a role column that admin_users deliberately does not have
    // (GOV-01 D-011).
    // Matches the call, not the word: the reference page explains in a comment why there is no
    // role check, and that sentence is not a violation of itself.
    const withRoles = [...pagesByDocPath.entries()].filter(([, source]) => /requireRole\(/.test(source)).map(([path]) => path);
    expect(withRoles).toEqual([]);
  });
});

describe("mocks", () => {
  it("names the Service that will replace each mock", () => {
    const untracked = screens
      .filter((screen) => (pagesByDocPath.get(screen.path) ?? "").includes("$lib/mocks"))
      .filter((screen) => !(pagesByDocPath.get(screen.path) ?? "").includes(`TODO(${screen.id})`))
      .map((screen) => screen.id);
    expect(untracked).toEqual([]);
  });

  it("reports how many screens are still on mock data", () => {
    const remaining = screens.filter((screen) => (pagesByDocPath.get(screen.path) ?? "").includes("$lib/mocks"));
    // Not an upper bound to defend — it only goes down, and reaching 0 is what "implemented"
    // means for this app. Printed so the number is visible without reading every page.
    console.info(`apps/admin: ${remaining.length} / ${screens.length} screens still render mock data`);
    expect(remaining.length).toBeLessThanOrEqual(screens.length);
  });
});
