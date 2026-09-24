// ADM-09 / ADM-10. `status`, `reserved_count`, `fee_per_person` and the coordinates are not the
// form's to set: the fee is a platform constant (DEV-06 §1-1) and the rest are the Service's.
import { walkSlots } from "@app/schema";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { jstLocalToIso } from "../../datetime";

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => value.trim())
    .transform((value) => (value === "" ? null : value))
    .nullable();

const checkbox = z.union([z.literal("0"), z.literal("1"), z.literal("on"), z.null(), z.undefined()]).transform((value) => (value === "1" || value === "on" ? 1 : 0));

// `datetime-local` posts "2026-10-03T09:00" with no zone. Converting here rather than in the
// route means every caller stores the same instant (DEV-06 §1-2).
const jstDateTime = z
  .string()
  .min(1, "日時を入力してください。")
  .refine((value) => !Number.isNaN(new Date(`${value}+09:00`).getTime()), "日時の形式が正しくありません。")
  .transform(jstLocalToIso);

const positiveInt = (message: string) =>
  z
    .string()
    .transform((value) => Number(value))
    .refine((value) => Number.isInteger(value) && value > 0, message);

const optionalInt = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (value === null || value === undefined || value.trim() === "" ? null : Number(value)))
  .refine((value) => value === null || (Number.isInteger(value) && value >= 0), "半角の数字で入力してください。");

export const walkSlotSchema = createInsertSchema(walkSlots)
  .pick({ title: true, description: true, meetingPlace: true, areaPrefecture: true, areaCity: true, requiredExperience: true, clothingNotes: true, precautions: true, weatherPolicy: true, cancellationPolicy: true })
  .extend({
    title: z.string().min(1, "タイトルを入力してください。").max(255),
    description: optionalText(2000),
    startAt: jstDateTime,
    acceptanceStartAt: jstDateTime,
    acceptanceEndAt: jstDateTime,
    durationMinutes: positiveInt("所要時間は分単位の数字で入力してください。"),
    meetingPlace: z.string().min(1, "集合場所を入力してください。").max(255),
    areaPrefecture: z.string().min(1, "都道府県を入力してください。").max(64),
    areaCity: optionalText(64),
    capacity: positiveInt("定員は 1 名以上で入力してください。"),
    staffAccompanied: checkbox,
    beginnerAllowed: checkbox,
    childAllowed: checkbox,
    minAge: optionalInt,
    requiredExperience: z.enum(["none", "some", "experienced"]),
    clothingNotes: optionalText(255),
    precautions: optionalText(2000),
    weatherPolicy: optionalText(255),
    cancellationPolicy: optionalText(2000),
  });

// F-06-02. Which of these is reachable from where is the transition table's call, not the form's.
export const walkSlotStatusSchema = z.object({
  to: z.enum(["draft", "scheduled", "open", "full", "closed", "cancelled", "completed", "unpublished"]),
});

// DEV-04 §5-13: the reason picks which cancelled_* the reservations inherit (DEV-09 §2-6-4), so
// it is a closed set rather than free text.
export const walkSlotCancelSchema = z.object({
  reason: z.enum(["organization", "weather", "dog_condition"]).catch("organization"),
});
