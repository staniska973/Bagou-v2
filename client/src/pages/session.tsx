import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Send,
  ChevronRight,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  ChevronDown,
  RotateCcw,
  Mic,
  MicOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAppStore } from "@/lib/store";
import { getTranslations } from "@/lib/i18n";
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

interface FeedbackData {
  modelAnswer: string;
  variants: {
    safe: string;
    medium: string;
    bold: string;
  };
  rubric: string[];
  feedback: {
    pass: boolean;
    ratingSuggested: "hard" | "medium" | "easy";
    oneFix: string;
    redoPrompt: string;
    feedback: string;
  };
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
  const t = getTranslations(language);

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
  const [userAnswer, setUserAnswer] = useState("");
  const [feedbackData, setFeedbackData] = useState<FeedbackData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cardsCompleted, setCardsCompleted] = useState(0);
  const [cardsFailed, setCardsFailed] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);
  const [showVariants, setShowVariants] = useState(false);
  const [isRetry, setIsRetry] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
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

  const currentCard = cardQueue[currentQueueIndex];
  const totalOriginal = dueCards?.length || 0;

  const submitAnswer = async () => {
    if (!userAnswer.trim() || !currentCard || !profileId) return;

    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/flashcards/generate-answer", {
        profileId,
        cardId: currentCard.card.cardId,
        userAnswer: userAnswer.trim(),
      });
      const data: FeedbackData = await res.json();
      setFeedbackData(data);

      const rating = data.feedback.ratingSuggested;
      await apiRequest("POST", "/api/flashcards/rate", {
        profileId,
        sessionId: sessionId ? parseInt(sessionId) : null,
        cardId: currentCard.card.cardId,
        rating,
        userAnswer: userAnswer.trim(),
      });

      if (data.feedback.pass) {
        setCardsCompleted((prev) => prev + 1);
      } else {
        setCardsFailed((prev) => prev + 1);
      }
    } catch (error) {
      console.error("Error submitting answer:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextCard = () => {
    const failed = feedbackData && !feedbackData.feedback.pass;
    const shouldRequeue = failed && !isRetry;

    if (shouldRequeue) {
      setCardQueue((prev) => [...prev, currentCard]);
    }

    const nextIdx = currentQueueIndex + 1;
    const queueLength = cardQueue.length + (shouldRequeue ? 1 : 0);

    if (nextIdx < queueLength) {
      setCurrentQueueIndex(nextIdx);
      setUserAnswer("");
      setFeedbackData(null);
      setShowVariants(false);
      setIsRetry(nextIdx >= totalOriginal);
    } else {
      setSessionDone(true);
    }
  };

  const handleFinish = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/flashcards/due"] });
    navigate("/");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitAnswer();
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
              setUserAnswer((prev) => (prev ? prev + " " + text : text));
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
                {sessionDone ? "Session terminée" : "Aucune carte à réviser"}
              </h2>
              <p className="text-sm text-muted-foreground mb-2">
                {sessionDone
                  ? `${cardsCompleted} carte${cardsCompleted > 1 ? "s" : ""} validée${cardsCompleted > 1 ? "s" : ""}`
                  : "Revenez plus tard pour de nouvelles cartes"}
              </p>
              {cardsFailed > 0 && sessionDone && (
                <p className="text-xs text-orange-500 mb-4">
                  {cardsFailed} carte{cardsFailed > 1 ? "s" : ""} à retravailler
                </p>
              )}
              <Button onClick={handleFinish} className="w-full" data-testid="button-finish-session">
                Retour
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
      <div className="flex-shrink-0 border-b px-3 py-2 safe-area-top">
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
              <div className="flex items-center gap-1.5">
                {isRetry && (
                  <Badge variant="secondary" className="text-[10px]">
                    <RotateCcw className="w-2.5 h-2.5 mr-0.5" />
                    Rattrapage
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {Math.min(currentQueueIndex + 1, cardQueue.length)}/{cardQueue.length}
                </span>
              </div>
            </div>
            <Progress value={progressPercent} className="h-1" />
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentCard?.card.cardId}-${currentQueueIndex}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.15 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {currentCard && !feedbackData && (
              <div className="flex-1 flex flex-col p-3 gap-3">
                <Card className="flex-shrink-0">
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <Badge variant="secondary" className="text-[10px]" data-testid="badge-theme">
                        {currentCard.card.themeId}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]" data-testid="badge-difficulty">
                        {currentCard.card.difficulty === "n1" ? "Facile" : currentCard.card.difficulty === "n2" ? "Moyen" : "Difficile"}
                      </Badge>
                      {isRetry && (
                        <Badge variant="destructive" className="text-[10px]">
                          <RotateCcw className="w-2.5 h-2.5 mr-0.5" />
                          2e essai
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed" data-testid="text-situation">
                      {currentCard.card.situation}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      <span className="font-medium">Objectif :</span> {currentCard.card.userGoal}
                    </p>
                  </CardContent>
                </Card>

                <div className="flex-1 flex flex-col min-h-0">
                  <Card className="flex-1 flex flex-col">
                    <CardContent className="p-3 flex-1 flex flex-col">
                      <Textarea
                        ref={textareaRef}
                        placeholder="Votre réponse (1-2 phrases max)..."
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 resize-none border-0 text-sm focus-visible:ring-0"
                        disabled={isSubmitting}
                        data-testid="textarea-answer"
                      />
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <Button
                          variant={isRecording ? "destructive" : "outline"}
                          size="icon"
                          onClick={isRecording ? stopRecording : startRecording}
                          disabled={isSubmitting}
                          data-testid="button-voice"
                        >
                          {isRecording ? (
                            <MicOff className="w-4 h-4" />
                          ) : (
                            <Mic className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          onClick={submitAnswer}
                          disabled={!userAnswer.trim() || isSubmitting}
                          size="sm"
                          data-testid="button-submit-answer"
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                              Évaluation...
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5 mr-1.5" />
                              Envoyer
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {currentCard && feedbackData && (
              <div className="flex-1 flex flex-col p-3 gap-2 overflow-y-auto">
                <Card className={`flex-shrink-0 ${feedbackData.feedback.pass ? "border-green-500/30" : "border-destructive/30"}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      {feedbackData.feedback.pass ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive" />
                      )}
                      <span className="font-semibold text-sm" data-testid="text-verdict">
                        {feedbackData.feedback.pass ? "Bien joué" : "À retravailler"}
                      </span>
                      <Badge
                        variant={feedbackData.feedback.ratingSuggested === "easy" ? "default" : feedbackData.feedback.ratingSuggested === "medium" ? "secondary" : "destructive"}
                        className="ml-auto text-[10px]"
                        data-testid="badge-rating"
                      >
                        {feedbackData.feedback.ratingSuggested === "easy" ? "Maîtrisé" : feedbackData.feedback.ratingSuggested === "medium" ? "Correct" : "Difficile"}
                      </Badge>
                    </div>
                    <p className="text-xs" data-testid="text-feedback">{feedbackData.feedback.feedback}</p>
                    {!feedbackData.feedback.pass && (
                      <div className="bg-orange-500/10 rounded-md p-2 text-xs mt-2">
                        <p className="font-medium text-[10px] text-orange-600 dark:text-orange-400 mb-0.5">
                          <RotateCcw className="w-2.5 h-2.5 inline mr-0.5" />
                          Cette carte reviendra en fin de session
                        </p>
                      </div>
                    )}
                    {feedbackData.feedback.oneFix && (
                      <div className="bg-muted/50 rounded-md p-2 text-xs mt-2">
                        <p className="font-medium text-[10px] text-muted-foreground mb-0.5">Conseil</p>
                        <p data-testid="text-onefix">{feedbackData.feedback.oneFix}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="flex-shrink-0">
                  <CardContent className="p-3">
                    <p className="font-medium text-xs text-muted-foreground mb-1">Réponse modèle</p>
                    <p className="text-sm leading-relaxed" data-testid="text-model-answer">{feedbackData.modelAnswer}</p>

                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground mt-2 cursor-pointer"
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
                        className="space-y-2 mt-2 overflow-hidden"
                      >
                        <VariantRow label="Prudente" text={feedbackData.variants.safe} testId="text-variant-safe" />
                        <VariantRow label="Équilibrée" text={feedbackData.variants.medium} testId="text-variant-medium" />
                        <VariantRow label="Audacieuse" text={feedbackData.variants.bold} testId="text-variant-bold" />
                      </motion.div>
                    )}
                  </CardContent>
                </Card>

                <Button onClick={nextCard} className="w-full flex-shrink-0" data-testid="button-next-card">
                  {currentQueueIndex < cardQueue.length - 1 || (feedbackData && !feedbackData.feedback.pass && !isRetry) ? (
                    <>
                      Suivante
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </>
                  ) : (
                    "Terminer"
                  )}
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
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
