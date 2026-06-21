import { useQuery } from "@tanstack/react-query";

export type AccessTier = "free" | "trial" | "premium";
export type AccessSource = "stripe" | "admin" | "none";

export interface SubscriptionStatus {
  tier: AccessTier;
  source: AccessSource;
  isPremium: boolean;
  trialEndsAt: string | null;
  usage: {
    cards: { used: number; limit: number | null };
    vocal: { used: number; limit: number | null };
  };
}

export function useSubscription(enabled = true) {
  return useQuery<SubscriptionStatus>({
    queryKey: ["/api/subscription/status"],
    enabled,
    staleTime: 1000 * 60,
  });
}
