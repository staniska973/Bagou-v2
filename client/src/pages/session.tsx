import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Send,
  ArrowLeft,
  CheckCircle,
  Loader2,
  Mic,
  MicOff,
  MessageCircle,
  Lightbulb,
  ChevronDown,
  User,
  ThumbsUp,
  ThumbsDown,
  Minus,
  RotateCcw,
  ChevronRight,
  Zap,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAppStore } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";

interface FlashcardData {
  card: {
    cardId: string;
    situation: string;
    userGoal: string;
    constraints: any[];
    antiPatterns: string[];
    channel: string;
    difficulty: string;
    themeId: string;
    subthemeId: string;
    speakerRole: string;
    otherRole: string;
    relationship: string;
    stakes: string;
    targetVibe: string;
  };
  srsState?: any;
}

interface TurnEvaluation {
  score: "weak" | "ok" | "strong";
  comment: string;
  modelAnswer: string;
  variants: { safe: string; medium: string; bold: string };
}

interface GlobalDynamic {
  feedback: string;
  rating: "hard" | "medium" | "easy";
  pattern: string;
}

interface ConvoMessage {
  role: "user" | "interlocutor";
  content: string;
  eval?: TurnEvaluation;
}

interface DialogueTurnResult {
  turnEval: TurnEvaluation;
  interlocutorReply: string;
  isFinalTurn: boolean;
  globalDynamic?: GlobalDynamic;
  maxTurns?: number;
}

type SessionPhase = "typing" | "evaluating" | "reviewed" | "globalFeedback";

function ScoreChip({ score }: { score: "weak" | "ok" | "strong" }) {
  if (score === "strong") {
    return (
      <Badge className="text-[10px] bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/30 shrink-0">
        ✓ Fort
      </Badge>
    );
  }
  if (score === "ok") {
    return (
      <Badge className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
        ~ Correct
      </Badge>
    );
  }
  return (
    <Badge className="text-[10px] bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 shrink-0">
      ✗ Faible
    </Badge>
  );
}

function VariantRow({ label, text, testId }: { label: string; text: string; testId: string }) {
  return (
    <div className="text-xs" data-testid={testId}>
      <span className="text-muted-foreground font-medium">{label} : </span>
      <span>{text}</span>
    </div>
  );
}

