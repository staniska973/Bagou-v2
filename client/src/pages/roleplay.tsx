import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Send,
  MessageSquare,
  Loader2,
  Sparkles,
  ChevronRight,
  Star,
  CheckCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useAppStore } from "@/lib/store";
import { getTranslations } from "@/lib/i18n";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

interface Scenario {
  id: number;
  scenarioId: string;
  themeId: string;
  packId: string;
  subthemeId: string;
  language: string;
  primaryChannel: string;
  title: string;
  context: string;
  objective: string;
  constraints: string[];
  startingMessage: string;
  aiName: string;
  aiPersona: string;
  aiStance: string;
  aiBoundaries: string[];
  userName: string;
  userFrame: string;
  targetSkills: string[];
  difficulty: string;
  durationSecondsTarget: number;
  turnsMin: number;
  turnsMax: number;
  phase1: string;
  phase2: string;
  phase3: string;
  successEndings: string[];
  failureEndings: string[];
  linkedCardIds: string[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface DebriefData {
  strengths: string[];
  improvement: string;
  optimizedRewrite: string;
  redoExercise: string;
  scores: {
    clarity: number;
    frame: number;
    tone: number;
    concision: number;
  };
}

type Phase = "catalog" | "roleplay" | "debrief";

const DIFFICULTY_LABELS: Record<string, string> = {
  n1: "Facile",
  n2: "Moyen",
  n3: "Difficile",
};

const DIFFICULTY_VARIANTS: Record<string, "secondary" | "default" | "destructive"> = {
  n1: "secondary",
  n2: "default",
  n3: "destructive",
};

const THEME_LABELS: Record<string, Record<string, string>> = {
  fr: {
    SOCIAL: "Social & Amical",
    PRO: "Professionnel",
    DAILY: "Quotidien",
    RELATIONNEL: "Relationnel",
    DIFFICULT: "Situations difficiles",
    STORYTELLING: "Storytelling",
  },
  en: {
    SOCIAL: "Social & Friendly",
    PRO: "Professional",
    DAILY: "Daily Life",
    RELATIONNEL: "Relationships",
    DIFFICULT: "Difficult Situations",
    STORYTELLING: "Storytelling",
  },
};

export default function Roleplay() {
  const [, navigate] = useLocation();
  const { language } = useAppStore();
  const { user } = useAuth();
  const t = getTranslations(language);

  const [phase, setPhase] = useState<Phase>("catalog");
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userMessage, setUserMessage] = useState("");
  const [debriefData, setDebriefData] = useState<DebriefData | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

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

  const { data: scenarios, isLoading: scenariosLoading } = useQuery<Scenario[]>({
    queryKey: ["/api/scenarios", `language=${language}`],
    queryFn: async () => {
      const res = await fetch(`/api/scenarios?language=${language}`);
      if (!res.ok) throw new Error("Failed to fetch scenarios");
      return res.json();
    },
    enabled: true,
  });

  const { data: stats } = useQuery<{
    dueCards: number;
    masteredCards: number;
    totalCards: number;
    totalSessions: number;
    themeProgress: { themeId: string; total: number; mastered: number; due: number }[];
  }>({
    queryKey: ["/api/stats", profile?.id],
    enabled: !!profile?.id,
  });

  const suggestedSubthemes = useMemo(() => {
    if (!stats?.themeProgress || !scenarios) return new Set<string>();
    const masteredThemes = stats.themeProgress
      .filter((tp) => tp.total > 0 && tp.mastered / tp.total >= 0.5);
    const themeIds = new Set(masteredThemes.map((tp) => tp.themeId));
    const subthemes = new Set<string>();
    for (const s of scenarios) {
      if (themeIds.has(s.themeId)) {
        subthemes.add(s.subthemeId);
      }
    }
    return subthemes;
  }, [stats, scenarios]);

  const suggestedScenarios = useMemo(() => {
    if (!scenarios || suggestedSubthemes.size === 0) return [];
    return scenarios.filter((s) => suggestedSubthemes.has(s.subthemeId));
  }, [scenarios, suggestedSubthemes]);

  const scenariosByTheme = useMemo(() => {
    if (!scenarios) return {};
    const grouped: Record<string, Scenario[]> = {};
    for (const s of scenarios) {
      if (!grouped[s.themeId]) grouped[s.themeId] = [];
      grouped[s.themeId].push(s);
    }
    return grouped;
  }, [scenarios]);

  const sendMessage = useMutation({
    mutationFn: async (msg: string) => {
      const res = await apiRequest("POST", "/api/roleplay/message", {
        profileId: profile?.id,
        scenarioId: activeScenario?.scenarioId,
        history: chatHistory,
        userMessage: msg,
      });
      return res.json();
    },
    onSuccess: (data: { aiMessage: string; stop: boolean }) => {
      setChatHistory((prev) => [...prev, { role: "assistant", content: data.aiMessage }]);
      if (data.stop) {
        generateDebrief.mutate();
      }
    },
  });

  const generateDebrief = useMutation({
    mutationFn: async () => {
      const transcript = chatHistory
        .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
        .join("\n");
      const res = await apiRequest("POST", "/api/debrief/generate", {
        profileId: profile?.id,
        transcript,
      });
      return res.json();
    },
    onSuccess: (data: DebriefData) => {
      setDebriefData(data);
      setPhase("debrief");
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const handleStartScenario = (scenario: Scenario) => {
    setActiveScenario(scenario);
    setChatHistory([{ role: "assistant", content: scenario.startingMessage }]);
    setUserMessage("");
    setDebriefData(null);
    setPhase("roleplay");
  };

  const handleSendMessage = () => {
    const msg = userMessage.trim();
    if (!msg || sendMessage.isPending) return;
    setChatHistory((prev) => [...prev, { role: "user", content: msg }]);
    setUserMessage("");
    sendMessage.mutate(msg);
  };

  const handleEndRoleplay = () => {
    generateDebrief.mutate();
  };

  const handleBackToCatalog = () => {
    setPhase("catalog");
    setActiveScenario(null);
    setChatHistory([]);
    setDebriefData(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const themeLabel = (themeId: string) =>
    THEME_LABELS[language]?.[themeId] || THEME_LABELS.fr[themeId] || themeId;

  if (scenariosLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center gap-3 mb-6">
            <Skeleton className="w-9 h-9 rounded-md" />
            <Skeleton className="w-48 h-7" />
          </div>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="w-full h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (phase === "debrief" && debriefData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={handleBackToCatalog} data-testid="button-back-catalog-debrief">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-semibold">{t.debrief.title}</h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto p-4 space-y-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground mb-4">{t.debrief.subtitle}</p>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  {Object.entries(debriefData.scores).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium capitalize">
                          {t.debrief[key as keyof typeof t.debrief] || key}
                        </span>
                        <span className="text-sm text-muted-foreground">{value}/10</span>
                      </div>
                      <Progress value={value * 10} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <h3 className="font-semibold">{t.debrief.strengths}</h3>
                </div>
                <ul className="space-y-1">
                  {debriefData.strengths.map((s, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <Star className="w-3 h-3 mt-1 text-green-500 shrink-0" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold mb-2">{t.debrief.improvement}</h3>
                <p className="text-sm text-muted-foreground">{debriefData.improvement}</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold mb-2">{t.debrief.optimizedRewrite}</h3>
                <p className="text-sm text-muted-foreground italic">{debriefData.optimizedRewrite}</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold mb-2">{t.debrief.redoExercise}</h3>
                <p className="text-sm text-muted-foreground">{debriefData.redoExercise}</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <Button onClick={handleBackToCatalog} className="w-full" data-testid="button-finish-debrief">
              {t.debrief.finishSession}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </motion.div>
        </div>
      </div>
    );
  }

  if (phase === "roleplay" && activeScenario) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Button variant="ghost" size="icon" onClick={handleBackToCatalog} data-testid="button-back-catalog-roleplay">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold truncate" data-testid="text-roleplay-title">{activeScenario.title}</h2>
                <p className="text-xs text-muted-foreground truncate">{activeScenario.aiName}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEndRoleplay}
              disabled={generateDebrief.isPending || chatHistory.length < 3}
              data-testid="button-end-roleplay"
            >
              {generateDebrief.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t.roleplay.endRoleplay
              )}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-4 space-y-3">
            <Card className="mb-4">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-1">{activeScenario.context}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">{language === "fr" ? "Objectif" : "Goal"}:</span> {activeScenario.objective}
                </p>
              </CardContent>
            </Card>

            <AnimatePresence initial={false}>
              {chatHistory.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  data-testid={`chat-message-${msg.role}-${i}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {msg.role === "assistant" && (
                      <p className="text-xs font-medium mb-1 opacity-70">{activeScenario.aiName}</p>
                    )}
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {sendMessage.isPending && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t.roleplay.thinking}
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={chatEndRef} />
          </div>
        </div>

        <div className="sticky bottom-0 bg-background/80 backdrop-blur-md border-t px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-end gap-2">
            <Textarea
              placeholder={t.roleplay.yourTurn}
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[44px] max-h-[120px] resize-none text-sm"
              disabled={sendMessage.isPending}
              data-testid="textarea-roleplay-message"
            />
            <Button
              size="icon"
              onClick={handleSendMessage}
              disabled={!userMessage.trim() || sendMessage.isPending}
              data-testid="button-send-message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back-home">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold" data-testid="text-roleplay-catalog-title">
              {t.session.roleplay}
            </h1>
            <p className="text-xs text-muted-foreground">
              {scenarios?.length || 0} {language === "fr" ? "scenarios disponibles" : "scenarios available"}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {suggestedScenarios.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-sm" data-testid="text-smart-suggestions-title">
                {language === "fr" ? "Suggestions pour vous" : "Suggested for you"}
              </h2>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {suggestedScenarios.slice(0, 5).map((scenario) => (
                <Card
                  key={scenario.scenarioId}
                  className="hover-elevate cursor-pointer min-w-[260px] max-w-[280px] shrink-0"
                  onClick={() => handleStartScenario(scenario)}
                  data-testid={`card-suggested-scenario-${scenario.scenarioId}`}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge variant={DIFFICULTY_VARIANTS[scenario.difficulty] || "secondary"} className="text-xs">
                        {DIFFICULTY_LABELS[scenario.difficulty] || scenario.difficulty}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {themeLabel(scenario.themeId)}
                      </Badge>
                    </div>
                    <h3 className="font-medium text-sm mb-1" data-testid={`text-suggested-title-${scenario.scenarioId}`}>
                      {scenario.title}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">{scenario.context}</p>
                    {scenario.targetSkills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {scenario.targetSkills.slice(0, 2).map((skill, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        )}

        {Object.entries(scenariosByTheme).map(([themeId, themeScenarios], themeIndex) => (
          <motion.div
            key={themeId}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: themeIndex * 0.05 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold" data-testid={`text-theme-header-${themeId}`}>
                {themeLabel(themeId)}
              </h2>
              <Badge variant="secondary" className="text-xs">
                {themeScenarios.length}
              </Badge>
            </div>

            <div className="space-y-3">
              {themeScenarios.map((scenario) => (
                <Card
                  key={scenario.scenarioId}
                  className="hover-elevate cursor-pointer"
                  onClick={() => handleStartScenario(scenario)}
                  data-testid={`card-scenario-${scenario.scenarioId}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <Badge variant={DIFFICULTY_VARIANTS[scenario.difficulty] || "secondary"} className="text-xs" data-testid={`badge-difficulty-${scenario.scenarioId}`}>
                            {DIFFICULTY_LABELS[scenario.difficulty] || scenario.difficulty}
                          </Badge>
                          {scenario.targetSkills.slice(0, 2).map((skill, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {skill}
                            </Badge>
                          ))}
                        </div>
                        <h3 className="font-medium text-sm mb-1" data-testid={`text-scenario-title-${scenario.scenarioId}`}>
                          {scenario.title}
                        </h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">{scenario.context}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        ))}

        {(!scenarios || scenarios.length === 0) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
            <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {language === "fr" ? "Aucun scenario disponible" : "No scenarios available"}
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
