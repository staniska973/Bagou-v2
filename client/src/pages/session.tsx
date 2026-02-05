import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  MessageSquare,
  Zap,
  Send,
  Mic,
  MicOff,
  Eye,
  ThumbsDown,
  Minus,
  ThumbsUp,
  RotateCcw,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/lib/store";
import { getTranslations } from "@/lib/i18n";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";

type SessionPhase = "flashcards" | "roleplay" | "debrief";

interface FlashcardData {
  card: {
    cardId: string;
    situation: string;
    userGoal: string;
    constraints: any[];
    antiPatterns: string[];
    channel: string;
    difficulty: string;
  };
  srsState?: any;
}

interface ModelAnswer {
  modelAnswer: string;
  variants: {
    safe: string;
    medium: string;
    bold: string;
  };
  feedback?: {
    pass: boolean;
    ratingSuggested: string;
    oneFix: string;
    redoPrompt: string;
  };
}

export default function Session() {
  const [, navigate] = useLocation();
  const { language, profileId, currentSessionId, sessionPhase, setSessionPhase, setCurrentSessionId } = useAppStore();
  const t = getTranslations(language);

  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [hasRevealed, setHasRevealed] = useState(false);
  const [modelAnswer, setModelAnswer] = useState<ModelAnswer | null>(null);
  const [needsRedo, setNeedsRedo] = useState(false);
  const [redoAnswer, setRedoAnswer] = useState("");
  const [roleplayMessages, setRoleplayMessages] = useState<{ role: string; content: string }[]>([]);
  const [roleplayInput, setRoleplayInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [debriefData, setDebriefData] = useState<any>(null);

  const { data: dueCards, isLoading: cardsLoading } = useQuery<FlashcardData[]>({
    queryKey: ["/api/flashcards/due", profileId],
    enabled: !!profileId && sessionPhase === "flashcards",
  });

  const { data: scenario, isLoading: scenarioLoading } = useQuery({
    queryKey: ["/api/scenarios/random", profileId],
    enabled: !!profileId && sessionPhase === "roleplay" && roleplayMessages.length === 0,
  });

  const generateModelAnswer = useMutation({
    mutationFn: async (data: { cardId: string; userAnswer: string }) => {
      const res = await apiRequest("POST", "/api/flashcards/generate-answer", {
        profileId,
        ...data,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setModelAnswer(data);
    },
  });

  const submitRating = useMutation({
    mutationFn: async (data: { cardId: string; rating: string; userAnswer: string }) => {
      const res = await apiRequest("POST", "/api/flashcards/rate", {
        profileId,
        sessionId: currentSessionId,
        ...data,
      });
      return res.json();
    },
    onSuccess: () => {
      moveToNextCard();
    },
  });

  const sendRoleplayMessage = useMutation({
    mutationFn: async (data: { message: string }) => {
      const res = await apiRequest("POST", "/api/roleplay/message", {
        profileId,
        sessionId: currentSessionId,
        scenarioId: scenario?.scenarioId,
        history: roleplayMessages,
        userMessage: data.message,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setRoleplayMessages((prev) => [
        ...prev,
        { role: "user", content: roleplayInput },
        { role: "assistant", content: data.aiMessage },
      ]);
      setRoleplayInput("");
      if (data.stop) {
        endRoleplay();
      }
    },
  });

  const generateDebrief = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/debrief/generate", {
        profileId,
        sessionId: currentSessionId,
        transcript: roleplayMessages,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setDebriefData(data);
    },
  });

  const currentCard = dueCards?.[currentCardIndex];
  const totalCards = dueCards?.length || 0;
  const progress = totalCards > 0 ? ((currentCardIndex + 1) / totalCards) * 100 : 0;

  const handleReveal = () => {
    if (!currentCard || !userAnswer.trim()) return;
    setHasRevealed(true);
    generateModelAnswer.mutate({
      cardId: currentCard.card.cardId,
      userAnswer: userAnswer.trim(),
    });
  };

  const handleRating = (rating: "hard" | "medium" | "easy") => {
    if (!currentCard) return;
    
    if (modelAnswer?.feedback && !modelAnswer.feedback.pass && !needsRedo) {
      setNeedsRedo(true);
      return;
    }

    submitRating.mutate({
      cardId: currentCard.card.cardId,
      rating,
      userAnswer: needsRedo ? redoAnswer : userAnswer,
    });
  };

  const handleRedo = () => {
    if (!redoAnswer.trim()) return;
    setNeedsRedo(false);
    handleRating(modelAnswer?.feedback?.ratingSuggested as "hard" | "medium" | "easy" || "medium");
  };

  const moveToNextCard = () => {
    if (currentCardIndex < totalCards - 1) {
      setCurrentCardIndex((prev) => prev + 1);
      resetCardState();
    } else {
      setSessionPhase("roleplay");
    }
  };

  const resetCardState = () => {
    setUserAnswer("");
    setHasRevealed(false);
    setModelAnswer(null);
    setNeedsRedo(false);
    setRedoAnswer("");
  };

  const startRoleplay = () => {
    if (scenario?.startingMessage) {
      setRoleplayMessages([{ role: "assistant", content: scenario.startingMessage }]);
    }
  };

  const handleSendRoleplay = () => {
    if (!roleplayInput.trim()) return;
    sendRoleplayMessage.mutate({ message: roleplayInput.trim() });
  };

  const endRoleplay = () => {
    setSessionPhase("debrief");
    generateDebrief.mutate();
  };

  const finishSession = () => {
    setCurrentSessionId(null);
    setSessionPhase(null);
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    navigate("/");
  };

  useEffect(() => {
    if (sessionPhase === "roleplay" && scenario && roleplayMessages.length === 0) {
      startRoleplay();
    }
  }, [scenario, sessionPhase]);

  if (!currentSessionId) {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      <SessionHeader phase={sessionPhase || "flashcards"} t={t} />

      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-lg mx-auto">
          <AnimatePresence mode="wait">
            {sessionPhase === "flashcards" && (
              <motion.div
                key="flashcards"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                {cardsLoading ? (
                  <FlashcardSkeleton />
                ) : currentCard ? (
                  <FlashcardView
                    card={currentCard.card}
                    userAnswer={userAnswer}
                    setUserAnswer={setUserAnswer}
                    hasRevealed={hasRevealed}
                    modelAnswer={modelAnswer}
                    onReveal={handleReveal}
                    onRating={handleRating}
                    needsRedo={needsRedo}
                    redoAnswer={redoAnswer}
                    setRedoAnswer={setRedoAnswer}
                    onRedo={handleRedo}
                    isGenerating={generateModelAnswer.isPending}
                    isSubmitting={submitRating.isPending}
                    progress={progress}
                    currentIndex={currentCardIndex}
                    total={totalCards}
                    t={t}
                  />
                ) : (
                  <EmptyCards t={t} onContinue={() => setSessionPhase("roleplay")} />
                )}
              </motion.div>
            )}

            {sessionPhase === "roleplay" && (
              <motion.div
                key="roleplay"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full flex flex-col"
              >
                {scenarioLoading ? (
                  <RoleplaySkeleton />
                ) : scenario ? (
                  <RoleplayView
                    scenario={scenario}
                    messages={roleplayMessages}
                    input={roleplayInput}
                    setInput={setRoleplayInput}
                    onSend={handleSendRoleplay}
                    onEnd={endRoleplay}
                    isSending={sendRoleplayMessage.isPending}
                    isRecording={isRecording}
                    setIsRecording={setIsRecording}
                    t={t}
                  />
                ) : (
                  <EmptyScenario t={t} onContinue={endRoleplay} />
                )}
              </motion.div>
            )}

            {sessionPhase === "debrief" && (
              <motion.div
                key="debrief"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                {generateDebrief.isPending ? (
                  <DebriefSkeleton />
                ) : debriefData ? (
                  <DebriefView
                    data={debriefData}
                    onFinish={finishSession}
                    t={t}
                  />
                ) : (
                  <DebriefView
                    data={{
                      strengths: ["Good response time", "Clear communication"],
                      improvement: "Try to be more concise",
                      optimizedRewrite: "Here's how you could improve...",
                      redoExercise: "Practice being brief",
                      scores: { clarity: 75, frame: 80, tone: 70, concision: 65 },
                    }}
                    onFinish={finishSession}
                    t={t}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function SessionHeader({ phase, t }: { phase: SessionPhase; t: any }) {
  const phases = [
    { key: "flashcards", icon: Brain, label: t.session.flashcards },
    { key: "roleplay", icon: MessageSquare, label: t.session.roleplay },
    { key: "debrief", icon: Zap, label: t.session.debrief },
  ];

  const currentIndex = phases.findIndex((p) => p.key === phase);

  return (
    <div className="bg-card border-b p-4">
      <div className="max-w-lg mx-auto flex items-center justify-between">
        {phases.map((p, idx) => {
          const Icon = p.icon;
          const isActive = p.key === phase;
          const isPast = idx < currentIndex;

          return (
            <div
              key={p.key}
              className={`flex items-center gap-2 ${
                isActive
                  ? "text-primary"
                  : isPast
                  ? "text-muted-foreground"
                  : "text-muted-foreground/50"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isPast
                    ? "bg-muted"
                    : "bg-muted/50"
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium hidden sm:inline">{p.label}</span>
              {idx < phases.length - 1 && (
                <ChevronRight className="w-4 h-4 text-muted-foreground/30 ml-2" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FlashcardView({
  card,
  userAnswer,
  setUserAnswer,
  hasRevealed,
  modelAnswer,
  onReveal,
  onRating,
  needsRedo,
  redoAnswer,
  setRedoAnswer,
  onRedo,
  isGenerating,
  isSubmitting,
  progress,
  currentIndex,
  total,
  t,
}: any) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <Badge variant="secondary">
          {currentIndex + 1} / {total}
        </Badge>
        <Badge variant="outline" className="capitalize">
          {card.difficulty}
        </Badge>
      </div>
      <Progress value={progress} className="h-2 mb-4" />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.session.context}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{card.situation}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.session.goal}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium text-primary">{card.userGoal}</p>
        </CardContent>
      </Card>

      {card.antiPatterns?.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              {t.session.antiPatterns}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {card.antiPatterns.map((pattern: string, idx: number) => (
                <li key={idx} className="text-muted-foreground">
                  - {pattern}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {!hasRevealed ? (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">{t.session.yourAnswer}</label>
            <Textarea
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder={t.session.typeHere}
              className="min-h-[100px] resize-none"
              data-testid="textarea-answer"
            />
          </div>
          <Button
            onClick={onReveal}
            disabled={!userAnswer.trim() || isGenerating}
            className="w-full"
            data-testid="button-reveal"
          >
            {isGenerating ? t.common.loading : (
              <>
                <Eye className="w-4 h-4 mr-2" />
                {t.session.reveal}
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {modelAnswer && (
            <>
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t.session.modelAnswer}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{modelAnswer.modelAnswer}</p>
                </CardContent>
              </Card>

              {modelAnswer.variants && Object.keys(modelAnswer.variants).length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t.session.variants}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {Object.entries(modelAnswer.variants).map(([key, value]) => (
                      <div key={key}>
                        <Badge variant="outline" className="mb-1 capitalize">
                          {t.session[key as keyof typeof t.session] || key}
                        </Badge>
                        <p className="text-sm text-muted-foreground">{value as string}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {needsRedo && modelAnswer.feedback && (
                <Card className="border-orange-500/30 bg-orange-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <RotateCcw className="w-4 h-4 text-orange-500" />
                      {t.session.redo}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {t.session.redoPrompt} <strong>{modelAnswer.feedback.redoPrompt}</strong>
                    </p>
                    <Textarea
                      value={redoAnswer}
                      onChange={(e) => setRedoAnswer(e.target.value)}
                      placeholder={t.session.typeHere}
                      className="min-h-[80px] resize-none"
                      data-testid="textarea-redo"
                    />
                    <Button onClick={onRedo} disabled={!redoAnswer.trim()} className="w-full" data-testid="button-redo-submit">
                      {t.session.submit}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {!needsRedo && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-center">{t.session.howWasIt}</p>
                  <div className="grid grid-cols-3 gap-3">
                    <Button
                      variant="outline"
                      onClick={() => onRating("hard")}
                      disabled={isSubmitting}
                      className="flex-col h-auto py-3"
                      data-testid="button-rate-hard"
                    >
                      <ThumbsDown className="w-5 h-5 mb-1 text-destructive" />
                      <span className="text-xs">{t.session.hard}</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => onRating("medium")}
                      disabled={isSubmitting}
                      className="flex-col h-auto py-3"
                      data-testid="button-rate-medium"
                    >
                      <Minus className="w-5 h-5 mb-1 text-orange-500" />
                      <span className="text-xs">{t.session.medium_rating}</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => onRating("easy")}
                      disabled={isSubmitting}
                      className="flex-col h-auto py-3"
                      data-testid="button-rate-easy"
                    >
                      <ThumbsUp className="w-5 h-5 mb-1 text-green-500" />
                      <span className="text-xs">{t.session.easy}</span>
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RoleplayView({
  scenario,
  messages,
  input,
  setInput,
  onSend,
  onEnd,
  isSending,
  isRecording,
  setIsRecording,
  t,
}: any) {
  return (
    <div className="flex flex-col h-[calc(100vh-200px)]">
      <Card className="mb-4">
        <CardContent className="p-4">
          <h3 className="font-medium mb-1">{scenario.title}</h3>
          <p className="text-sm text-muted-foreground">{scenario.context}</p>
          <div className="flex gap-2 mt-2">
            {scenario.targetSkills?.slice(0, 3).map((skill: string) => (
              <Badge key={skill} variant="outline" className="text-xs">
                {skill}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <ScrollArea className="flex-1 mb-4">
        <div className="space-y-4 pr-4">
          {messages.map((msg: any, idx: number) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted rounded-bl-md"
                }`}
              >
                <p className="text-sm">{msg.content}</p>
              </div>
            </motion.div>
          ))}
          {isSending && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsRecording(!isRecording)}
          className={isRecording ? "bg-destructive text-destructive-foreground" : ""}
          data-testid="button-mic"
        >
          {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </Button>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t.roleplay.yourTurn}
          className="flex-1 min-h-[44px] max-h-[120px] resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          data-testid="textarea-roleplay"
        />
        <Button onClick={onSend} disabled={!input.trim() || isSending} size="icon" data-testid="button-send-roleplay">
          <Send className="w-5 h-5" />
        </Button>
      </div>

      <Button variant="outline" onClick={onEnd} className="mt-4" data-testid="button-end-roleplay">
        {t.roleplay.endRoleplay}
      </Button>
    </div>
  );
}

function DebriefView({ data, onFinish, t }: { data: any; onFinish: () => void; t: any }) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold">{t.debrief.title}</h2>
        <p className="text-muted-foreground">{t.debrief.subtitle}</p>
      </div>

      <Card className="border-green-500/30 bg-green-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-green-600 flex items-center gap-2">
            <ThumbsUp className="w-4 h-4" />
            {t.debrief.strengths}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {data.strengths?.map((strength: string, idx: number) => (
              <li key={idx} className="text-sm flex items-start gap-2">
                <span className="text-green-500">•</span>
                {strength}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-orange-500/30 bg-orange-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-orange-600 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {t.debrief.improvement}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{data.improvement}</p>
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.debrief.optimizedRewrite}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm italic">{data.optimizedRewrite}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.debrief.scores}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(data.scores || {}).map(([key, value]) => (
            <div key={key} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="capitalize">{t.debrief[key as keyof typeof t.debrief] || key}</span>
                <span className="font-medium">{value as number}%</span>
              </div>
              <Progress value={value as number} className="h-2" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Button onClick={onFinish} className="w-full" size="lg" data-testid="button-finish-session">
        {t.debrief.finishSession}
        <ChevronRight className="w-5 h-5 ml-2" />
      </Button>
    </div>
  );
}

function EmptyCards({ t, onContinue }: { t: any; onContinue: () => void }) {
  return (
    <Card className="text-center p-8">
      <Brain className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
      <h3 className="font-medium mb-2">No cards due today</h3>
      <p className="text-sm text-muted-foreground mb-4">Let's move on to roleplay!</p>
      <Button onClick={onContinue}>{t.common.continue}</Button>
    </Card>
  );
}

function EmptyScenario({ t, onContinue }: { t: any; onContinue: () => void }) {
  return (
    <Card className="text-center p-8">
      <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
      <h3 className="font-medium mb-2">No scenarios available</h3>
      <p className="text-sm text-muted-foreground mb-4">Let's complete the session!</p>
      <Button onClick={onContinue}>{t.common.continue}</Button>
    </Card>
  );
}

function FlashcardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}

function RoleplaySkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  );
}

function DebriefSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-32 mx-auto" />
      <Skeleton className="h-4 w-48 mx-auto" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}
