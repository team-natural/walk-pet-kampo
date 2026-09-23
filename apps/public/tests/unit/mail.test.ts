// Templates are pure functions, so they are tested directly — Resend is never called here
// (DEV-10 §10). sendMail() with no RESEND_API_KEY logs and returns, which is what the bindings
// in vitest.config.ts arrange.
import { describe, expect, it } from "vitest";
import { renderHtml, renderText, subject, absoluteUrl } from "../../src/lib/server/mail/layout";

const body = {
  heading: "パスワード再設定のご案内",
  paragraphs: ["下のリンクから新しいパスワードを設定してください。"],
  action: { label: "パスワードを再設定する", path: "/organization/reset-password/abc123" },
};

describe("the mail layout", () => {
  it("prefixes every subject with the service name", () => {
    expect(subject("パスワード再設定のご案内")).toBe("【テストサービス】パスワード再設定のご案内");
  });

  it("turns a path into an absolute URL, because a mail client has no origin", () => {
    expect(absoluteUrl("/organization/login")).toBe("https://example.test/organization/login");
    expect(renderText(body)).toContain("https://example.test/organization/reset-password/abc123");
  });

  it("renders the action as a real link in both parts", () => {
    expect(renderText(body)).toContain("パスワードを再設定する: https://example.test/");
    expect(renderHtml(body)).toContain('<a href="https://example.test/organization/reset-password/abc123">');
  });

  it("escapes interpolated text, so a name cannot close a tag", () => {
    const hostile = renderHtml({ heading: "<script>alert(1)</script>", paragraphs: ['" onload="alert(1)'] });

    expect(hostile).not.toContain("<script>");
    expect(hostile).toContain("&lt;script&gt;");
    expect(hostile).toContain("&quot; onload=");
  });
});
