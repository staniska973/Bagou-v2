import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Mic,
  ThumbsDown,
  Minus,
  ThumbsUp,
  TrendingUp,
  RotateCcw,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { VocalStep, type GlobalDynamic } from "@/components/parcours/vocal-step";
import type { ParcoursCard, Rating } from "@/components/parcours/card-step";

interface FlashcardData {
  card: ParcoursCard;
}

type View = "convo" | "debrief" | "done";

export default function Vocal() {
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

  const [cardIndex, setCardIndex] = useState(0);
  const [view, setView] = useState<View>("convo");
  const [debrief, setDebrief] = useState<GlobalDynamic | null>(null);
  const transcriptRef = useRef("");
  const [isRating, setIsRating] = useState(false);
  const [rated, setRated] = useState(false);

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

  const card = dueCards?.[cardIndex]?.card;

  const onComplete = (gd: GlobalDynamic | null, transcript: string) => {
    setDebrief(gd);
    transcriptRef.current = transcript;
    setView("debrief");
  };

  const rate = async (rating: Rating) => {
    if (!card || !profileId || isRating) return;
    setIsRating(true);
    try {
      await apiRequest("POST", "/api/flashcards/rate", {
        profileId,
        sessionId: sessionIdRef.current,
        cardId: card.cardId,
        rating,
        userAnswer: transcriptRef.current,
      });
      setRated(true);
    } catch {
      /* ignore */
    } finally {
      setIsRating(false);
    }
  };

  const nextCard = () => {
    const next = cardIndex + 1;
    setDebrief(null);
    transcriptRef.current = "";
    setRated(false);
    if (dueCards && next < dueCards.length) {
      setCardIndex(next);
      setView("convo");
    } else {
      setView("done");
    }
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
          <Skeleton className="w-40 h-40 rounded-full mx-auto" />
          <Skeleton className="w-full h-6" />
        </div>
      </div>
    );
  }

  if (view === "done" || (!card && !cardsLoading)) {
    return (
      <div className="h-dvh flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-5">
        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-accent" />
          </div>
          <h2 className="text-2xl font-bold mb-1.5">Belle session.</h2>
          <p className="text-sm text-muted-foreground mb-6">Tu as fait travailler ton réflexe. Reviens demain pour ancrer tout ça.</p>
          <Button onClick={finish} className="w-full h-12 rounded-xl text-base" data-testid="button-vocal-finish">Retour à l'accueil</Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-gradient-to-b from-background via-background to-primary/10">
      <div className="flex-shrink-0 px-4 pt-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="-ml-2" onClick={finish} data-testid="button-vocal-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-[10px]">{card?.themeId}</Badge>
          <span>Conversation · 2 min</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center overflow-hidden">
        {view === "convo" && card && (
          <VocalStep key={card.cardId} card={card} profileId={profileId} onComplete={onComplete} />
        )}

        {view === "debrief" && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
            <div className="flex items-center justify-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-accent" />
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ton débrief</p>
            </div>
            {debrief ? (
              <Card className={debrief.rating === "hard" ? "border-destructive/40" : debrief.rating === "easy" ? "border-accent/40" : "border-amber-500/40"}>
                <CardContent className="p-5 text-left space-y-3">
                  <Badge
                    variant={debrief.rating === "easy" ? "default" : debrief.rating === "medium" ? "secondary" : "destructive"}
                    className="text-[10px]"
                  >
                    {debrief.rating === "easy" ? "Maîtrisé" : debrief.rating === "medium" ? "Correct" : "À retravailler"}
                  </Badge>
                  <p className="text-[15px] leading-relaxed" data-testid="text-vocal-debrief">{debrief.feedback}</p>
                  {debrief.pattern && (
                    <div className="bg-muted/50 rounded-lg px-3 py-2">
                      <p className="text-xs text-muted-foreground"><span className="font-medium">Ton pattern&nbsp;:</span> {debrief.pattern}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground">Conversation terminée.</p>
            )}

            {!rated ? (
              <div className="mt-5">
                <p className="text-xs text-center text-muted-foreground mb-2">Comment tu as géré&nbsp;?</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" onClick={() => rate("hard")} disabled={isRating} className="border-destructive/40 text-destructive hover:bg-destructive/10 flex flex-col h-auto py-2.5 gap-1 rounded-xl" data-testid="button-vocal-rate-hard">
                    <ThumbsDown className="w-4 h-4" /><span className="text-[11px] font-medium">Difficile</span>
                  </Button>
                  <Button variant="outline" onClick={() => rate("medium")} disabled={isRating} className="border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 flex flex-col h-auto py-2.5 gap-1 rounded-xl" data-testid="button-vocal-rate-medium">
                    <Minus className="w-4 h-4" /><span className="text-[11px] font-medium">Moyen</span>
                  </Button>
                  <Button variant="outline" onClick={() => rate("easy")} disabled={isRating} className="border-accent/50 text-accent hover:bg-accent/10 flex flex-col h-auto py-2.5 gap-1 rounded-xl" data-testid="button-vocal-rate-easy">
                    <ThumbsUp className="w-4 h-4" /><span className="text-[11px] font-medium">Maîtrisé</span>
                  </Button>
                </div>
              </div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 flex flex-col gap-2">
                <Button onClick={nextCard} className="w-full h-12 rounded-xl gap-2" data-testid="button-vocal-next">
                  <RotateCcw className="w-4 h-4" /> Encore une situation
                </Button>
                <Button variant="ghost" onClick={finish} className="w-full h-11 rounded-xl" data-testid="button-vocal-done">
                  Terminer
                </Button>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
