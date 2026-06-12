import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Mic,
  MicOff,
  Send,
  Eye,
  CheckCircle,
  CheckCircle2,
  MessageCircle,
  Loader2,
  Lightbulb,
  ThumbsDown,
  Minus,
  ThumbsUp,
  Sparkles,
  User,
  Quote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
    antiPatterns: string[];
    channel: string;
    difficulty: string;
    themeId: string;
    subthemeId: string;
    speakerRole: string;
    otherRole: string;
    relationship: string;
    stakes: string;
  };
  srsState?: any;
}

interface AnswerResult {
  modelAnswer: string;
  variants: { safe: string; medium: string; bold: string };
  rubric: string[];
  feedback: {
    pass: boolean;
    ratingSuggested: "hard" | "medium" | "easy";
    oneFix: string;
    feedback: string;
  };
}

type Phase = "formulate" | "loading" | "reveal";

const diffLabel = (d: string) => (d === "n1" ? "Facile" : d === "n2" ? "Moyen" : d === "n3" ? "Difficile" : d);

export default function Cards() {
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

  const [queue, setQueue] = useState<FlashcardData[]>([]);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [mastered, setMastered] = useState(0);
  const [toReview, setToReview] = useState(0);

  const [phase, setPhase] = useState<Phase>("formulate");
  const [userAnswer, setUserAnswer] = useState("");
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [isRating, setIsRating] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (dueCards && dueCards.length > 0 && queue.length === 0) setQueue([...dueCards]);
  }, [dueCards]);

  useEffect(() => {
    if (!profileId || sessionIdRef.current) return;
    apiRequest("POST", "/api/sessions", { profileId })
      .then((r) => r.json())
      .then((s) => { sessionIdRef.current = s.id; queryClient.invalidateQueries({ queryKey: ["/api/profiles/user"] }); })
      .catch(() => {});
  }, [profileId]);

  useEffect(() => { if (!user) navigate("/"); }, [user, navigate]);
  useEffect(() => { if (!profileLoading && profile === null) navigate("/onboarding"); }, [profileLoading, profile, navigate]);
  useEffect(() => () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const current = queue[index];
  const total = dueCards?.length || 0;

  const submitAnswer = useCallback(async (skip = false) => {
    if (!current || !profileId || phase !== "formulate") return;
    const answer = skip ? "" : userAnswer.trim();
    if (!skip && !answer) return;
    setPhase("loading");
    try {
      const res = await apiRequest("POST", "/api/flashcards/generate-answer", {
        profileId,
        cardId: current.card.cardId,
        userAnswer: answer || "(l'utilisateur a préféré voir directement la réponse)",
      });
      const data: AnswerResult = await res.json();
      setResult(data);
      setPhase("reveal");
    } catch {
      setPhase("formulate");
    }
  }, [current, profileId, phase, userAnswer]);

  const rate = async (rating: "hard" | "medium" | "easy") => {
    if (!current || !profileId || isRating) return;
    setIsRating(true);
    try {
      await apiRequest("POST", "/api/flashcards/rate", {
        profileId,
        sessionId: sessionIdRef.current,
        cardId: current.card.cardId,
        rating,
        userAnswer,
      });
      if (rating === "hard") setToReview((p) => p + 1);
      else setMastered((p) => p + 1);

      const requeue = rating === "hard";
      const next = index + 1;
      if (requeue) setQueue((prev) => [...prev, current]);

      setUserAnswer("");
      setResult(null);
      setPhase("formulate");

      const totalAfter = queue.length + (requeue ? 1 : 0);
      if (next < totalAfter) setIndex(next);
      else setDone(true);
    } catch { /* ignore */ } finally { setIsRating(false); }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);
        const blob = new Blob(chunks, { type: mimeType });
        try {
          const fd = new FormData();
          fd.append("audio", blob, `rec.${mimeType.includes("webm") ? "webm" : "mp4"}`);
          const r = await fetch("/api/transcribe", { method: "POST", body: fd });
          if (r.ok) { const { text } = await r.json(); if (text) setUserAnswer((p) => (p ? p + " " + text : text)); }
        } catch { /* ignore */ }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) { console.error("Mic denied:", err); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
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

  if (done || (dueCards && dueCards.length === 0)) {
    return (
      <div className="h-dvh flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-5">
        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-accent" />
          </div>
          <h2 className="text-2xl font-bold mb-1.5" data-testid="text-cards-complete">
            {done ? "Bien joué." : "Rien à réviser"}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {done
              ? `${mastered} carte${mastered > 1 ? "s" : ""} validée${mastered > 1 ? "s" : ""}${toReview > 0 ? ` · ${toReview} à retravailler` : ""}`
              : "Reviens un peu plus tard pour de nouvelles cartes."}
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

  const progress = total > 0 ? Math.min((index / total) * 100, 100) : 0;

  return (
    <div className="h-dvh flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
      <div className="flex-shrink-0 px-4 pt-4 pb-2">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0 -ml-2" onClick={finish} data-testid="button-cards-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div className="h-full bg-accent rounded-full" initial={false} animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
          </div>
          <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0" data-testid="text-cards-progress">
            {Math.min(index + 1, queue.length)}/{queue.length}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="max-w-lg mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${index}-${phase}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.22 }}
            >
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <Badge variant="secondary" className="text-[10px]" data-testid="badge-card-theme">{current.card.themeId}</Badge>
                <Badge variant="outline" className="text-[10px]">{diffLabel(current.card.difficulty)}</Badge>
                {current.card.channel && <Badge variant="outline" className="text-[10px] text-muted-foreground">{current.card.channel}</Badge>}
              </div>

              <Card className="border-primary/15 bg-card/80 backdrop-blur-sm overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex items-start gap-2.5">
                    <Quote className="w-4 h-4 text-primary/50 shrink-0 mt-1" />
                    <p className="text-base leading-relaxed font-medium" data-testid="text-card-situation">
                      {current.card.situation}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/60 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                    <span><span className="font-semibold text-foreground/70">Toi&nbsp;:</span> {current.card.speakerRole}</span>
                    <span className="text-muted-foreground/30">•</span>
                    <span><span className="font-semibold text-foreground/70">Face à&nbsp;:</span> {current.card.otherRole}</span>
                  </div>
                  {current.card.userGoal && (
                    <div className="mt-2 flex items-start gap-1.5 text-xs">
                      <Sparkles className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                      <span className="text-muted-foreground"><span className="font-semibold text-foreground/70">Objectif&nbsp;:</span> {current.card.userGoal}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {(phase === "formulate" || phase === "loading") && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
                  <p className="text-sm font-medium text-foreground/80 mb-2 ml-1">Qu'est-ce que tu réponds&nbsp;?</p>
                  <div className="relative">
                    <Textarea
                      ref={textareaRef}
                      value={userAnswer}
                      onChange={(e) => setUserAnswer(e.target.value)}
                      placeholder="Écris ta réplique, ou parle au micro…"
                      className="resize-none text-base min-h-[110px] rounded-xl pr-12 bg-card/60"
                      disabled={phase === "loading"}
                      data-testid="textarea-card-answer"
                    />
                    <Button
                      variant={isRecording ? "destructive" : "ghost"}
                      size="icon"
                      className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-lg"
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={phase === "loading"}
                      data-testid="button-card-mic"
                    >
                      {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </Button>
                  </div>
                  {isRecording && <p className="text-[11px] text-red-500 animate-pulse mt-1.5 ml-1">● Enregistrement… appuie pour arrêter</p>}

                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="outline"
                      className="flex-1 h-12 rounded-xl gap-1.5"
                      onClick={() => submitAnswer(true)}
                      disabled={phase === "loading"}
                      data-testid="button-card-reveal"
                    >
                      <Eye className="w-4 h-4" /> Voir la réponse
                    </Button>
                    <Button
                      className="flex-1 h-12 rounded-xl gap-1.5"
                      onClick={() => submitAnswer(false)}
                      disabled={phase === "loading" || !userAnswer.trim()}
                      data-testid="button-card-submit"
                    >
                      {phase === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {phase === "loading" ? "Analyse…" : "Valider"}
                    </Button>
                  </div>
                </motion.div>
              )}

              {phase === "reveal" && result && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-3" data-testid="section-card-reveal">
                  {userAnswer.trim() && (
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="w-3 h-3 text-primary" />
                      </div>
                      <div className="bg-primary/5 border border-primary/15 rounded-xl px-3 py-2 text-sm flex-1" data-testid="text-card-user-answer">
                        {userAnswer}
                      </div>
                    </div>
                  )}

                  {result.feedback?.feedback && (
                    <div className="bg-muted/50 rounded-xl px-3.5 py-2.5 flex items-start gap-2">
                      {result.feedback.pass
                        ? <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                        : <MessageCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
                      <p className="text-sm leading-relaxed flex-1" data-testid="text-card-feedback">{result.feedback.feedback}</p>
                    </div>
                  )}

                  <Card className="border-accent/30 bg-accent/5">
                    <CardContent className="p-4">
                      <p className="text-[10px] font-semibold text-accent uppercase tracking-wide flex items-center gap-1 mb-2">
                        <Lightbulb className="w-3 h-3" /> La réponse Bagou
                      </p>
                      <p className="text-base font-medium leading-relaxed" data-testid="text-card-model-answer">{result.modelAnswer}</p>
                    </CardContent>
                  </Card>

                  {result.variants && (
                    <div className="space-y-1.5">
                      {[
                        { label: "Prudente", text: result.variants.safe },
                        { label: "Équilibrée", text: result.variants.medium },
                        { label: "Audacieuse", text: result.variants.bold },
                      ].filter((v) => v.text).map((v) => (
                        <div key={v.label} className="text-sm border rounded-xl px-3 py-2 bg-card/50" data-testid={`text-card-variant-${v.label}`}>
                          <span className="font-semibold text-muted-foreground text-xs">{v.label} · </span>{v.text}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-2">
                    <p className="text-xs text-center text-muted-foreground mb-2">Tu maîtrisais cette réponse&nbsp;?</p>
                    <div className="grid grid-cols-3 gap-2">
                      <Button variant="outline" onClick={() => rate("hard")} disabled={isRating} className="border-destructive/40 text-destructive hover:bg-destructive/10 flex flex-col h-auto py-2.5 gap-1 rounded-xl" data-testid="button-card-rate-hard">
                        <ThumbsDown className="w-4 h-4" /><span className="text-[11px] font-medium">Difficile</span>
                      </Button>
                      <Button variant="outline" onClick={() => rate("medium")} disabled={isRating} className="border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 flex flex-col h-auto py-2.5 gap-1 rounded-xl" data-testid="button-card-rate-medium">
                        <Minus className="w-4 h-4" /><span className="text-[11px] font-medium">Moyen</span>
                      </Button>
                      <Button variant="outline" onClick={() => rate("easy")} disabled={isRating} className="border-accent/50 text-accent hover:bg-accent/10 flex flex-col h-auto py-2.5 gap-1 rounded-xl" data-testid="button-card-rate-easy">
                        <ThumbsUp className="w-4 h-4" /><span className="text-[11px] font-medium">Maîtrisé</span>
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
