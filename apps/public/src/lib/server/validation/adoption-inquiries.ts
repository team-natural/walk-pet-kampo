// SCR-49 and ADM-21. The two long answers are what TBD-30 settled on as required; the status is
// a closed set whose reachability the Service decides (DEV-09 §2-11-2).
import { z } from "zod";

export const adoptionInquirySchema = z.object({
  motivation: z.string().min(1, "希望理由を入力してください。").max(2000),
  livingEnvironment: z.string().min(1, "飼育環境を入力してください。").max(2000),
});

export const adoptionInquiryStatusSchema = z.object({
  to: z.enum(["received", "organization_reviewing", "contacted", "interview_scheduled", "transferred_to_organization_process", "closed", "withdrawn"]),
});