export default function Session() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const sessionId = params.get("sessionId");
  const profileIdParam = params.get("profileId");
  const themeId = params.get("themeId");
  const subthemeId = params.get("subthemeId");
  const mode = params.get("mode");
  const { user } = useAuth();

  const { data: profile } = useQuery({
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

  const profileId = profileIdParam ? parseInt(profileIdParam) : profile?.id;

  const [cardQueue, setCardQueue] = useState<FlashcardData[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);
  const [cardsCompleted, setCardsCompleted] = useState(0);
  const [cardsFailed, setCardsFailed] = useState(0);

  const [phase, setPhase] = useState<SessionPhase>("typing");
  const [convoHistory, setConvoHistory] = useState<ConvoMessage[]>([]);
  const [pendingResult, setPendingResult] = useState<DialogueTurnResult | null>(null);
  const [turnNumber, setTurnNumber] = useState(1);
  const [maxTurns, setMaxTurns] = useState(3);
  const [globalDynamic, setGlobalDynamic] = useState<GlobalDynamic | null>(null);
  const [isRewrite, setIsRewrite] = useState(false);
  const [isRating, setIsRating] = useState(false);

  const [userInput, setUserInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  let dueUrl = `/api/flashcards/due/${profileId}`;
  if (mode === "review") {
    dueUrl += `?mode=review`;
  } else {
    if (themeId) dueUrl += `?themeId=${themeId}`;
    if (subthemeId) dueUrl += `${themeId ? "&" : "?"}subthemeId=${subthemeId}`;
  }

  const { data: dueCards, isLoading: cardsLoading } = useQuery<FlashcardData[]>({
    queryKey: ["/api/flashcards/due", profileId, themeId, subthemeId, mode],
    queryFn: async () => {
      const res = await fetch(dueUrl);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!profileId,
  });

  useEffect(() => {
    if (dueCards && dueCards.length > 0 && cardQueue.length === 0) {
      setCardQueue([...dueCards]);
    }
  }, [dueCards]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [convoHistory, phase, pendingResult]);

  const currentCard = cardQueue[currentQueueIndex];
  const totalOriginal = dueCards?.length || 0;

  const sendMessage = async () => {
    if (!userInput.trim() || !currentCard || !profileId || phase !== "typing") return;

    const message = userInput.trim();
    setUserInput("");

    const userMsg: ConvoMessage = { role: "user", content: message };
    setConvoHistory((prev) => [...prev, userMsg]);
    setPhase("evaluating");

    try {
      const historyForApi = convoHistory.map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      }));

      const res = await apiRequest("POST", "/api/session/dialogue-turn", {
        profileId,
        cardId: currentCard.card.cardId,
        history: historyForApi,
        userMessage: message,
        turnNumber,
      });
      const data: DialogueTurnResult = await res.json();

      if (data.maxTurns && data.maxTurns !== maxTurns) {
        setMaxTurns(data.maxTurns);
      }

      setPendingResult(data);
      setPhase("reviewed");
    } catch (error) {
      console.error("Error sending message:", error);
      setConvoHistory((prev) => prev.slice(0, -1));
      setPhase("typing");
    }
  };

  const handleRewrite = (prefill?: string) => {
    setConvoHistory((prev) => prev.slice(0, -1));
    setPendingResult(null);
    setIsRewrite(true);
    setPhase("typing");
    if (prefill !== undefined) setUserInput(prefill);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleContinue = () => {
    if (!pendingResult) return;

    setConvoHistory((prev) => {
      const updated = [...prev];
      let lastUserIdx = -1;
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].role === "user") { lastUserIdx = i; break; }
      }
      if (lastUserIdx >= 0) {
        updated[lastUserIdx] = { ...updated[lastUserIdx], eval: pendingResult.turnEval };
      }
      return [...updated, { role: "interlocutor", content: pendingResult.interlocutorReply }];
    });

    if (pendingResult.isFinalTurn) {
      setGlobalDynamic(pendingResult.globalDynamic || null);
      setPhase("globalFeedback");
    } else {
      setTurnNumber((prev) => prev + 1);
      setPhase("typing");
      setTimeout(() => textareaRef.current?.focus(), 50);
    }

    setPendingResult(null);
    setIsRewrite(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const rateCard = async (rating: "hard" | "medium" | "easy") => {
    if (!currentCard || !profileId || isRating) return;
    setIsRating(true);

    try {
      await apiRequest("POST", "/api/flashcards/rate", {
        profileId,
        sessionId: sessionId ? parseInt(sessionId) : null,
        cardId: currentCard.card.cardId,
        rating,
        userAnswer: convoHistory.find((m) => m.role === "user")?.content || "",
      });

      if (rating === "hard") {
        setCardsFailed((prev) => prev + 1);
      } else {
        setCardsCompleted((prev) => prev + 1);
      }

      const shouldRequeue = rating === "hard";
      const nextIdx = currentQueueIndex + 1;

      setConvoHistory([]);
      setTurnNumber(1);
      setPendingResult(null);
      setGlobalDynamic(null);
      setIsRewrite(false);
      setPhase("typing");

      if (shouldRequeue) {
        setCardQueue((prev) => [...prev, currentCard]);
      }

      const totalAfter = cardQueue.length + (shouldRequeue ? 1 : 0);
      if (nextIdx < totalAfter) {
        setCurrentQueueIndex(nextIdx);
      } else {
        setSessionDone(true);
      }
    } catch (error) {
      console.error("Error rating card:", error);
    } finally {
      setIsRating(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        setIsRecording(false);

        try {
          const formData = new FormData();
          formData.append("audio", blob, "recording.webm");
          const res = await fetch("/api/transcribe", { method: "POST", body: formData });
          if (res.ok) {
            const { text } = await res.json();
            if (text) setUserInput((prev) => (prev ? prev + " " + text : text));
          }
        } catch (err) {
          console.error("Transcription error:", err);
        }
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  };

  const handleFinish = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/flashcards/due"] });
    navigate("/");
  };

  useEffect(() => {
    if (!user) navigate("/");
  }, [user, navigate]);

  if (!profileId && !cardsLoading && profile === null) {
    navigate("/onboarding");
    return null;
  }

  if (cardsLoading || !profileId) {
    return (
      <div className="h-dvh flex items-center justify-center bg-background">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="w-full h-6" />
          <Skeleton className="w-full h-32 rounded-lg" />
          <Skeleton className="w-full h-20 rounded-lg" />
        </div>
      </div>
    );
  }

  if (sessionDone || (!cardQueue.length && !cardsLoading)) {
    return (
      <div className="h-dvh flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-sm w-full text-center"
        >
          <Card>
            <CardContent className="p-6">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h2 className="text-xl font-bold mb-1" data-testid="text-session-complete">
                {sessionDone ? "Session terminée !" : "Aucune situation à réviser"}
              </h2>
              <p className="text-sm text-muted-foreground mb-2">
                {sessionDone
                  ? `${cardsCompleted} situation${cardsCompleted > 1 ? "s" : ""} maîtrisée${cardsCompleted > 1 ? "s" : ""}`
                  : "Revenez plus tard pour de nouvelles situations"}
              </p>
              {cardsFailed > 0 && sessionDone && (
                <p className="text-xs text-orange-500 mb-4">
                  {cardsFailed} situation{cardsFailed > 1 ? "s" : ""} à retravailler
                </p>
              )}
              <Button onClick={handleFinish} className="w-full" data-testid="button-finish-session">
                Retour à l'accueil
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  const progressPercent = totalOriginal > 0
    ? Math.min((currentQueueIndex / totalOriginal) * 100, 100)
    : 0;

  return (
    <div className="h-dvh flex flex-col bg-background">
      <div className="flex-shrink-0 border-b px-3 py-2">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleFinish} data-testid="button-back-home">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <div className="flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium">
                  {themeId || "Session"}{subthemeId ? ` / ${subthemeId}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Tour {Math.min(turnNumber, maxTurns)}/{maxTurns}</span>
                <span>·</span>
                <span>{Math.min(currentQueueIndex + 1, cardQueue.length)}/{cardQueue.length}</span>
              </div>
            </div>
            <Progress value={progressPercent} className="h-1" />
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`card-${currentQueueIndex}`}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.15 }}
          className="flex-1 flex flex-col overflow-hidden max-w-lg mx-auto w-full"
        >
          {currentCard && (
            <>
              <div className="flex-shrink-0 px-3 pt-3">
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-3">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <Badge variant="secondary" className="text-[10px]" data-testid="badge-theme">
                        {currentCard.card.themeId}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]" data-testid="badge-difficulty">
                        {currentCard.card.difficulty === "n1" ? "Facile" : currentCard.card.difficulty === "n2" ? "Moyen" : "Difficile"}
                      </Badge>
                    </div>
                    <p className="text-sm leading-relaxed font-medium" data-testid="text-situation">
                      {currentCard.card.situation}
                    </p>
                    <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                      <span className="font-medium">Toi</span>
                      <span>({currentCard.card.speakerRole})</span>
                      <span>→</span>
                      <span className="font-medium">{currentCard.card.otherRole}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                {convoHistory.length === 0 && phase === "typing" && (
                  <div className="text-center text-muted-foreground text-xs py-6">
                    <p className="mb-1">
                      Objectif :{" "}
                      <span className="font-medium text-foreground">{currentCard.card.userGoal}</span>
                    </p>
                    <p>Tape ta première réplique ci-dessous</p>
                  </div>
                )}

                {convoHistory.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {msg.role === "user" ? (
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="flex items-end gap-2 max-w-[85%]">
                          <div
                            className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3 py-2 text-sm"
                            data-testid={`bubble-user-${idx}`}
                          >
                            {msg.content}
                          </div>
                          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                            <User className="w-3 h-3 text-primary" />
                          </div>
                        </div>
                        {msg.eval && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="w-full max-w-[90%] mr-8"
                          >
                            <div className="bg-muted/40 border rounded-xl px-2.5 py-1.5 text-left flex items-start gap-1.5 flex-wrap">
                              <ScoreChip score={msg.eval.score} />
                              <span className="text-xs text-muted-foreground leading-relaxed">{msg.eval.comment}</span>
                            </div>
                          </motion.div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-end gap-2 max-w-[85%]">
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <MessageCircle className="w-3 h-3 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground font-medium ml-1 mb-0.5">
                            {currentCard.card.otherRole}
                          </div>
                          <div
                            className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2 text-sm"
                            data-testid={`bubble-ai-${idx}`}
                          >
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}

                {phase === "evaluating" && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-6 h-6 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <Zap className="w-3 h-3 text-amber-500" />
                    </div>
                    <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span className="text-xs">Évaluation en cours…</span>
                    </div>
                  </div>
                )}

                {phase === "reviewed" && pendingResult && (() => {
                  const score = pendingResult.turnEval.score;
                  const variants = [
                    { label: "Prudente", text: pendingResult.turnEval.variants.safe, testId: "button-variant-safe" },
                    { label: "Équilibrée", text: pendingResult.turnEval.variants.medium, testId: "button-variant-medium" },
                    { label: "Audacieuse", text: pendingResult.turnEval.variants.bold, testId: "button-variant-bold" },
                  ];

                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-2"
                      data-testid="section-turn-eval"
                    >
                      <Card className={`border-2 ${score === "strong" ? "border-green-500/30" : score === "weak" ? "border-red-500/30" : "border-amber-500/30"}`}>
                        <CardContent className="p-3 space-y-3">
                          <div className="flex items-start gap-2 flex-wrap">
                            <ScoreChip score={score} />
                            <p className="text-xs text-foreground leading-relaxed flex-1">
                              {pendingResult.turnEval.comment}
                            </p>
                          </div>

                          {score !== "strong" && (
                            <div className="space-y-2">
                              <div className="bg-muted/50 rounded-lg p-2.5">
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1.5">
                                  <Lightbulb className="w-3 h-3" />
                                  {score === "weak" ? "Choisis une réplique à réécrire" : "Ce que tu aurais pu dire"}
                                </p>
                                <button
                                  className="text-sm font-medium leading-relaxed text-left w-full hover:text-primary transition-colors"
                                  onClick={() => handleRewrite(pendingResult.turnEval.modelAnswer)}
                                  data-testid="button-use-model-answer"
                                >
                                  {pendingResult.turnEval.modelAnswer}
                                </button>
                              </div>

                              <div className="space-y-1.5">
                                {variants.map((v) => (
                                  <button
                                    key={v.label}
                                    className="w-full text-left text-xs border rounded-lg px-2.5 py-2 hover:bg-muted/60 transition-colors"
                                    onClick={() => handleRewrite(v.text)}
                                    data-testid={v.testId}
                                  >
                                    <span className="font-semibold text-muted-foreground">{v.label} : </span>
                                    {v.text}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2">
                            {score === "strong" || isRewrite ? (
                              <>
                                {score !== "strong" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 text-xs h-9 gap-1.5"
                                    onClick={() => handleRewrite()}
                                    data-testid="button-rewrite"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    Réécrire
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  className="flex-1 text-xs h-9 gap-1.5"
                                  onClick={handleContinue}
                                  data-testid="button-continue"
                                >
                                  Continuer
                                  <ChevronRight className="w-3 h-3" />
                                </Button>
                              </>
                            ) : score === "ok" ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 text-xs h-9 gap-1.5"
                                  onClick={() => handleRewrite()}
                                  data-testid="button-rewrite"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Réécrire
                                </Button>
                                <Button
                                  size="sm"
                                  className="flex-1 text-xs h-9 gap-1.5"
                                  onClick={handleContinue}
                                  data-testid="button-continue"
                                >
                                  Continuer
                                  <ChevronRight className="w-3 h-3" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 text-xs h-9 gap-1.5"
                                onClick={() => handleRewrite()}
                                data-testid="button-rewrite"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Réécrire librement
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })()}

                {phase === "globalFeedback" && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3 pt-1"
                    data-testid="section-global-feedback"
                  >
                    <div className="border-t pt-3 text-center">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5" />
                        Dynamique globale
                      </p>
                    </div>

                    {globalDynamic && (
                      <Card
                        className={
                          globalDynamic.rating === "hard"
                            ? "border-destructive/40"
                            : globalDynamic.rating === "easy"
                            ? "border-green-500/40"
                            : "border-amber-500/40"
                        }
                      >
                        <CardContent className="p-3 space-y-2">
                          <Badge
                            variant={
                              globalDynamic.rating === "easy"
                                ? "default"
                                : globalDynamic.rating === "medium"
                                ? "secondary"
                                : "destructive"
                            }
                            className="text-[10px]"
                            data-testid="badge-global-rating"
                          >
                            {globalDynamic.rating === "easy"
                              ? "Maîtrisé"
                              : globalDynamic.rating === "medium"
                              ? "Correct"
                              : "À retravailler"}
                          </Badge>
                          <p className="text-sm leading-relaxed" data-testid="text-global-feedback">
                            {globalDynamic.feedback}
                          </p>
                          {globalDynamic.pattern && (
                            <div className="bg-muted/50 rounded-lg px-2.5 py-1.5">
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium">Pattern : </span>
                                {globalDynamic.pattern}
                              </p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    <div className="space-y-2">
                      <p className="text-xs text-center text-muted-foreground">
                        Comment tu as géré cet échange ?
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => rateCard("hard")}
                          disabled={isRating}
                          className="border-destructive/40 text-destructive hover:bg-destructive/10 flex flex-col h-auto py-2 gap-1"
                          data-testid="button-rate-hard"
                        >
                          <ThumbsDown className="w-4 h-4" />
                          <span className="text-[10px]">Difficile</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => rateCard("medium")}
                          disabled={isRating}
                          className="border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 flex flex-col h-auto py-2 gap-1"
                          data-testid="button-rate-medium"
                        >
                          <Minus className="w-4 h-4" />
                          <span className="text-[10px]">Moyen</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => rateCard("easy")}
                          disabled={isRating}
                          className="border-green-500/40 text-green-600 dark:text-green-400 hover:bg-green-500/10 flex flex-col h-auto py-2 gap-1"
                          data-testid="button-rate-easy"
                        >
                          <ThumbsUp className="w-4 h-4" />
                          <span className="text-[10px]">Maîtrisé</span>
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}

                <div ref={chatEndRef} />
              </div>

              {phase === "typing" && (
                <div className="flex-shrink-0 border-t px-3 py-2 bg-background">
                  <div className="flex items-end gap-2">
                    <Textarea
                      ref={textareaRef}
                      placeholder={
                        turnNumber === 1
                          ? "Ta première réplique (1-2 phrases)…"
                          : "Continue l'échange…"
                      }
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="flex-1 resize-none text-sm min-h-[60px] max-h-[120px]"
                      rows={2}
                      data-testid="textarea-answer"
                    />
                    <div className="flex flex-col gap-1.5">
                      <Button
                        variant={isRecording ? "destructive" : "outline"}
                        size="icon"
                        className="w-9 h-9"
                        onClick={isRecording ? stopRecording : startRecording}
                        data-testid="button-voice"
                      >
                        {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </Button>
                      <Button
                        size="icon"
                        className="w-9 h-9"
                        onClick={sendMessage}
                        disabled={!userInput.trim()}
                        data-testid="button-submit-answer"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
