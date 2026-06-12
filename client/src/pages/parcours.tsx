import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle,
  PenLine,
  Mic,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Lightbulb,
  Loader2,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { CardStep, type ParcoursCard, type Rating } from "@/components/parcours/card-step";
import { VocalStep, type GlobalDynamic } from "@/components/parcours/vocal-step";

interface FlashcardData {
  card: ParcoursCard;
}

interface WrittenResult {
  card: ParcoursCard;
  rating: Rating;
  oneFix: string;
  userAnswer: string;
}

interface OralResult {
  card: ParcoursCard;
  gd: GlobalDynamic | null;
  transcript: string;
}

interface FinalDebrief {
  strengths: string[];
  improvement: string;
  optimizedRewrite: string;
  redoExercise: string;
  scores: { clarity: number; frame: number; tone: number; concision: number };
}

type Phase = "loading" | "empty" | "ecrit" | "transition" | "oral" | "debriefLoading" | "debrief";

const ECRIT_MAX = 5;
const ORAL_MAX = 2;

export default function Parcours() {
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

  const [phase, setPhase] = useState<Phase>("loading");
  const [queue, setQueue] = useState<ParcoursCard[]>([]);
  const [ecritIndex, setEcritIndex] = useState(0);
  const writtenRef = useRef<WrittenResult[]>([]);

  const [oralQueue, setOralQueue] = useState<ParcoursCard[]>([]);
  const [oralIndex, setOralIndex] = useState(0);
  const oralRef = useRef<OralResult[]>([]);

  const [finalDebrief, setFinalDebrief] = useState<FinalDebrief | null>(null);

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

  useEffect(() => {
    if (phase !== "loading" || !dueCards) return;
    if (dueCards.length === 0) {
      setPhase("empty");
      return;
    }
    setQueue(dueCards.slice(0, ECRIT_MAX).map((d) => d.card));
    setPhase("ecrit");
  }, [dueCards, phase]);

  const buildOralQueue = useCallback((): ParcoursCard[] => {
    const written = writtenRef.current;
    const hard = written.filter((w) => w.rating === "hard").map((w) => w.card);
    const medium = written.filter((w) => w.rating === "medium").map((w) => w.card);
    let oral = [...hard, ...medium].slice(0, ORAL_MAX);
    if (oral.length === 0 && written.length > 0) oral = [written[0].card];
    return oral;
  }, []);

  const generateFinalDebrief = useCallback(async () => {
    setPhase("debriefLoading");
    const writtenLines = writtenRef.current.map(
      (w) => `[Écrit · ${w.card.situation}] Toi : ${w.userAnswer?.trim() || "(réponse vue directement)"}`,
    );
    const oralLines = oralRef.current.map((o) => o.transcript);
    const transcript = [...writtenLines, "", ...oralLines].join("\n").trim();

    try {
      const res = await apiRequest("POST", "/api/debrief/generate", {
        profileId,
        sessionId: sessionIdRef.current,
        transcript,
      });
      setFinalDebrief(await res.json());
    } catch {
      setFinalDebrief(null);
    } finally {
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/flashcards/due"] });
      setPhase("debrief");
    }
  }, [profileId]);

  const onCardRated = useCallback(
    (rating: Rating, oneFix: string, userAnswer: string) => {
      const card = queue[ecritIndex];
      if (!card) return;
      writtenRef.current = [...writtenRef.current, { card, rating, oneFix, userAnswer }];
      const next = ecritIndex + 1;
      if (next < queue.length) {
        setEcritIndex(next);
      } else {
        setOralQueue(buildOralQueue());
        setPhase("transition");
      }
    },
    [queue, ecritIndex, buildOralQueue],
  );

  const onOralComplete = useCallback(
    async (gd: GlobalDynamic | null, transcript: string) => {
      const card = oralQueue[oralIndex];
      if (!card) return;
      oralRef.current = [...oralRef.current, { card, gd, transcript }];

      const written = writtenRef.current.find((w) => w.card.cardId === card.cardId);
      if (gd?.rating === "hard" && written && written.rating !== "hard") {
        try {
          await apiRequest("POST", "/api/flashcards/rate", {
            profileId,
            sessionId: sessionIdRef.current,
            cardId: card.cardId,
            rating: "hard",
            userAnswer: transcript,
          });
        } catch {
          /* ignore */
        }
      }

      const next = oralIndex + 1;
      if (next < oralQueue.length) {
        setOralIndex(next);
      } else {
        generateFinalDebrief();
      }
    },
    [oralQueue, oralIndex, profileId, generateFinalDebrief],
  );

  const finish = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/flashcards/due"] });
    navigate("/");
  };

  if (profileLoading || cardsLoading || phase === "loading" || !profileId) {
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

  if (phase === "empty") {
    return (
      <div className="h-dvh flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-5">
        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-accent" />
          </div>
          <h2 className="text-2xl font-bold mb-1.5" data-testid="text-parcours-empty">Rien à travailler ici</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {themeId
              ? "Aucune situation à réviser sur ce thème pour l'instant. Choisis-en un autre."
              : "Tout est à jour. Reviens un peu plus tard."}
          </p>
          <Button onClick={finish} className="w-full h-12 rounded-xl text-base" data-testid="button-parcours-empty-back">
            Retour à l'accueil
          </Button>
        </motion.div>
      </div>
    );
  }

  // ÉCRIT
  if (phase === "ecrit") {
    const card = queue[ecritIndex];
    const progress = queue.length > 0 ? (ecritIndex / queue.length) * 100 : 0;
    return (
      <div className="h-dvh flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
        <div className="flex-shrink-0 px-4 pt-4 pb-2">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <Button variant="ghost" size="icon" className="shrink-0 -ml-2" onClick={finish} data-testid="button-parcours-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary shrink-0">
              <PenLine className="w-3.5 h-3.5" /> Écrit
            </div>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <motion.div className="h-full bg-primary rounded-full" initial={false} animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
            </div>
            <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0" data-testid="text-parcours-ecrit-progress">
              {ecritIndex + 1}/{queue.length}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="max-w-lg mx-auto">
            {card && (
              <CardStep
                key={card.cardId}
                card={card}
                profileId={profileId}
                sessionId={sessionIdRef.current}
                onRated={onCardRated}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // TRANSITION écrit -> oral
  if (phase === "transition") {
    const validated = writtenRef.current.filter((w) => w.rating !== "hard").length;
    const toWork = writtenRef.current.length - validated;
    return (
      <div className="h-dvh flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/10 p-5">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-1.5" data-testid="text-parcours-transition">Écrit terminé.</h2>
          <p className="text-sm text-muted-foreground mb-1">
            {validated} situation{validated > 1 ? "s" : ""} validée{validated > 1 ? "s" : ""}
            {toWork > 0 ? ` · ${toWork} à ancrer` : ""}.
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Place à l'oral&nbsp;: tu vas rejouer {oralQueue.length} situation{oralQueue.length > 1 ? "s" : ""} à voix haute, en live.
          </p>
          <Button
            onClick={() => {
              setOralIndex(0);
              setPhase("oral");
            }}
            className="w-full h-14 rounded-2xl text-base gap-2"
            data-testid="button-parcours-to-oral"
          >
            <Mic className="w-5 h-5" /> Passer à l'oral <ArrowRight className="w-4 h-4" />
          </Button>
          <button
            onClick={generateFinalDebrief}
            className="w-full text-xs text-muted-foreground hover:text-foreground mt-3 py-2"
            data-testid="button-parcours-skip-oral"
          >
            Sauter l'oral et voir mon débrief
          </button>
        </motion.div>
      </div>
    );
  }

  // ORAL
  if (phase === "oral") {
    const card = oralQueue[oralIndex];
    return (
      <div className="h-dvh flex flex-col bg-gradient-to-b from-background via-background to-primary/10">
        <div className="flex-shrink-0 px-4 pt-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="-ml-2" onClick={finish} data-testid="button-parcours-oral-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-1.5 text-xs font-medium text-accent">
            <Mic className="w-3.5 h-3.5" /> Oral
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {oralIndex + 1}/{oralQueue.length}
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 overflow-hidden">
          {card && (
            <VocalStep
              key={card.cardId}
              card={card}
              profileId={profileId}
              onComplete={onOralComplete}
            />
          )}
        </div>
      </div>
    );
  }

  // DÉBRIEF LOADING
  if (phase === "debriefLoading") {
    return (
      <div className="h-dvh flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-5">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground" data-testid="text-parcours-debrief-loading">Bagou prépare ton débrief…</p>
        </div>
      </div>
    );
  }

  // DÉBRIEF COMPLET
  const validated = writtenRef.current.filter((w) => w.rating !== "hard").length;
  const toWork = writtenRef.current.length - validated;
  const fixes = Array.from(new Set(writtenRef.current.map((w) => w.oneFix).filter(Boolean)));

  return (
    <div className="h-dvh flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
      <div className="flex-shrink-0 px-4 pt-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="-ml-2" onClick={finish} data-testid="button-parcours-debrief-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Trophy className="w-4 h-4 text-accent" /> Débrief du parcours
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg mx-auto space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <Card className="border-accent/30 bg-accent/5">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-accent" data-testid="text-parcours-validated">{validated}</p>
                <p className="text-[11px] text-muted-foreground">validée{validated > 1 ? "s" : ""}</p>
              </CardContent>
            </Card>
            <Card className="border-destructive/20">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold" data-testid="text-parcours-towork">{toWork}</p>
                <p className="text-[11px] text-muted-foreground">à ancrer</p>
              </CardContent>
            </Card>
          </div>

          {finalDebrief ? (
            <>
              {finalDebrief.scores && (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-3">
                      <TrendingUp className="w-3 h-3" /> Tes scores
                    </p>
                    <div className="space-y-2">
                      <ScoreBar label="Clarté" value={finalDebrief.scores.clarity} />
                      <ScoreBar label="Cadre" value={finalDebrief.scores.frame} />
                      <ScoreBar label="Ton" value={finalDebrief.scores.tone} />
                      <ScoreBar label="Concision" value={finalDebrief.scores.concision} />
                    </div>
                  </CardContent>
                </Card>
              )}

              {finalDebrief.strengths?.length > 0 && (
                <Card className="border-accent/30 bg-accent/5">
                  <CardContent className="p-4">
                    <p className="text-[10px] font-semibold text-accent uppercase tracking-wide flex items-center gap-1 mb-2">
                      <Sparkles className="w-3 h-3" /> Tes points forts
                    </p>
                    <ul className="space-y-1.5">
                      {finalDebrief.strengths.map((s, i) => (
                        <li key={i} className="text-sm leading-relaxed flex items-start gap-2" data-testid={`text-parcours-strength-${i}`}>
                          <CheckCircle className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" /> {s}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {finalDebrief.improvement && (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Ton axe de travail</p>
                    <p className="text-sm leading-relaxed font-medium" data-testid="text-parcours-improvement">{finalDebrief.improvement}</p>
                  </CardContent>
                </Card>
              )}

              {finalDebrief.optimizedRewrite && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-4">
                    <p className="text-[10px] font-semibold text-primary uppercase tracking-wide flex items-center gap-1 mb-1.5">
                      <Lightbulb className="w-3 h-3" /> La version Bagou
                    </p>
                    <p className="text-sm leading-relaxed font-medium" data-testid="text-parcours-rewrite">{finalDebrief.optimizedRewrite}</p>
                  </CardContent>
                </Card>
              )}

              {finalDebrief.redoExercise && (
                <div className="text-sm bg-muted/50 rounded-xl px-3.5 py-2.5" data-testid="text-parcours-redo">
                  <span className="font-semibold">À refaire&nbsp;:</span> {finalDebrief.redoExercise}
                </div>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground" data-testid="text-parcours-debrief-fallback">
                  Parcours terminé. {validated} situation{validated > 1 ? "s" : ""} validée{validated > 1 ? "s" : ""}.
                </p>
              </CardContent>
            </Card>
          )}

          {fixes.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">À corriger à l'écrit</p>
                <ul className="space-y-1.5">
                  {fixes.map((f, i) => (
                    <li key={i} className="text-sm leading-relaxed text-muted-foreground" data-testid={`text-parcours-fix-${i}`}>• {f}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Button onClick={finish} className="w-full h-12 rounded-xl text-base mt-2" data-testid="button-parcours-finish">
            Retour à l'accueil
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const color = v >= 75 ? "bg-accent" : v >= 50 ? "bg-amber-500" : "bg-destructive";
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-xs text-muted-foreground w-16 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <motion.div className={`h-full ${color} rounded-full`} initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 0.5 }} />
      </div>
      <span className="text-xs font-medium tabular-nums w-7 text-right">{v}</span>
    </div>
  );
}
