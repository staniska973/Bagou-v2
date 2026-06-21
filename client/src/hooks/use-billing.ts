import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface Plan {
  priceId: string;
  unitAmount: number;
  currency: string;
  interval: string;
  productName: string;
}

export function formatPrice(unitAmount: number, currency: string): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: (currency || "eur").toUpperCase(),
    minimumFractionDigits: 2,
  }).format(unitAmount / 100);
}

export function intervalLabel(interval: string): string {
  if (interval === "year") return "/an";
  if (interval === "month") return "/mois";
  return "";
}

/**
 * Shared Stripe billing actions reused by the dedicated pricing page and the
 * subscription section of the settings page. Reads available plans from the
 * synced stripe schema and exposes checkout / portal mutations that redirect
 * to the Stripe-hosted flows. Never re-implements Stripe.
 */
export function useBilling() {
  const { toast } = useToast();

  const plansQuery = useQuery<{ plans: Plan[] }>({
    queryKey: ["/api/stripe/plans"],
  });

  const checkout = useMutation({
    mutationFn: async (priceId: string) => {
      const res = await apiRequest("POST", "/api/stripe/checkout", { priceId });
      return (await res.json()) as { url: string };
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: () =>
      toast({
        title: "Erreur",
        description: "Impossible de démarrer le paiement. Réessaie dans un instant.",
        variant: "destructive",
      }),
  });

  const portal = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/portal", {});
      return (await res.json()) as { url: string };
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: () =>
      toast({
        title: "Erreur",
        description: "Impossible d'ouvrir la gestion de l'abonnement.",
        variant: "destructive",
      }),
  });

  return {
    plans: plansQuery.data?.plans ?? [],
    plansLoading: plansQuery.isLoading,
    checkout,
    portal,
  };
}
