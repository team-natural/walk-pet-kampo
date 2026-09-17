// The sitemap, enforced rather than described. PRD-04 §3 lists every screen and the file that
// serves it; this compares that list against the files on disk in both directions. A screen with
// no file fails, and a page with no row fails too — the second direction is the one review
// misses, because an orphan route looks like working code.
//
// Both the doc and the pages are pulled in at build time (`?raw` / `import.meta.glob`), since
// these tests run inside workerd and have no filesystem.
import { describe, expect, it } from "vitest";
import doc from "../../../../docs/2-product/04-ui-ux-design.md?raw";

const pages = import.meta.glob<string>("../../src/pages/**/*.astro", { query: "?raw", import: "default", eager: true });

// Keyed by the path PRD-04 writes, so the two sides compare without normalising at every use.
const pagesByDocPath = new Map(Object.entries(pages).map(([path, source]) => [path.replace("../../src/", "apps/public/src/"), source]));

interface Screen {
  id: string;
  name: string;
  path: string;
  prerender: boolean;
  authRequired: boolean;
}

// ADM-00/24/25/26 are the ways in for someone who has no session yet: login, the two password
// reset steps, and invitation acceptance (PRD-04 §3-2). Every other 保護団体ページ is guarded.
const UNGUARDED_ADM = new Set(["ADM-00", "ADM-24", "ADM-25", "ADM-26"]);

function parseScreens(markdown: string): Screen[] {
  const screens: Screen[] = [];
  for (const line of markdown.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length < 8) continue;
    const [, id, name, , component, ...rest] = cells;
    if (!id || !/^(SCR|ADM|SYS)-\d+$/.test(id)) continue;

    // Strip the `（実装済み）` annotation and the backticks around the path.
    const path = component
      ?.replace(/（[^）]*）/g, "")
      .replace(/`/g, "")
      .trim();
    if (!path?.startsWith("apps/")) continue;

    const isScr = id.startsWith("SCR-");
    const delivery = isScr ? rest[0] : undefined;
    const auth = isScr ? rest[1] : undefined;

    screens.push({
      id,
      name: name ?? "",
      path,
      prerender: delivery?.includes("SSG") ?? false,
      authRequired: isScr ? (auth?.includes("必要") ?? false) : id.startsWith("ADM-") ? !UNGUARDED_ADM.has(id) : !["SYS-00", "SYS-26", "SYS-27"].includes(id),
    });
  }
  return screens;
}

const screens = parseScreens(doc).filter((screen) => screen.path.startsWith("apps/public/"));

it("finds the screen tables", () => {
  // Guards the parser: if PRD-04's table format changed, every test below would pass vacuously.
  expect(screens.length).toBeGreaterThan(70);
  expect(screens.map((screen) => screen.id)).toContain("SCR-01");
  expect(screens.map((screen) => screen.id)).toContain("ADM-00");
});

describe("coverage", () => {
  it("has a file for every screen PRD-04 §3 lists", () => {
    const missing = screens.filter((screen) => !pagesByDocPath.has(screen.path)).map((screen) => `${screen.id} ${screen.name} -> ${screen.path}`);
    expect(missing).toEqual([]);
  });

  it("has a screen in PRD-04 §3 for every page on disk", () => {
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
  it("prerenders exactly the screens PRD-04 marks SSG", () => {
    // `output: "server"` ignores getStaticPaths() without a word, so the symptom of a missing
    // directive is the list rendering and the detail page 500ing (DEV-06 §1-1).
    const wrong = screens.filter((screen) => (pagesByDocPath.get(screen.path)?.includes("export const prerender = true") ?? false) !== screen.prerender).map((screen) => `${screen.id} (SSG: ${screen.prerender})`);
    expect(wrong).toEqual([]);
  });
});

describe("guards", () => {
  it("redirects instead of answering 401 on every screen marked 認証必要", () => {
    const unguarded = screens
      .filter((screen) => screen.authRequired)
      .filter((screen) => {
        const source = pagesByDocPath.get(screen.path) ?? "";
        return !/if \(!session\) return Astro\.redirect\(/.test(source);
      })
      .map((screen) => `${screen.id} ${screen.name}`);
    expect(unguarded).toEqual([]);
  });

  it("does not guard the screens that let a signed-out visitor in", () => {
    const overGuarded = screens
      .filter((screen) => !screen.authRequired)
      .filter((screen) => /if \(!session\) return Astro\.redirect\(/.test(pagesByDocPath.get(screen.path) ?? ""))
      .map((screen) => `${screen.id} ${screen.name}`);
    expect(overGuarded).toEqual([]);
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
    console.info(`apps/public: ${remaining.length} / ${screens.length} screens still render mock data`);
    expect(remaining.length).toBeLessThanOrEqual(screens.length);
  });
});
