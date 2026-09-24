// ADM-18 / ADM-19. `status`, the reporter and the attachment keys are the Service's; a form may
// only describe what happened.
import { incidents } from "@app/schema";
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

// `datetime-local` again (DEV-06 §1-2): the incident happened at a Japanese local time.
const jstDateTime = z
  .string()
  .min(1, "発生日時を入力してください。")
  .refine((value) => !Number.isNaN(new Date(`${value}+09:00`).getTime()), "日時の形式が正しくありません。")
  .transform(jstLocalToIso);

export const incidentSchema = createInsertSchema(incidents)
  .pick({ severity: true, category: true, description: true, location: true })
  .extend({
    severity: z.enum(["P0", "P1", "P2", "P3"]),
    category: z.enum(["bite", "escape", "injury", "dog_condition", "walker_condition", "property_damage", "interpersonal_trouble", "unauthorized_photo", "harassment", "other"]),
    occurredAt: jstDateTime,
    location: optionalText(255),
    description: z.string().min(1, "状況を入力してください。").max(4000),
  });

// F-12-03. The prevention measures ride along with the move to `resolved`, because that is the
// one transition the Service refuses without them.
export const incidentStatusSchema = z.object({
  to: z.enum(["reported", "investigating", "in_progress", "resolved", "closed"]),
  preventionMeasures: optionalText(2000).optional(),
});
