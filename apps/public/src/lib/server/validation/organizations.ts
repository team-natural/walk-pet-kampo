// SCR-15 and SCR-51. Derived from the table where the shapes line up (DEV-01 §2), then narrowed
// to what an applicant may set — `status`, `slug` and the review columns are not theirs.
import { organizations } from "@app/schema";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => value.trim())
    .transform((value) => (value === "" ? null : value))
    .nullable();

export const applicationSchema = createInsertSchema(organizations)
  .pick({ name: true, representativeName: true, email: true, activityArea: true, introduction: true })
  .extend({
    name: z.string().min(1, "団体名を入力してください。").max(255),
    representativeName: z.string().min(1, "代表者名を入力してください。").max(255),
    email: z.email("メールアドレスの形式が正しくありません。").max(255),
    activityArea: optionalText(255),
    introduction: optionalText(2000),
  });

export const resubmissionSchema = z.object({
  token: z.string().min(1),
  note: z.string().min(1, "追加のご説明を入力してください。").max(2000),
});
