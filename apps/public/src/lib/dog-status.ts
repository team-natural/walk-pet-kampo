// Display labels for the dog columns that are enums in the table. DEV-09 §2-5-1 and DEV-07 §5-8
// are the source — reword there first. The raw values never reach a screen on this side.
export const ADOPTION_STATUS_LABELS: Record<string, string> = {
  not_listed: "里親募集前",
  listed: "里親募集中",
  in_consultation: "相談中",
  in_trial: "トライアル中",
  adopted: "譲渡決定",
  listing_closed: "募集終了",
};

export const DOG_SIZE_LABELS: Record<string, string> = {
  small: "小型",
  medium: "中型",
  large: "大型",
};

// The column is free text (DEV-07 §5-8), but the forms write these two values so the public
// screens can label them — a shelter typing its own wording still renders, unchanged.
export const DOG_GENDER_LABELS: Record<string, string> = {
  male: "オス",
  female: "メス",
};

export const REQUIRED_EXPERIENCE_LABELS: Record<string, string> = {
  none: "不問",
  some: "多少あると安心",
  experienced: "経験者のみ",
};

export function adoptionStatusLabel(status: string): string {
  return ADOPTION_STATUS_LABELS[status] ?? status;
}

export function dogSizeLabel(size: string | null): string {
  return size ? (DOG_SIZE_LABELS[size] ?? size) : "—";
}

export function dogGenderLabel(gender: string | null): string {
  return gender ? (DOG_GENDER_LABELS[gender] ?? gender) : "—";
}

export function requiredExperienceLabel(value: string): string {
  return REQUIRED_EXPERIENCE_LABELS[value] ?? value;
}
