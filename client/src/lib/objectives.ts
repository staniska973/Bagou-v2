import { themeIdEnum } from "@shared/schema";

export type ObjectiveKey = Exclude<(typeof themeIdEnum)[number], "CULTURE_SOCIALE">;

export const OBJECTIVE_LABELS: Record<ObjectiveKey, string> = {
  SOCIAL: "Social",
  PRO: "Pro",
  DAILY: "Quotidien",
  RELATIONNEL: "Relationnel",
  DIFFICULT: "Difficile",
  STORY: "Storytelling",
};

export const isUserObjective = (
  key: (typeof themeIdEnum)[number],
): key is ObjectiveKey => key !== "CULTURE_SOCIALE";

export const OBJECTIVES: { key: ObjectiveKey; label: string }[] = themeIdEnum
  .filter(isUserObjective)
  .map((key) => ({ key, label: OBJECTIVE_LABELS[key] }));
