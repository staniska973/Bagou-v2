import { useLocation } from "wouter";
import { Crown, Sparkles } from "lucide-react";
import { useSubscription } from "@/hooks/use-subscription";

/**
 * Small clickable status pill shown in the app header. Reflects the live tier
 * (Premium / Essai / Gratuit) and routes to the subscription page on click.
 */
export function SubscriptionBadge() {
  const [, navigate] = useLocation();
  const { data } = useSubscription();

  if (!data) return null;

  const tier = data.tier;
  const label = tier === "premium" ? "Premium" : tier === "trial" ? "Essai" : "Gratuit";
  const isPaid = tier === "premium" || tier === "trial";

  return (
    <button
      type="button"
      onClick={() => navigate("/abonnement")}
      data-testid="badge-subscription"
      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors hover-elevate active-elevate-2 ${
        isPaid
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground"
      }`}
    >
      {isPaid ? <Crown className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
      {label}
    </button>
  );
}
