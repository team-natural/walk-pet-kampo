// The one shared layout every template renders through (GOV-01 D-026). No template engine: the
// mail we send is a dozen fixed bodies with values dropped in, and React Email would put a JSX
// renderer in the Worker bundle to do it.
import { env } from "cloudflare:workers";

export interface MailBody {
  heading: string;
  /** One paragraph per entry. Plain sentences — no markup, it gets escaped either way. */
  paragraphs: string[];
  action?: { label: string; path: string };
}

// Subjects are prefixed uniformly so a recipient can filter on it (DEV-10 §3-4).
export function subject(line: string): string {
  return `【${env.APP_NAME}】${line}`;
}

export function absoluteUrl(path: string): string {
  return new URL(path, env.APP_URL).toString();
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

// Names and free text reach these templates, so everything interpolated is escaped — a shelter
// whose name contains an ampersand or a bracket must not be able to close a tag.
function escape(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ESCAPES[char]!);
}

export function renderText(body: MailBody): string {
  const lines = [body.heading, "", ...body.paragraphs];
  if (body.action) lines.push("", `${body.action.label}: ${absoluteUrl(body.action.path)}`);
  lines.push("", `— ${env.APP_NAME}`);
  return lines.join("\n");
}

export function renderHtml(body: MailBody): string {
  const paragraphs = body.paragraphs.map((paragraph) => `<p style="margin:0 0 12px">${escape(paragraph)}</p>`).join("");
  const action = body.action ? `<p style="margin:24px 0"><a href="${escape(absoluteUrl(body.action.path))}">${escape(body.action.label)}</a></p>` : "";

  return [`<div style="font-family:sans-serif;font-size:14px;line-height:1.8;color:#2b2b2b">`, `<h1 style="font-size:18px;margin:0 0 16px">${escape(body.heading)}</h1>`, paragraphs, action, `<p style="margin:24px 0 0;font-size:12px;color:#6b6b6b">— ${escape(env.APP_NAME)}</p>`, `</div>`].join("");
}
