import type { walkerProfiles, walkers } from "@app/schema";

type Row = typeof walkers.$inferSelect;
type ProfileRow = typeof walkerProfiles.$inferSelect;

// `passwordHash` is on the walkers row. Pick the fields a screen needs rather than spreading the
// row, so a credential can never reach a template by accident.
export type WalkerSummary = { id: string; profileStatus: ProfileRow["status"] } & Pick<Row, "name" | "email" | "createdAt">;

export type WalkerDetail = WalkerSummary & { reservationCount: number } & Pick<ProfileRow, "nameKana" | "birthdate" | "gender" | "postalCode" | "address" | "phone" | "phoneVerifiedAt" | "emergencyContactName" | "emergencyContactPhone" | "dogExperience" | "largeDogWalkExperience" | "termsAgreedAt" | "termsAgreedVersion">;
