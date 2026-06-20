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
  ChevronDown,
  Volume2,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { CardStep, type ParcoursCard, type Rating } from "@/components/parcours/card-step";
import { VocalStep, type GlobalDynamic } from "@/components/parcours/vocal-step";
import { SessionProgress, StreakBadge, CountUp } from "@/components/parcours/session-ui";

interface FlashcardData {
  card: ParcoursCard;
}

interface WrittenResult {
  card: ParcoursCard;
  rating: Rating;
  oneFix: string;
  userAnswer: string;
  modelAnswer: string;
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
  styleDiagnosis?: {
    style: "passif" | "agressif" | "passif-agressif" | "assertif";
    label: string;
  };
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
  const [expandedOral, setExpandedOral] = useState<Set<number>>(new Set());
  const [expandedWritten, setExpandedWritten] = useState<Set<number>>(new Set());

  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const [ttsLoadingKey, setTtsLoadingKey] = useState<string | null>(null);
  const [ttsPlayingKey, setTtsPlayingKey] = useState<string | null>(null);

  const stopTts = useCallback(() => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    setTtsPlayingKey(null);
    setTtsLoadingKey(null);
  }, []);

  useEffect(() => () => stopTts(), [stopTts]);

  const playTts = useCallback(
    async (key: string, text: string) => {
      if (ttsPlayingKey === key || ttsLoadingKey === key) {
        stopTts();
        return;
      }
      stopTts();
      setTtsLoadingKey(key);
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error("tts");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        ttsAudioRef.current = audio;
        const cleanup = () => {
          URL.revokeObjectURL(url);
          if (ttsAudioRef.current === audio) ttsAudioRef.current = null;
          setTtsPlayingKey((k) => (k === key ? null : k));
        };
        audio.onended = cleanup;
        audio.onerror = cleanup;
        setTtsLoadingKey((k) => (k === key ? null : k));
        setTtsPlayingKey(key);
        await audio.play();
      } catch {
        setTtsLoadingKey((k) => (k === key ? null : k));
        setTtsPlayingKey((k) => (k === key ? null : k));
      }
    },
    [ttsPlayingKey, ttsLoadingKey, stopTts],
  );

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
    (rating: Rating, oneFix: string, userAnswer: string, modelAnswer: string) => {
      const card = queue[ecritIndex];
      if (!card) return;
      writtenRef.current = [...writtenRef.current, { card, rating, oneFix, userAnswer, modelAnswer }];
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
          <h2 className="text-2xl font-bold mb-1.5" data-testid="text-parcours-empty">Tout est à jour.</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {themeId
              ? "Rien à réviser sur ce thème pour l'instant. Choisis-en un autre et on s'y met."
              : "Rien à travailler maintenant. Reviens tout à l'heure, je t'attends."}
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
    return (
      <div className="h-dvh flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
        <div className="flex-shrink-0 px-4 pt-4 pb-2">
          <div className="max-w-lg mx-auto flex items-center gap-2.5">
            <Button variant="ghost" size="icon" className="shrink-0 -ml-2" onClick={finish} data-testid="button-parcours-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-1 text-xs font-medium text-primary shrink-0">
              <PenLine className="w-3.5 h-3.5" /> Écrit
            </div>
            <SessionProgress
              total={queue.length}
              results={writtenRef.current.map((w) => w.rating)}
              currentIndex={ecritIndex}
            />
            <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0" data-testid="text-parcours-ecrit-progress">
              {Math.min(ecritIndex + 1, queue.length)}/{queue.length}
            </span>
            <StreakBadge streak={profile?.streak || 0} />
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
    const oralResults: Rating[] = oralRef.current.map((o) => o.gd?.rating ?? "medium");
    return (
      <div className="h-dvh flex flex-col bg-gradient-to-b from-background via-background to-primary/10">
        <div className="flex-shrink-0 px-4 pt-4 pb-2">
          <div className="max-w-lg mx-auto flex items-center gap-2.5">
            <Button variant="ghost" size="icon" className="shrink-0 -ml-2" onClick={finish} data-testid="button-parcours-oral-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-1 text-xs font-medium text-accent shrink-0">
              <Mic className="w-3.5 h-3.5" /> Oral
            </div>
            <SessionProgress total={oralQueue.length} results={oralResults} currentIndex={oralIndex} />
            <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0" data-testid="text-parcours-oral-progress">
              {Math.min(oralIndex + 1, oralQueue.length)}/{oralQueue.length}
            </span>
            <StreakBadge streak={profile?.streak || 0} />
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 overflow-hidden">
          {card && (
            <VocalStep
              key={card.cardId}
              card={card}
              profileId={profileId}
              isLast={oralIndex === oralQueue.length - 1}
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

  const oralPlayed = oralRef.current.length;
  const oralMastered = oralRef.current.filter((o) => o.gd && o.gd.rating !== "hard").length;

  return (
    <div className="h-dvh flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
      <div className="flex-shrink-0 px-4 pt-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="-ml-2" onClick={finish} data-testid="button-parcours-debrief-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Trophy className="w-4 h-4 text-accent" /> Débrief du parcours
        </div>
        <div className="ml-auto">
          <StreakBadge streak={profile?.streak || 0} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg mx-auto space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <Card className="border-accent/30 bg-accent/5">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-accent" data-testid="text-parcours-validated">
                  <CountUp value={validated} />
                </p>
                <p className="text-[11px] text-muted-foreground">validée{validated > 1 ? "s" : ""}</p>
              </CardContent>
            </Card>
            <Card className="border-destructive/20">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold" data-testid="text-parcours-towork">
                  <CountUp value={toWork} />
                </p>
                <p className="text-[11px] text-muted-foreground">à ancrer</p>
              </CardContent>
            </Card>
          </div>

          {oralPlayed > 0 && (
            <Card className="border-accent/20 bg-accent/5">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-accent/15 shrink-0">
                  <Mic className="w-4 h-4 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight">À l'oral</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    {oralPlayed} conversation{oralPlayed > 1 ? "s" : ""} jouée{oralPlayed > 1 ? "s" : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-bold text-accent tabular-nums" data-testid="text-parcours-oral-mastered">
                    <CountUp value={oralMastered} />
                    <span className="text-sm font-medium text-muted-foreground">/{oralPlayed}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-tight">maîtrisée{oralMastered > 1 ? "s" : ""}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {finalDebrief ? (
            <>
              {finalDebrief.styleDiagnosis && (
                <Card
                  className={
                    finalDebrief.styleDiagnosis.style === "assertif"
                      ? "border-accent/40 bg-accent/5"
                      : "border-destructive/40 bg-destructive/5"
                  }
                  data-testid="card-parcours-style"
                >
                  <CardContent className="p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5 text-muted-foreground">
                      Ton style dominant
                    </p>
                    <p
                      className={`text-base font-bold capitalize mb-1 ${
                        finalDebrief.styleDiagnosis.style === "assertif" ? "text-accent" : "text-destructive"
                      }`}
                      data-testid="text-parcours-style"
                    >
                      {finalDebrief.styleDiagnosis.style}
                    </p>
                    {finalDebrief.styleDiagnosis.label && (
                      <p className="text-sm leading-relaxed" data-testid="text-parcours-style-label">
                        {finalDebrief.styleDiagnosis.label}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

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

          {writtenRef.current.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-3">
                  <PenLine className="w-3 h-3" /> Tes réponses à l'écrit
                </p>
                <ul className="space-y-3">
                  {writtenRef.current.map((w, i) => {
                    const isExpanded = expandedWritten.has(i);
                    const hasDetail = !!(w.userAnswer?.trim() || w.modelAnswer?.trim());
                    return (
                      <li key={i} className="space-y-1.5" data-testid={`item-parcours-written-${i}`}>
                        <p className="text-sm font-semibold leading-snug" data-testid={`text-parcours-written-situation-${i}`}>
                          {w.card.situation}
                        </p>
                        {w.oneFix && (
                          <p className="text-sm leading-relaxed text-muted-foreground" data-testid={`text-parcours-fix-${i}`}>
                            <span className="font-semibold text-foreground/70">À corriger&nbsp;:</span> {w.oneFix}
                          </p>
                        )}
                        {hasDetail && (
                          <div className="pt-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedWritten((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(i)) next.delete(i);
                                  else next.add(i);
                                  return next;
                                })
                              }
                              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                              data-testid={`button-parcours-written-toggle-${i}`}
                              aria-expanded={isExpanded}
                            >
                              <ChevronDown
                                className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              />
                              {isExpanded ? "Masquer ma réponse" : "Voir ma réponse"}
                            </button>
                            {isExpanded && (
                              <div
                                className="mt-2 space-y-2.5 rounded-xl bg-muted/40 p-3"
                                data-testid={`detail-parcours-written-${i}`}
                              >
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/70 mb-0.5">Toi</p>
                                  <p className="text-[14px] leading-snug text-foreground/90" data-testid={`text-parcours-written-user-${i}`}>
                                    {w.userAnswer?.trim() || "(réponse vue directement)"}
                                  </p>
                                </div>
                                {w.modelAnswer?.trim() && (
                                  <div>
                                    <div className="flex items-center justify-between gap-2 mb-0.5">
                                      <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">La réponse Bagou</p>
                                      <button
                                        type="button"
                                        onClick={() => playTts(`written-${i}`, w.modelAnswer)}
                                        disabled={ttsLoadingKey === `written-${i}`}
                                        className="flex items-center gap-1 rounded-full border border-accent/30 px-2 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-60"
                                        data-testid={`button-parcours-written-listen-${i}`}
                                        aria-label={ttsPlayingKey === `written-${i}` ? "Arrêter la lecture" : "Écouter la réponse Bagou"}
                                      >
                                        {ttsLoadingKey === `written-${i}` ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : ttsPlayingKey === `written-${i}` ? (
                                          <Square className="w-3 h-3 fill-current" />
                                        ) : (
                                          <Volume2 className="w-3 h-3" />
                                        )}
                                        {ttsPlayingKey === `written-${i}` ? "Arrêter" : "Écouter"}
                                      </button>
                                    </div>
                                    <p className="text-[14px] leading-snug text-foreground/90" data-testid={`text-parcours-written-model-${i}`}>
                                      {w.modelAnswer}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {oralRef.current.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-3">
                  <Mic className="w-3 h-3" /> Tes conversations à l'oral
                </p>
                <ul className="space-y-3">
                  {oralRef.current.map((o, i) => {
                    const userSaid = lastUserUtterance(o.transcript);
                    const takeaway = o.gd?.feedback || o.gd?.pattern || "";
                    const turns = parseTranscript(o.transcript, o.card.otherRole);
                    const isExpanded = expandedOral.has(i);
                    return (
                      <li key={i} className="space-y-1.5" data-testid={`item-parcours-oral-${i}`}>
                        <p className="text-sm font-semibold leading-snug" data-testid={`text-parcours-oral-situation-${i}`}>
                          {o.card.situation}
                        </p>
                        {userSaid && (
                          <p className="text-sm leading-relaxed text-muted-foreground" data-testid={`text-parcours-oral-said-${i}`}>
                            <span className="font-semibold text-foreground/70">Toi&nbsp;:</span> «&nbsp;{userSaid}&nbsp;»
                          </p>
                        )}
                        {takeaway && (
                          <p className="text-sm leading-relaxed" data-testid={`text-parcours-oral-takeaway-${i}`}>
                            <span className="font-semibold text-accent">Bagou&nbsp;:</span> {takeaway}
                          </p>
                        )}
                        {turns.length > 0 && (
                          <div className="pt-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedOral((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(i)) next.delete(i);
                                  else next.add(i);
                                  return next;
                                })
                              }
                              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                              data-testid={`button-parcours-oral-toggle-${i}`}
                              aria-expanded={isExpanded}
                            >
                              <ChevronDown
                                className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              />
                              {isExpanded ? "Masquer la conversation" : "Voir la conversation"}
                            </button>
                            {isExpanded && (
                              <div
                                className="mt-2 space-y-2 rounded-xl bg-muted/40 p-3"
                                data-testid={`list-parcours-oral-transcript-${i}`}
                              >
                                {turns.map((t, ti) => (
                                  <div
                                    key={ti}
                                    className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}
                                  >
                                    <div
                                      className={`max-w-[82%] rounded-2xl px-3.5 py-2 ${
                                        t.role === "user"
                                          ? "bg-primary/10 rounded-br-sm"
                                          : "bg-background rounded-bl-sm"
                                      }`}
                                    >
                                      <p
                                        className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${
                                          t.role === "user" ? "text-primary/70" : "text-muted-foreground"
                                        }`}
                                      >
                                        {t.role === "user" ? "Toi" : o.card.otherRole}
                                      </p>
                                      <p className="text-[14px] leading-snug text-left text-foreground/90">
                                        {t.content}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
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

function parseTranscript(
  transcript: string,
  otherRole: string,
): { role: "user" | "other"; content: string }[] {
  const otherPrefix = `${otherRole} : `;
  return transcript
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      if (l.startsWith("Toi : ")) {
        return { role: "user" as const, content: l.slice("Toi : ".length).trim() };
      }
      if (l.startsWith(otherPrefix)) {
        return { role: "other" as const, content: l.slice(otherPrefix.length).trim() };
      }
      const idx = l.indexOf(" : ");
      if (idx !== -1) {
        return { role: "other" as const, content: l.slice(idx + 3).trim() };
      }
      return { role: "other" as const, content: l };
    })
    .filter((t) => t.content.length > 0);
}

function lastUserUtterance(transcript: string): string {
  const userLines = transcript
    .split("\n")
    .filter((l) => l.startsWith("Toi : "))
    .map((l) => l.slice("Toi : ".length).trim())
    .filter(Boolean);
  return userLines.length > 0 ? userLines[userLines.length - 1] : "";
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
