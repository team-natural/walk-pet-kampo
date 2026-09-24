// Derived from the table where the shapes line up (DEV-01 §2 prefers drizzle-zod over a second
// hand-written definition), then narrowed to the fields SCR-22 actually submits — `status`,
// `phone_verified_at` and the consent columns are not the walker's to set from a form
// (DEV-02 §6 mass assignment).
import { walkerProfiles } from "@app/schema";
import { createUpdateSchema } from "drizzle-zod";
import { z } from "zod";

// Empty inputs arrive as "" from a form; the column stores NULL for "not answered", and the two
// must not both exist or "is it filled in?" gets two answers (DEV-09 §2-4-3 reads these).
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => value.trim())
    .transform((value) => (value === "" ? null : value))
    .nullable();

export const profileSchema = createUpdateSchema(walkerProfiles)
  .pick({ nameKana: true, birthdate: true, postalCode: true, address: true, phone: true, preferredArea: true, emergencyContactName: true, emergencyContactPhone: true })
  .extend({
    nameKana: optionalText(100),
    // <input type="date"> submits YYYY-MM-DD or nothing. Kept as text to match the column
    // (DEV-07 stores dates as ISO 8601 strings).
    birthdate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "生年月日の形式が正しくありません。")
      .nullable()
      .or(z.literal("").transform(() => null)),
    postalCode: optionalText(8),
    address: optionalText(255),
    phone: optionalText(20),
    preferredArea: optionalText(100),
    emergencyContactName: optionalText(100),
    emergencyContactPhone: optionalText(20),
  });

export type ProfileFormInput = z.infer<typeof profileSchema>;

export const favoriteSchema = z.object({
  type: z.enum(["Dog", "Organization"]),
  id: z.coerce.number().int().positive(),
});
