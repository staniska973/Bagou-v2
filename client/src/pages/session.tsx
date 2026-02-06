import { useState, useEffect } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAppStore } from "@/lib/store";
import { getTranslations } from "@/lib/i18n";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  const [isRating, setIsRating] = useState(false);
  const [cardsCompleted, setCardsCompleted] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);

  const { data: dueCards, isLoading: cardsLoading } = useQuery<FlashcardData[]>({
    queryKey: ["/api/flashcards/due", profileId],
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
      setIsRating(true);
      await apiRequest("POST", "/api/flashcards/rate", {
        profileId,
        sessionId: sessionId ? parseInt(sessionId) : null,
        cardId: currentCard.card.cardId,
        rating,
        userAnswer: userAnswer.trim(),
      });
      setIsRating(false);
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
    } else {
      setSessionDone(true);
    }
  };

  const handleFinish = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/flashcards/due"] });
    navigate("/");
  };

  useEffect(() => {
    if (!user) {
      navigate("/");
    }
  }, [user, navigate]);

  if (!profileId && !cardsLoading && profile === null) {
    navigate("/onboarding");
    return null;
  }

  if (cardsLoading || !profileId) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-lg mx-auto space-y-4">
          <Skeleton className="w-full h-8" />
          <Skeleton className="w-full h-48 rounded-lg" />
          <Skeleton className="w-full h-24 rounded-lg" />
        </div>
      </div>
    );
  }

  if (sessionDone || !dueCards || dueCards.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center"
        >
          <Card>
            <CardContent className="p-8">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2" data-testid="text-session-complete">
                {sessionDone ? "Session terminee" : "Aucune carte a reviser"}
              </h2>
              <p className="text-muted-foreground mb-2">
                {sessionDone
                  ? `${cardsCompleted} carte${cardsCompleted > 1 ? "s" : ""} revue${cardsCompleted > 1 ? "s" : ""}`
                  : "Revenez plus tard pour de nouvelles cartes"}
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                {sessionDone ? "Continuez demain pour maintenir votre serie" : ""}
              </p>
              <Button onClick={handleFinish} className="w-full" data-testid="button-finish-session">
                Retour
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  const progressPercent = dueCards.length > 0 ? ((currentCardIndex) / dueCards.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
          <Button variant="ghost" size="icon" onClick={handleFinish} data-testid="button-back-home">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Flashcards</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {currentCardIndex + 1}/{dueCards.length}
              </span>
            </div>
            <Progress value={progressPercent} className="h-1.5" />
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentCard?.card.cardId}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {currentCard && (
              <div className="space-y-4">
                <Card>
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <Badge variant="secondary" className="text-xs" data-testid="badge-theme">
                        {currentCard.card.themeId}
                      </Badge>
                      <Badge variant="outline" className="text-xs" data-testid="badge-difficulty">
                        {currentCard.card.difficulty === "n1" ? "Facile" : currentCard.card.difficulty === "n2" ? "Moyen" : "Difficile"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {currentCard.card.channel}
                      </Badge>
                    </div>

                    <p className="text-base leading-relaxed mb-3" data-testid="text-situation">
                      {currentCard.card.situation}
                    </p>

                    <div className="text-sm text-muted-foreground space-y-1">
                      <p><span className="font-medium">Objectif:</span> {currentCard.card.userGoal}</p>
                      {currentCard.card.stakes && (
                        <p className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span className="font-medium">Enjeux:</span> {currentCard.card.stakes}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {!feedbackData ? (
                  <Card>
                    <CardContent className="p-4">
                      <Textarea
                        placeholder="Ecrivez votre reponse ici..."
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        className="min-h-[100px] resize-none border-0 text-base focus-visible:ring-0"
                        disabled={isSubmitting}
                        data-testid="textarea-answer"
                      />
                      <div className="flex justify-end mt-3">
                        <Button
                          onClick={submitAnswer}
                          disabled={!userAnswer.trim() || isSubmitting}
                          data-testid="button-submit-answer"
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Evaluation...
                            </>
                          ) : (
                            <>
                              <Send className="w-4 h-4 mr-2" />
                              Soumettre
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <Card className={feedbackData.feedback.pass ? "border-green-500/30" : "border-destructive/30"}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          {feedbackData.feedback.pass ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          ) : (
                            <XCircle className="w-5 h-5 text-destructive" />
                          )}
                          <span className="font-semibold" data-testid="text-verdict">
                            {feedbackData.feedback.pass ? "Bien joue" : "A retravailler"}
                          </span>
                          <Badge
                            variant={feedbackData.feedback.ratingSuggested === "easy" ? "default" : feedbackData.feedback.ratingSuggested === "medium" ? "secondary" : "destructive"}
                            className="ml-auto text-xs"
                            data-testid="badge-rating"
                          >
                            {feedbackData.feedback.ratingSuggested === "easy" ? "Maitrise" : feedbackData.feedback.ratingSuggested === "medium" ? "Correct" : "Difficile"}
                          </Badge>
                        </div>

                        <p className="text-sm mb-3" data-testid="text-feedback">{feedbackData.feedback.feedback}</p>

                        {feedbackData.feedback.oneFix && (
                          <div className="bg-muted/50 rounded-md p-3 text-sm">
                            <p className="font-medium text-xs text-muted-foreground mb-1">Point d'amelioration</p>
                            <p data-testid="text-onefix">{feedbackData.feedback.oneFix}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4">
                        <p className="font-medium text-sm text-muted-foreground mb-2">Reponse modele</p>
                        <p className="text-base leading-relaxed mb-4" data-testid="text-model-answer">{feedbackData.modelAnswer}</p>

                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Variante prudente</p>
                            <p className="text-sm text-muted-foreground" data-testid="text-variant-safe">{feedbackData.variants.safe}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Variante equilibree</p>
                            <p className="text-sm text-muted-foreground" data-testid="text-variant-medium">{feedbackData.variants.medium}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Variante audacieuse</p>
                            <p className="text-sm text-muted-foreground" data-testid="text-variant-bold">{feedbackData.variants.bold}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Button onClick={nextCard} className="w-full" size="lg" data-testid="button-next-card">
                      {currentCardIndex < dueCards.length - 1 ? (
                        <>
                          Carte suivante
                          <ChevronRight className="w-5 h-5 ml-1" />
                        </>
                      ) : (
                        "Terminer la session"
                      )}
                    </Button>
                  </motion.div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
