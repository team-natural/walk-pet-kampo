// SCR-17. The walk, the walker and the price are all the Service's to resolve — a form may only
// say how many people are coming and who to call on the day.
import { z } from "zod";

export const reservationSchema = z.object({
  participantCount: z
    .string()
    .transform((value) => Number(value))
    .refine((value) => Number.isInteger(value) && value >= 1 && value <= 20, "参加人数を確認してください。"),
  emergencyContactName: z.string().min(1, "緊急連絡先のお名前を入力してください。").max(255),
  emergencyContactPhone: z.string().min(1, "緊急連絡先の電話番号を入力してください。").max(32),
});

// Six digits as typed from the SMS; spaces are what a paste from a message app leaves behind.
export const phoneCodeSchema = z.object({
  code: z
    .string()
    .transform((value) => value.replace(/\s/g, ""))
    .refine((value) => /^[0-9]{6}$/.test(value), "6 桁の数字を入力してください。"),
});
