import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Mic,
  Square,
  Loader2,
  ThumbsDown,
  Minus,
  ThumbsUp,
  Sparkles,
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

interface FlashcardData {
  card: {
    cardId: string;
    situation: string;
    userGoal: string;
    difficulty: string;
    themeId: string;
    speakerRole: string;
    otherRole: string;
    relationship: string;
    stakes: string;
  };
}

interface GlobalDynamic {
  feedback: string;
  rating: "hard" | "medium" | "easy";
  pattern: string;
}

type Phase = "intro" | "speaking" | "listening" | "thinking" | "debrief" | "done";

const SESSION_SECONDS = 120;

export default function Vocal() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

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
    queryKey: ["/api/flashcards/due", profileId],
    queryFn: async () => {
      const res = await fetch(`/api/flashcards/due/${profileId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!profileId,
  });

  const [cardIndex, setCardIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("intro");
  const [caption, setCaption] = useState("");
  const [userCaption, setUserCaption] = useState("");
  const [debrief, setDebrief] = useState<GlobalDynamic | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isRating, setIsRating] = useState(false);
  const [rated, setRated] = useState(false);
  const [micError, setMicError] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const turnRef = useRef(1);
  const maxTurnsRef = useRef(3);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startingRef = useRef(false);
  const phaseRef = useRef<Phase>("intro");
  phaseRef.current = phase;

  const card = dueCards?.[cardIndex]?.card;

  useEffect(() => {
    if (!profileId || sessionIdRef.current) return;
    apiRequest("POST", "/api/sessions", { profileId })
      .then((r) => r.json())
      .then((s) => { sessionIdRef.current = s.id; queryClient.invalidateQueries({ queryKey: ["/api/profiles/user"] }); })
      .catch(() => {});
  }, [profileId]);

  useEffect(() => { if (!user) navigate("/"); }, [user, navigate]);
  useEffect(() => { if (!profileLoading && profile === null) navigate("/onboarding"); }, [profileLoading, profile, navigate]);

  const cleanupAudio = () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } };
  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };

  useEffect(() => () => {
    cleanupAudio();
    stopTimer();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const playTTS = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      cleanupAudio();
      fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
        .then((r) => { if (!r.ok) throw new Error("tts"); return r.blob(); })
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          const end = () => { URL.revokeObjectURL(url); if (audioRef.current === audio) audioRef.current = null; resolve(); };
          audio.onended = end;
          audio.onerror = end;
          audio.play().catch(end);
        })
        .catch(() => resolve());
    });
  }, []);

  const ensureStream = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current) return streamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      return stream;
    } catch {
      setMicError(true);
      return null;
    }
  }, []);

  const concludeSession = useCallback((gd: GlobalDynamic | null) => {
    stopTimer();
    cleanupAudio();
    setDebrief(gd);
    setPhase("debrief");
  }, []);

  const submitUserMessage = useCallback(async (text: string) => {
    if (!card || !profileId) return;
    setUserCaption(text);
    setPhase("thinking");

    const overTime = Date.now() - startTimeRef.current >= (SESSION_SECONDS - 8) * 1000;
    const turnToSend = overTime ? 999 : turnRef.current;

    try {
      const res = await apiRequest("POST", "/api/session/dialogue-turn", {
        profileId,
        cardId: card.cardId,
        history: historyRef.current,
        userMessage: text,
        turnNumber: turnToSend,
      });
      const data = await res.json();
      if (data.maxTurns) maxTurnsRef.current = data.maxTurns;

      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: text },
        { role: "assistant", content: data.interlocutorReply },
      ];

      if (data.isFinalTurn || overTime) {
        setCaption(data.interlocutorReply);
        await playTTS(data.interlocutorReply);
        concludeSession(data.globalDynamic || null);
        return;
      }

      turnRef.current += 1;
      setCaption(data.interlocutorReply);
      setUserCaption("");
      setPhase("speaking");
      await playTTS(data.interlocutorReply);
      startListening();
    } catch {
      setPhase("listening");
      startListening();
    }
  }, [card, profileId, playTTS, concludeSession]);

  const handleUserAudio = useCallback(async (blob: Blob, mime: string) => {
    setPhase("thinking");
    try {
      const fd = new FormData();
      fd.append("audio", blob, `rec.${mime.includes("webm") ? "webm" : "mp4"}`);
      const r = await fetch("/api/transcribe", { method: "POST", body: fd });
      if (r.ok) {
        const { text } = await r.json();
        if (text?.trim()) { submitUserMessage(text.trim()); return; }
      }
    } catch { /* ignore */ }
    setPhase("listening");
    startListening();
  }, [submitUserMessage]);

  const startListening = useCallback(async () => {
    const stream = await ensureStream();
    if (!stream) return;
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => { handleUserAudio(new Blob(chunks, { type: mime }), mime); };
    recorder.start();
    recorderRef.current = recorder;
    setPhase("listening");
  }, [ensureStream, handleUserAudio]);

  const stopListening = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const beginConversation = useCallback(async () => {
    if (!card || !profileId || startingRef.current) return;
    startingRef.current = true;
    setMicError(false);
    historyRef.current = [];
    turnRef.current = 1;
    setUserCaption("");
    setDebrief(null);
    setRated(false);

    const stream = await ensureStream();
    if (!stream) { startingRef.current = false; return; }

    try {
      setPhase("speaking");
      startTimeRef.current = Date.now();
      setElapsed(0);
      stopTimer();
      timerRef.current = setInterval(() => {
        const e = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsed(e);
      }, 250);

      let opening = "";
      try {
        const r = await apiRequest("POST", "/api/session/opening", { cardId: card.cardId, profileId });
        opening = (await r.json()).openingLine || "";
      } catch { /* ignore */ }

      if (opening) {
        historyRef.current = [{ role: "assistant", content: opening }];
        setCaption(opening);
        await playTTS(opening);
      }
      startListening();
    } finally {
      startingRef.current = false;
    }
  }, [card, profileId, ensureStream, playTTS, startListening]);

  const rate = async (rating: "hard" | "medium" | "easy") => {
    if (!card || !profileId || isRating) return;
    setIsRating(true);
    try {
      await apiRequest("POST", "/api/flashcards/rate", {
        profileId,
        sessionId: sessionIdRef.current,
        cardId: card.cardId,
        rating,
        userAnswer: historyRef.current.filter((m) => m.role === "user").map((m) => m.content).join(" | "),
      });
      setRated(true);
    } catch { /* ignore */ } finally { setIsRating(false); }
  };

  const nextCard = () => {
    const next = cardIndex + 1;
    if (dueCards && next < dueCards.length) {
      setCardIndex(next);
      setCaption("");
      setUserCaption("");
      setDebrief(null);
      setRated(false);
      setPhase("intro");
    } else {
      setPhase("done");
    }
  };

  const finish = () => {
    cleanupAudio();
    stopTimer();
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

  if (phase === "done" || (!card && !cardsLoading)) {
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

  const timerPct = Math.min((elapsed / SESSION_SECONDS) * 100, 100);
  const orbState = phase === "speaking" ? "speaking" : phase === "listening" ? "listening" : phase === "thinking" ? "thinking" : "idle";

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
        {phase === "intro" && card && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
            <p className="text-xs font-semibold text-accent uppercase tracking-wide mb-3">Mise en situation</p>
            <Card className="border-primary/15 bg-card/80 mb-5">
              <CardContent className="p-5 text-left">
                <p className="text-base leading-relaxed font-medium mb-3" data-testid="text-vocal-situation">{card.situation}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span><span className="font-semibold text-foreground/70">Toi&nbsp;:</span> {card.speakerRole}</span>
                  <span className="text-muted-foreground/30">•</span>
                  <span><span className="font-semibold text-foreground/70">Face à&nbsp;:</span> {card.otherRole}</span>
                </div>
                {card.userGoal && (
                  <div className="mt-2 flex items-start gap-1.5 text-xs">
                    <Sparkles className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{card.userGoal}</span>
                  </div>
                )}
              </CardContent>
            </Card>
            <p className="text-sm text-muted-foreground mb-4">Tu vas parler à voix haute. L'autre te répond. Reste naturel, vise ton objectif.</p>
            <Button onClick={beginConversation} className="w-full h-14 rounded-2xl text-base gap-2" data-testid="button-vocal-start">
              <Mic className="w-5 h-5" /> Commencer la conversation
            </Button>
            {micError && <p className="text-xs text-destructive mt-3">Micro inaccessible. Autorise le micro pour démarrer.</p>}
          </motion.div>
        )}

        {(phase === "speaking" || phase === "listening" || phase === "thinking") && (
          <div className="w-full max-w-md flex flex-col items-center">
            <Orb state={orbState} progressPct={timerPct} />

            <div className="h-24 mt-8 flex flex-col items-center justify-start">
              <AnimatePresence mode="wait">
                <motion.p
                  key={caption + orbState}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="text-[15px] leading-relaxed text-foreground/90 max-w-sm"
                  data-testid="text-vocal-caption"
                >
                  {phase === "thinking" ? "…" : caption}
                </motion.p>
              </AnimatePresence>
              <p className="text-xs text-muted-foreground mt-2">
                {phase === "speaking" ? `${card?.otherRole} parle…` : phase === "listening" ? "À toi — parle, puis appuie sur stop" : "Bagou réfléchit…"}
              </p>
            </div>

            <div className="mt-6 h-20 flex items-center justify-center">
              {phase === "listening" ? (
                <Button
                  size="icon"
                  variant="destructive"
                  className="w-20 h-20 rounded-full shadow-xl"
                  onClick={stopListening}
                  data-testid="button-vocal-stop"
                >
                  <Square className="w-7 h-7 fill-current" />
                </Button>
              ) : (
                <div className="w-20 h-20 rounded-full bg-muted/40 flex items-center justify-center">
                  {phase === "thinking" ? <Loader2 className="w-7 h-7 text-muted-foreground animate-spin" /> : <Mic className="w-7 h-7 text-muted-foreground/50" />}
                </div>
              )}
            </div>
          </div>
        )}

        {phase === "debrief" && (
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

function Orb({ state, progressPct }: { state: "speaking" | "listening" | "thinking" | "idle"; progressPct: number }) {
  const color =
    state === "listening" ? "hsl(var(--accent))" :
    state === "thinking" ? "hsl(var(--muted-foreground))" :
    "hsl(var(--primary))";

  const r = 90;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="relative w-56 h-56 flex items-center justify-center">
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 224 224">
        <circle cx="112" cy="112" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="3" opacity="0.4" />
        <circle
          cx="112" cy="112" r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progressPct / 100)}
          style={{ transition: "stroke-dashoffset 0.3s linear" }}
        />
      </svg>

      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{ width: 150, height: 150, border: `1.5px solid ${color}` }}
          animate={
            state === "speaking"
              ? { scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }
              : state === "listening"
              ? { scale: [1, 1.18, 1], opacity: [0.45, 0.1, 0.45] }
              : { scale: 1, opacity: 0.12 }
          }
          transition={{ duration: state === "speaking" ? 1.8 : 2.4, repeat: Infinity, delay: i * 0.5, ease: "easeOut" }}
        />
      ))}

      <motion.div
        className="relative rounded-full"
        style={{ width: 130, height: 130, background: `radial-gradient(circle at 35% 30%, ${color}, hsl(var(--primary)))` }}
        animate={
          state === "thinking"
            ? { scale: [1, 1.04, 1] }
            : state === "listening"
            ? { scale: [1, 1.08, 1] }
            : state === "speaking"
            ? { scale: [1, 1.12, 1] }
            : { scale: 1 }
        }
        transition={{ duration: state === "thinking" ? 2.2 : state === "speaking" ? 0.7 : 1.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="absolute inset-0 rounded-full" style={{ boxShadow: `0 0 60px 8px ${color}55` }} />
      </motion.div>
    </div>
  );
}
