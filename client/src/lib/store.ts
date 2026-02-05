import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Language } from "./i18n";

interface AppState {
  language: Language;
  setLanguage: (lang: Language) => void;
  profileId: number | null;
  setProfileId: (id: number | null) => void;
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (value: boolean) => void;
  currentSessionId: number | null;
  setCurrentSessionId: (id: number | null) => void;
  sessionPhase: "flashcards" | "roleplay" | "debrief" | null;
  setSessionPhase: (phase: "flashcards" | "roleplay" | "debrief" | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      language: "fr",
      setLanguage: (lang) => set({ language: lang }),
      profileId: null,
      setProfileId: (id) => set({ profileId: id }),
      hasCompletedOnboarding: false,
      setHasCompletedOnboarding: (value) => set({ hasCompletedOnboarding: value }),
      currentSessionId: null,
      setCurrentSessionId: (id) => set({ currentSessionId: id }),
      sessionPhase: null,
      setSessionPhase: (phase) => set({ sessionPhase: phase }),
    }),
    {
      name: "bagou-storage",
    }
  )
);
