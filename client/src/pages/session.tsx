import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Send,
  ChevronRight,
  ArrowLeft,
  CheckCircle,
  Loader2,
  RotateCcw,
  Mic,
  MicOff,
  MessageCircle,
  Lightbulb,
  ChevronDown,
  User,
  ThumbsUp,
  ThumbsDown,
  Minus,
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

interface DialogueMessage {
  role: "user" | "assistant";
  content: string;
  coachWhisper?: string;
  isFinal?: boolean;
}

interface FinalFeedback {
  modelAnswer: string;
  variants: { safe: string; medium: string; bold: string };
  rating: "hard" | "medium" | "easy";
  feedback: string;
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
  const { language } = useAppStore();
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

  const [dialogueHistory, setDialogueHistory] = useState<DialogueMessage[]>([]);
  const [turnNumber, setTurnNumber] = useState(1);
  const [maxTurns, setMaxTurns] = useState(3);
  const [isWaiting, setIsWaiting] = useState(false);
  const [finalFeedback, setFinalFeedback] = useState<FinalFeedback | null>(null);
  const [showVariants, setShowVariants] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isRating, setIsRating] = useState(false);

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
  }, [dialogueHistory, isWaiting, finalFeedback]);

  const currentCard = cardQueue[currentQueueIndex];
  const totalOriginal = dueCards?.length || 0;

  const sendMessage = async () => {
    if (!userInput.trim() || !currentCard || !profileId || isWaiting) return;

    const message = userInput.trim();
    setUserInput("");

    const newUserMessage: DialogueMessage = { role: "user", content: message };
    const historyForApi = [
      ...dialogueHistory.map((m) => ({ role: m.role, content: m.content })),
    ];
    const newHistory = [...dialogueHistory, newUserMessage];
    setDialogueHistory(newHistory);
    setIsWaiting(true);

    try {
      const res = await apiRequest("POST", "/api/session/dialogue-turn", {
        profileId,
        cardId: currentCard.card.cardId,
        history: historyForApi,
        userMessage: message,
        turnNumber,
      });
      const data = await res.json();

      if (data.maxTurns && data.maxTurns !== maxTurns) {
        setMaxTurns(data.maxTurns);
      }

      const aiMessage: DialogueMessage = {
        role: "assistant",
        content: data.interlocutorReply,
        coachWhisper: data.coachWhisper,
        isFinal: data.isFinal,
      };

      setDialogueHistory((prev) => [...prev, aiMessage]);

      if (data.isFinal && data.finalFeedback) {
        setFinalFeedback(data.finalFeedback);
      } else {
        setTurnNumber((prev) => prev + 1);
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsWaiting(false);
    }
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
        userAnswer: dialogueHistory.find((m) => m.role === "user")?.content || "",
      });

      if (rating === "hard") {
        setCardsFailed((prev) => prev + 1);
      } else {
        setCardsCompleted((prev) => prev + 1);
      }

      const shouldRequeue = rating === "hard";
      const nextIdx = currentQueueIndex + 1;

      setDialogueHistory([]);
      setTurnNumber(1);
      setFinalFeedback(null);
      setShowVariants(false);

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
          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });
          if (res.ok) {
            const { text } = await res.json();
            if (text) {
              setUserInput((prev) => (prev ? prev + " " + text : text));
            }
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

  const isInputDisabled = isWaiting || !!finalFeedback;

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
                  {themeId || "Session"}
                  {subthemeId ? ` / ${subthemeId}` : ""}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {Math.min(currentQueueIndex + 1, cardQueue.length)}/{cardQueue.length}
              </span>
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
                      <div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                        <MessageCircle className="w-3 h-3" />
                        Tour {Math.min(turnNumber, maxTurns)}/{maxTurns}
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed font-medium" data-testid="text-situation">
                      {currentCard.card.situation}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                      <span>
                        <span className="font-medium">Toi</span> ({currentCard.card.speakerRole})
                        {" → "}
                        <span className="font-medium">{currentCard.card.otherRole}</span>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
                {dialogueHistory.length === 0 && (
                  <div className="text-center text-muted-foreground text-xs py-6">
                    <p className="mb-1">Objectif : <span className="font-medium text-foreground">{currentCard.card.userGoal}</span></p>
                    <p>Tape ta première réplique ci-dessous</p>
                  </div>
                )}

                {dialogueHistory.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    {msg.role === "user" ? (
                      <div className="flex items-end gap-2 max-w-[85%]">
                        <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3 py-2 text-sm" data-testid={`bubble-user-${idx}`}>
                          {msg.content}
                        </div>
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                          <User className="w-3 h-3 text-primary" />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-end gap-2 max-w-[85%]">
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <MessageCircle className="w-3 h-3 text-muted-foreground" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] text-muted-foreground font-medium ml-1">
                            {currentCard.card.otherRole}
                          </div>
                          <div className={`rounded-2xl rounded-bl-sm px-3 py-2 text-sm ${msg.isFinal ? "bg-muted/80" : "bg-muted"}`} data-testid={`bubble-ai-${idx}`}>
                            {msg.content}
                          </div>
                          {msg.coachWhisper && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="flex items-start gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 ml-1"
                              data-testid={`coach-whisper-${idx}`}
                            >
                              <Lightbulb className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                              <p className="text-[11px] text-amber-700 dark:text-amber-400 italic">{msg.coachWhisper}</p>
                            </motion.div>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}

                {isWaiting && (
                  <div className="flex items-end gap-2">
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <MessageCircle className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}

                {finalFeedback && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3 pt-2"
                    data-testid="section-final-feedback"
                  >
                    <div className="border-t pt-3 text-center">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bilan de l'échange</p>
                    </div>

                    <Card className={`${finalFeedback.rating === "hard" ? "border-destructive/40" : finalFeedback.rating === "easy" ? "border-green-500/40" : "border-amber-500/40"}`}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={finalFeedback.rating === "easy" ? "default" : finalFeedback.rating === "medium" ? "secondary" : "destructive"}
                            className="text-[10px]"
                            data-testid="badge-final-rating"
                          >
                            {finalFeedback.rating === "easy" ? "Maîtrisé" : finalFeedback.rating === "medium" ? "Correct" : "À retravailler"}
                          </Badge>
                        </div>
                        <p className="text-sm" data-testid="text-final-feedback">{finalFeedback.feedback}</p>

                        <div className="bg-muted/50 rounded-lg p-2.5">
                          <p className="text-[10px] font-medium text-muted-foreground mb-1">Réponse idéale (1er échange)</p>
                          <p className="text-sm font-medium" data-testid="text-model-answer">{finalFeedback.modelAnswer}</p>
                        </div>

                        <button
                          className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer"
                          onClick={() => setShowVariants(!showVariants)}
                          data-testid="button-toggle-variants"
                        >
                          <ChevronDown className={`w-3 h-3 transition-transform ${showVariants ? "rotate-180" : ""}`} />
                          3 variantes
                        </button>

                        {showVariants && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="space-y-1.5 overflow-hidden"
                          >
                            <VariantRow label="Prudente" text={finalFeedback.variants.safe} testId="text-variant-safe" />
                            <VariantRow label="Équilibrée" text={finalFeedback.variants.medium} testId="text-variant-medium" />
                            <VariantRow label="Audacieuse" text={finalFeedback.variants.bold} testId="text-variant-bold" />
                          </motion.div>
                        )}
                      </CardContent>
                    </Card>

                    <div className="space-y-2">
                      <p className="text-xs text-center text-muted-foreground">Comment tu as géré cet échange ?</p>
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

              {!finalFeedback && (
                <div className="flex-shrink-0 border-t px-3 py-2 bg-background">
                  <div className="flex items-end gap-2">
                    <Textarea
                      ref={textareaRef}
                      placeholder={turnNumber === 1 ? "Ta première réplique (1-2 phrases)..." : "Continue l'échange..."}
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="flex-1 resize-none text-sm min-h-[60px] max-h-[120px]"
                      disabled={isInputDisabled}
                      rows={2}
                      data-testid="textarea-answer"
                    />
                    <div className="flex flex-col gap-1.5">
                      <Button
                        variant={isRecording ? "destructive" : "outline"}
                        size="icon"
                        className="w-9 h-9"
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isInputDisabled}
                        data-testid="button-voice"
                      >
                        {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </Button>
                      <Button
                        size="icon"
                        className="w-9 h-9"
                        onClick={sendMessage}
                        disabled={!userInput.trim() || isInputDisabled}
                        data-testid="button-submit-answer"
                      >
                        {isWaiting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
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

function VariantRow({ label, text, testId }: { label: string; text: string; testId: string }) {
  return (
    <div className="border-l-2 border-muted pl-2">
      <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground" data-testid={testId}>{text}</p>
    </div>
  );
}
