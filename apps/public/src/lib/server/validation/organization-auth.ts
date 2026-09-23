// Plain Zod (not drizzle-zod): none of these inputs is a table row — `password` arrives here and
// `passwordHash` is what the table stores.
import { z } from "zod";

// The minimum is a floor against empty submissions, not a policy: enforcing composition rules on
// an existing password would lock out accounts created before the rule.
const password = z.string().min(8, "パスワードは 8 文字以上で入力してください。");

export const organizationLoginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().min(1),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password,
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1).max(100),
  password,
});
