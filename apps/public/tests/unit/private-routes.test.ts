// The sitemap filter and the noindex meta both read this. A wrong answer either leaks a
// members-only URL into the index, or drops a public page out of the sitemap — neither shows up
// in a page render, so the boundary is pinned here instead.
import { describe, expect, it } from "vitest";
import { isPrivateRoute } from "../../src/lib/private-routes";

describe("isPrivateRoute", () => {
  it("covers the members-only landing pages themselves, not just what is under them", () => {
    // A plain startsWith("/mypage/") answers false for "/mypage" — the page most in need of it.
    expect(isPrivateRoute("/mypage")).toBe(true);
    expect(isPrivateRoute("/organization")).toBe(true);
    expect(isPrivateRoute("/checkout")).toBe(true);
  });

  it("covers everything nested under them, with or without a trailing slash", () => {
    expect(isPrivateRoute("/mypage/reservations")).toBe(true);
    expect(isPrivateRoute("/organization/dogs/")).toBe(true);
    expect(isPrivateRoute("/auth/login")).toBe(true);
    expect(isPrivateRoute("/verify/email/abc")).toBe(true);
    expect(isPrivateRoute("/register/complete/")).toBe(true);
  });

  it("does not swallow the public listing that shares a prefix", () => {
    // "/organizations" is SCR-02, a public page. A prefix match without the segment boundary
    // would hide the whole shelter directory from search.
    expect(isPrivateRoute("/organizations")).toBe(false);
    expect(isPrivateRoute("/organizations/kita-rescue")).toBe(false);
  });

  it("keeps the public pages public", () => {
    for (const path of ["/", "/dogs", "/dogs/momo", "/walks", "/news", "/news/sample", "/faq", "/about", "/contact"]) {
      expect(isPrivateRoute(path), path).toBe(false);
    }
  });

  it("treats the adoption inquiry under a public dog URL as private", () => {
    // SCR-49/50: a session is required, but the path starts with the public /dogs/ prefix.
    expect(isPrivateRoute("/dogs/momo/adoption-inquiry")).toBe(true);
    expect(isPrivateRoute("/dogs/momo/adoption-inquiry/complete")).toBe(true);
  });
});
