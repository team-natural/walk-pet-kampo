// ADM-06 / ADM-07. Derived from the table (DEV-01 §2), then narrowed: `slug`, `publicId`,
// `organizationId`, `adoptionStatus` and `photoKey` are not a form's to set (DEV-02 §6).
import { dogs } from "@app/schema";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => value.trim())
    .transform((value) => (value === "" ? null : value))
    .nullable();

// A checkbox sends nothing when unchecked, so every boolean column arrives as the "0" companion
// the form renders alongside it — absent still has to mean 0, not "leave as it was".
const checkbox = z.union([z.literal("0"), z.literal("1"), z.literal("on"), z.null(), z.undefined()]).transform((value) => (value === "1" || value === "on" ? 1 : 0));

const optionalNumber = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (value === null || value === undefined || value.trim() === "" ? null : Number(value)))
  .refine((value) => value === null || (Number.isFinite(value) && value > 0), "体重は正の数で入力してください。");

export const dogSchema = createInsertSchema(dogs)
  .pick({ name: true, breed: true, size: true, gender: true, estimatedAge: true, temperament: true, humanSociability: true, dogSociability: true, walkNotes: true, requiredExperience: true, introduction: true, internalNotes: true })
  .extend({
    name: z.string().min(1, "名前を入力してください。").max(255),
    breed: optionalText(255),
    // Nullable in the table (DEV-07 §5-8): a rescue's breed and size are not always known.
    size: z.enum(["small", "medium", "large"]).nullable().catch(null),
    gender: optionalText(32),
    estimatedAge: optionalText(64),
    weight: optionalNumber,
    temperament: optionalText(500),
    humanSociability: optionalText(255),
    dogSociability: optionalText(255),
    walkNotes: optionalText(2000),
    requiredExperience: z.enum(["none", "some", "experienced"]),
    beginnerAllowed: checkbox,
    childAllowed: checkbox,
    multiDogAllowed: checkbox,
    walkEligible: checkbox,
    introduction: optionalText(2000),
    internalNotes: optionalText(2000),
  });

// F-05-04. Kept out of dogSchema so ADM-06 cannot publish a dog on creation — publishing is a
// second, deliberate action on ADM-07.
export const dogPublishSchema = z.object({ isPublished: checkbox });

// F-05-03. The closed set is DEV-09 §2-5-1; which of them is reachable is the Service's call.
export const adoptionStatusSchema = z.object({
  to: z.enum(["not_listed", "listed", "in_consultation", "in_trial", "adopted", "listing_closed"]),
});
