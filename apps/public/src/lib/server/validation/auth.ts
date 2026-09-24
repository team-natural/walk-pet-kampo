// Plain Zod (not drizzle-zod) — login input has no 1:1 shape with a table row
// (`password` here, `passwordHash` in `walkers`).
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

// A floor against empty submissions, not a composition policy: rules like "one symbol" push
// people towards predictable substitutions and lock out accounts made before the rule.
const password = z.string().min(8, "パスワードは 8 文字以上で入力してください。");

export const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.email("メールアドレスの形式が正しくありません。").max(255),
  password,
  // Checkbox: present means agreed, absent means it was never ticked. The form marks it
  // `required`, but the browser is not where consent gets recorded (F-01-06).
  termsAgreed: z.literal("on", { error: "利用規約とプライバシーポリシーへの同意が必要です。" }),
});

export const forgotPasswordSchema = z.object({
  email: z.string().min(1),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password,
});
