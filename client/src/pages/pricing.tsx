import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/hooks/use-subscription";
import { Skeleton } from "@/components/ui/skeleton";

interface Plan {
  priceId: string;
  unitAmount: number;
  currency: string;
  interval: string;
  productName: string;
}

const PREMIUM_FEATURES = [
  "Cartes illimitées chaque jour",
  "Simulations vocales illimitées",
  "Débriefs IA complets après chaque session",
  "Tous les thèmes et parcours",
];

function formatPrice(unitAmount: number, currency: string): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: (currency || "eur").toUpperCase(),
    minimumFractionDigits: 2,
  }).format(unitAmount / 100);
}

function intervalLabel(interval: string): string {
  if (interval === "year") return "/an";
  if (interval === "month") return "/mois";
  return "";
}

export default function Pricing() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: status, isLoading: statusLoading } = useSubscription();

  const { data: plansData, isLoading: plansLoading } = useQuery<{ plans: Plan[] }>({
    queryKey: ["/api/stripe/plans"],
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success")) {
      toast({
        title: "Bienvenue en Premium 🎉",
        description: "Ton essai gratuit de 7 jours a démarré. Profite-en sans limite.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      window.history.replaceState({}, "", "/abonnement");
    } else if (params.get("canceled")) {
      toast({
        title: "Paiement annulé",
        description: "Aucun montant n'a été débité. Tu peux réessayer quand tu veux.",
      });
      window.history.replaceState({}, "", "/abonnement");
    }
  }, [toast]);

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

  const plans = plansData?.plans ?? [];
  const isPaid = status?.isPremium ?? false;
  const tier = status?.tier ?? "free";

  return (
    <div className="min-h-dvh bg-gradient-to-br from-background via-background to-primary/5">
      <div className="sticky top-0 z-40 border-b bg-background/80 px-4 py-2 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-base font-bold">Abonnement</h1>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 pb-12 pt-6">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Crown className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Bagou Premium</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Entraîne ta répartie sans aucune limite. Essai gratuit de 7 jours, annulable à tout moment.
          </p>
        </motion.div>

        {/* Current status */}
        {!statusLoading && status && (
          <div
            className="mt-5 rounded-xl border bg-card px-4 py-3 text-sm"
            data-testid="text-current-plan"
          >
            {tier === "premium" && (
              <span className="font-medium">Tu es Premium. Profites-en pleinement. 🎯</span>
            )}
            {tier === "trial" && (
              <span className="font-medium">
                Essai gratuit en cours
                {status.trialEndsAt
                  ? ` — jusqu'au ${new Date(status.trialEndsAt).toLocaleDateString("fr-FR")}`
                  : ""}
                .
              </span>
            )}
            {tier === "free" && (
              <span className="text-muted-foreground">
                Offre gratuite : {status.usage.cards.used}/{status.usage.cards.limit} cartes
                aujourd'hui · {status.usage.vocal.used}/{status.usage.vocal.limit} simulation vocale
                cette semaine.
              </span>
            )}
          </div>
        )}

        {/* Feature list */}
        <ul className="mt-6 space-y-2.5">
          {PREMIUM_FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-2.5 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Check className="h-3 w-3" />
              </span>
              {f}
            </li>
          ))}
        </ul>

        {/* Plans / management */}
        <div className="mt-7 space-y-3">
          {isPaid ? (
            <Button
              className="w-full"
              size="lg"
              onClick={() => portal.mutate()}
              disabled={portal.isPending}
              data-testid="button-manage-subscription"
            >
              {portal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Gérer mon abonnement
            </Button>
          ) : plansLoading ? (
            <>
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </>
          ) : plans.length === 0 ? (
            <p
              className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground"
              data-testid="text-no-plans"
            >
              Les offres ne sont pas disponibles pour le moment. Reviens un peu plus tard.
            </p>
          ) : (
            plans.map((plan) => {
              const recommended = plan.interval === "year";
              return (
                <Card
                  key={plan.priceId}
                  className={recommended ? "border-2 border-primary/40" : ""}
                  data-testid={`card-plan-${plan.interval}`}
                >
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">
                          {plan.interval === "year" ? "Annuel" : "Mensuel"}
                        </p>
                        {recommended && (
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            Le plus avantageux
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        <span className="text-lg font-bold text-foreground">
                          {formatPrice(plan.unitAmount, plan.currency)}
                        </span>
                        {intervalLabel(plan.interval)}
                      </p>
                    </div>
                    <Button
                      onClick={() => checkout.mutate(plan.priceId)}
                      disabled={checkout.isPending}
                      data-testid={`button-checkout-${plan.interval}`}
                    >
                      {checkout.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Essai gratuit
                    </Button>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        <p className="mt-5 text-center text-[11px] text-muted-foreground">
          7 jours d'essai gratuit, puis facturation automatique. Annule quand tu veux depuis la
          gestion de l'abonnement.
        </p>
      </div>
    </div>
  );
}
