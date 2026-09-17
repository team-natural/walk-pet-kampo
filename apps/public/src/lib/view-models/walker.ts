import type { walkerProfiles, walkers } from "@app/schema";

type Row = typeof walkers.$inferSelect;
type ProfileRow = typeof walkerProfiles.$inferSelect;

// `passwordHash` is on the walkers row. Pick the fields a screen needs rather than spreading the
// row, so a credential can never reach a template by accident.
export type WalkerAccount = { id: string } & Pick<Row, "name" | "email">;

// `status` gates booking (PRD-01 §1-2), so every page that offers a reservation reads it here
// rather than assuming a signed-in walker is an eligible one.
export type WalkerProfileView = { id: string } & Pick<ProfileRow, "nameKana" | "birthdate" | "gender" | "postalCode" | "address" | "phone" | "phoneVerifiedAt" | "emergencyContactName" | "emergencyContactPhone" | "dogExperience" | "largeDogWalkExperience" | "preferredArea" | "guardianName" | "guardianPhone" | "termsAgreedAt" | "termsAgreedVersion" | "status">;
