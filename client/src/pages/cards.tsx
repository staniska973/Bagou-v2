import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle, PenLine, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { CardStep, type ParcoursCard, type Rating } from "@/components/parcours/card-step";
import {
  SessionProgress,
  StreakBadge,
  CountUp,
  CelebrationRings,
  pickEncouragement,
} from "@/components/parcours/session-ui";

interface FlashcardData {
  card: ParcoursCard;
}

export default function Cards() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const themeId = useMemo(
    () => new URLSearchParams(window.location.search).get("themeId") || undefined,
    [],
  );
  const subthemeId = useMemo(
    () => new URLSearchParams(window.location.search).get("subthemeId") || undefined,
    [],
  );

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/profiles/user", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const res = await fetch(`/api/profiles/user/${user.id}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user?.id,
  });

  const profileId = profile?.id;
  const sessionIdRef = useRef<number | null>(null);

  const { data: dueCards, isLoading: cardsLoading } = useQuery<FlashcardData[]>({
    queryKey: ["/api/flashcards/due", profileId, themeId ?? "all", subthemeId ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (themeId) params.set("themeId", themeId);
      if (subthemeId) params.set("subthemeId", subthemeId);
      const qs = params.toString();
      const url = `/api/flashcards/due/${profileId}${qs ? `?${qs}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!profileId,
  });

  const [queue, setQueue] = useState<ParcoursCard[]>([]);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [mastered, setMastered] = useState(0);
  const [toReview, setToReview] = useState(0);
  const [results, setResults] = useState<Rating[]>([]);

  useEffect(() => {
    if (dueCards && dueCards.length > 0 && queue.length === 0) {
      setQueue(dueCards.map((d) => d.card));
    }
  }, [dueCards, queue.length]);

  useEffect(() => {
    if (!profileId || sessionIdRef.current) return;
    apiRequest("POST", "/api/sessions", { profileId })
      .then((r) => r.json())
      .then((s) => {
        sessionIdRef.current = s.id;
        queryClient.invalidateQueries({ queryKey: ["/api/profiles/user"] });
      })
      .catch(() => {});
  }, [profileId]);

  useEffect(() => {
    if (!user) navigate("/");
  }, [user, navigate]);
  useEffect(() => {
    if (!profileLoading && profile === null) navigate("/onboarding");
  }, [profileLoading, profile, navigate]);

  const current = queue[index];

  const onRated = (rating: Rating) => {
    setResults((p) => [...p, rating]);
    if (rating === "hard") setToReview((p) => p + 1);
    else setMastered((p) => p + 1);
    const next = index + 1;
    if (next < queue.length) setIndex(next);
    else setDone(true);
  };

  const finish = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/flashcards/due"] });
    navigate("/");
  };

  if (profileLoading || cardsLoading || !profileId) {
    return (
      <div className="h-dvh flex items-center justify-center bg-background">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="w-full h-6" />
          <Skeleton className="w-full h-40 rounded-2xl" />
          <Skeleton className="w-full h-24 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (done) {
    const streak = profile?.streak || 0;
    const { title, sub } = pickEncouragement(mastered, toReview);
    return (
      <div className="h-dvh flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/10 p-5">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-sm w-full text-center">
          <div className="relative mx-auto mb-5 w-20 h-20 flex items-center justify-center">
            <CelebrationRings />
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 16, delay: 0.1 }}
              className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center"
            >
              <CheckCircle className="w-8 h-8 text-accent" />
            </motion.div>
          </div>
          <h2 className="text-2xl font-bold mb-1.5" data-testid="text-cards-complete">{title}</h2>
          <p className="text-sm text-muted-foreground mb-6">{sub}</p>

          <div className="flex flex-wrap items-center justify-center gap-2 mb-7">
            <div className="rounded-2xl bg-accent/10 border border-accent/20 px-4 py-3 min-w-[84px]">
              <CountUp value={mastered} className="block text-2xl font-bold text-accent" testId="text-cards-mastered" />
              <span className="text-[11px] text-muted-foreground">validée{mastered > 1 ? "s" : ""}</span>
            </div>
            {toReview > 0 && (
              <div className="rounded-2xl bg-muted/60 border px-4 py-3 min-w-[84px]">
                <span className="block text-2xl font-bold" data-testid="text-cards-toreview">{toReview}</span>
                <span className="text-[11px] text-muted-foreground">à ancrer</span>
              </div>
            )}
            {streak > 0 && (
              <div className="rounded-2xl bg-orange-500/10 border border-orange-500/20 px-4 py-3 min-w-[84px]">
                <span className="flex items-center justify-center gap-1 text-2xl font-bold text-orange-500">
                  <Flame className="w-5 h-5" />{streak}
                </span>
                <span className="text-[11px] text-muted-foreground">jour{streak > 1 ? "s" : ""}</span>
              </div>
            )}
          </div>

          <Button onClick={finish} className="w-full h-12 rounded-xl text-base" data-testid="button-cards-finish">
            Retour à l'accueil
          </Button>
        </motion.div>
      </div>
    );
  }

  if (dueCards && dueCards.length === 0) {
    return (
      <div className="h-dvh flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-5">
        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-accent" />
          </div>
          <h2 className="text-2xl font-bold mb-1.5" data-testid="text-cards-complete">Tout est à jour.</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Rien à réviser pour l'instant. Reviens tout à l'heure pour de nouvelles situations.
          </p>
          <Button onClick={finish} className="w-full h-12 rounded-xl text-base" data-testid="button-cards-finish">
            Retour à l'accueil
          </Button>
        </motion.div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="h-dvh flex items-center justify-center bg-background">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="w-full h-6" />
          <Skeleton className="w-full h-40 rounded-2xl" />
          <Skeleton className="w-full h-24 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
      <div className="flex-shrink-0 px-4 pt-4 pb-2">
        <div className="max-w-lg mx-auto flex items-center gap-2.5">
          <Button variant="ghost" size="icon" className="shrink-0 -ml-2" onClick={finish} data-testid="button-cards-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <PenLine className="w-4 h-4 text-primary shrink-0" />
          <SessionProgress total={queue.length} results={results} currentIndex={index} />
          <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0" data-testid="text-cards-progress">
            {Math.min(index + 1, queue.length)}/{queue.length}
          </span>
          <StreakBadge streak={profile?.streak || 0} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="max-w-lg mx-auto">
          <CardStep
            key={current.cardId}
            card={current}
            profileId={profileId}
            sessionId={sessionIdRef.current}
            onRated={onRated}
          />
        </div>
      </div>
    </div>
  );
}
