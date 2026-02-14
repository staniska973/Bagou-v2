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

  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [feedbackData, setFeedbackData] = useState<FeedbackData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cardsCompleted, setCardsCompleted] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);
  const [showVariants, setShowVariants] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  let dueUrl = `/api/flashcards/due/${profileId}`;
  if (themeId) dueUrl += `?themeId=${themeId}`;
  if (subthemeId) dueUrl += `${themeId ? "&" : "?"}subthemeId=${subthemeId}`;

  const { data: dueCards, isLoading: cardsLoading } = useQuery<FlashcardData[]>({
    queryKey: ["/api/flashcards/due", profileId, themeId, subthemeId],
    queryFn: async () => {
      const res = await fetch(dueUrl);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!profileId,
  });

  const currentCard = dueCards?.[currentCardIndex];

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
      setCardsCompleted((prev) => prev + 1);
    } catch (error) {
      console.error("Error submitting answer:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextCard = () => {
    if (dueCards && currentCardIndex < dueCards.length - 1) {
      setCurrentCardIndex((prev) => prev + 1);
      setUserAnswer("");
      setFeedbackData(null);
      setShowVariants(false);
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

  if (sessionDone || !dueCards || dueCards.length === 0) {
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
                {sessionDone ? "Session terminee" : "Aucune carte a reviser"}
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                {sessionDone
                  ? `${cardsCompleted} carte${cardsCompleted > 1 ? "s" : ""} revue${cardsCompleted > 1 ? "s" : ""}`
                  : "Revenez plus tard pour de nouvelles cartes"}
              </p>
              <Button onClick={handleFinish} className="w-full" data-testid="button-finish-session">
                Retour
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  const progressPercent = dueCards.length > 0 ? (currentCardIndex / dueCards.length) * 100 : 0;

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
              <span className="text-xs text-muted-foreground">
                {currentCardIndex + 1}/{dueCards.length}
              </span>
            </div>
            <Progress value={progressPercent} className="h-1" />
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentCard?.card.cardId}
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
                    </div>
                    <p className="text-sm leading-relaxed" data-testid="text-situation">
                      {currentCard.card.situation}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      <span className="font-medium">Objectif:</span> {currentCard.card.userGoal}
                    </p>
                  </CardContent>
                </Card>

                <div className="flex-1 flex flex-col min-h-0">
                  <Card className="flex-1 flex flex-col">
                    <CardContent className="p-3 flex-1 flex flex-col">
                      <Textarea
                        ref={textareaRef}
                        placeholder="Ecrivez votre reponse..."
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 resize-none border-0 text-sm focus-visible:ring-0"
                        disabled={isSubmitting}
                        data-testid="textarea-answer"
                      />
                      <div className="flex justify-end mt-2">
                        <Button
                          onClick={submitAnswer}
                          disabled={!userAnswer.trim() || isSubmitting}
                          size="sm"
                          data-testid="button-submit-answer"
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                              Evaluation...
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
                        {feedbackData.feedback.pass ? "Bien joue" : "A retravailler"}
                      </span>
                      <Badge
                        variant={feedbackData.feedback.ratingSuggested === "easy" ? "default" : feedbackData.feedback.ratingSuggested === "medium" ? "secondary" : "destructive"}
                        className="ml-auto text-[10px]"
                        data-testid="badge-rating"
                      >
                        {feedbackData.feedback.ratingSuggested === "easy" ? "Maitrise" : feedbackData.feedback.ratingSuggested === "medium" ? "Correct" : "Difficile"}
                      </Badge>
                    </div>
                    <p className="text-xs" data-testid="text-feedback">{feedbackData.feedback.feedback}</p>
                    {feedbackData.feedback.oneFix && (
                      <div className="bg-muted/50 rounded-md p-2 text-xs mt-2">
                        <p className="font-medium text-[10px] text-muted-foreground mb-0.5">Amelioration</p>
                        <p data-testid="text-onefix">{feedbackData.feedback.oneFix}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="flex-shrink-0">
                  <CardContent className="p-3">
                    <p className="font-medium text-xs text-muted-foreground mb-1">Reponse modele</p>
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
                        <VariantRow label="Equilibree" text={feedbackData.variants.medium} testId="text-variant-medium" />
                        <VariantRow label="Audacieuse" text={feedbackData.variants.bold} testId="text-variant-bold" />
                      </motion.div>
                    )}
                  </CardContent>
                </Card>

                <Button onClick={nextCard} className="w-full flex-shrink-0" data-testid="button-next-card">
                  {currentCardIndex < dueCards.length - 1 ? (
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
