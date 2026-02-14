import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Flame,
  Target,
  Trophy,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  Brain,
  MessageSquare,
  LogOut,
  User as UserIcon,
  Sparkles,
  Play,
  Settings,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAppStore } from "@/lib/store";
import { getTranslations } from "@/lib/i18n";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import bagouIcon from "../assets/images/bagou-icon.png";

interface ThemeData {
  id: string;
  label: string;
  subthemes: { id: string; label: string }[];
}

interface Stats {
  dueCards: number;
  masteredCards: number;
  totalCards: number;
  totalSessions: number;
  weakCards: number;
  weakPoints: { tag: string; count: number }[];
  themeProgress: { themeId: string; total: number; mastered: number; due: number }[];
}

const THEME_ICONS: Record<string, typeof Brain> = {
  SOCIAL: MessageSquare,
  PRO: Target,
  DAILY: Sparkles,
  RELATIONNEL: Flame,
  DIFFICULT: TrendingUp,
  STORY: Brain,
};

const THEME_COLORS: Record<string, string> = {
  SOCIAL: "text-blue-500 bg-blue-500/10",
  PRO: "text-amber-500 bg-amber-500/10",
  DAILY: "text-green-500 bg-green-500/10",
  RELATIONNEL: "text-pink-500 bg-pink-500/10",
  DIFFICULT: "text-red-500 bg-red-500/10",
  STORY: "text-purple-500 bg-purple-500/10",
};

export default function Home() {
  const [, navigate] = useLocation();
  const { language } = useAppStore();
  const { user, logout } = useAuth();
  const t = getTranslations(language);
  const [expandedTheme, setExpandedTheme] = useState<string | null>(null);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/profiles/user", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const res = await fetch(`/api/profiles/user/${user.id}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
    enabled: !!user?.id,
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/stats", profile?.id],
    enabled: !!profile?.id,
  });

  const { data: themes } = useQuery<ThemeData[]>({
    queryKey: ["/api/themes"],
  });

  const startSession = useMutation({
    mutationFn: async (params?: { themeId?: string; subthemeId?: string; mode?: string }) => {
      const res = await apiRequest("POST", "/api/sessions", { profileId: profile.id });
      const session = await res.json();
      return { session, ...params };
    },
    onSuccess: ({ session, themeId, subthemeId, mode: sessionMode }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      let url = `/session?sessionId=${session.id}&profileId=${profile.id}`;
      if (sessionMode) url += `&mode=${sessionMode}`;
      if (themeId) url += `&themeId=${themeId}`;
      if (subthemeId) url += `&subthemeId=${subthemeId}`;
      navigate(url);
    },
  });

  useEffect(() => {
    if (!profileLoading && !profile) {
      navigate("/onboarding");
    }
  }, [profileLoading, profile, navigate]);

  if (profileLoading || !profile) {
    return <HomeSkeleton />;
  }

  const streak = profile?.streak || 0;
  const dueCards = stats?.dueCards || 0;
  const masteredCards = stats?.masteredCards || 0;
  const totalCards = stats?.totalCards || 0;
  const weakCards = stats?.weakCards || 0;

  const getThemeProgress = (themeId: string) => {
    const tp = stats?.themeProgress?.find(t => t.themeId === themeId);
    return tp || { total: 0, mastered: 0, due: 0 };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b px-4 py-2">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img src={bagouIcon} alt="Bagou" className="w-8 h-8 object-contain" data-testid="img-home-logo" />
            <div>
              <p className="text-xs text-muted-foreground" data-testid="text-welcome">
                {t.home.welcomeBack}{user?.firstName ? ` ${user.firstName}` : ""}
              </p>
              <div className="flex items-center gap-2">
                <Flame className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-sm font-bold">{streak}</span>
                <span className="text-xs text-muted-foreground">{t.home.days}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => navigate("/stats")} data-testid="button-stats">
              <TrendingUp className="w-4 h-4" />
            </Button>
            <Avatar className="w-7 h-7 cursor-pointer" onClick={() => navigate("/stats")}>
              <AvatarImage src={user?.profileImageUrl || undefined} />
              <AvatarFallback>
                <UserIcon className="w-3.5 h-3.5" />
              </AvatarFallback>
            </Avatar>
            <Button variant="ghost" size="icon" onClick={() => logout()} data-testid="button-logout">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0 relative overflow-visible">
            <CardContent className="p-4 relative">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm opacity-80">Session personnalisee</p>
                  <p className="text-xs opacity-60">Cartes a revoir selon votre progression</p>
                </div>
                <div className="flex items-center gap-1 bg-white/20 rounded-full px-2 py-1">
                  <Target className="w-3.5 h-3.5" />
                  <span className="text-sm font-bold">{dueCards}</span>
                </div>
              </div>
              <Button
                onClick={() => startSession.mutate({})}
                disabled={startSession.isPending}
                className="w-full bg-white text-primary font-semibold"
                data-testid="button-start-session"
              >
                {startSession.isPending ? (
                  t.common.loading
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Commencer
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="A revoir" value={dueCards} color="text-orange-500" />
          <MiniStat label="Maitrisees" value={masteredCards} color="text-green-500" />
          <MiniStat label="Total" value={totalCards} color="text-primary" />
        </div>

        {weakCards > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card
              className={`border-orange-500/30 bg-orange-500/5 hover-elevate ${startSession.isPending ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
              onClick={() => !startSession.isPending && startSession.mutate({ mode: "review" })}
              data-testid="card-weak-cards"
            >
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                    <RotateCcw className="w-4.5 h-4.5 text-orange-500" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Points faibles</p>
                    <p className="text-xs text-muted-foreground">{weakCards} carte{weakCards > 1 ? "s" : ""} en difficulte</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-orange-500/30 text-orange-500"
                  disabled={startSession.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    startSession.mutate({ mode: "review" });
                  }}
                  data-testid="button-review-weak"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  Reviser
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-sm font-semibold">Themes</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate("/roleplay")} className="text-xs" data-testid="button-roleplay">
              <MessageSquare className="w-3.5 h-3.5 mr-1" />
              Roleplay
            </Button>
          </div>

          <div className="space-y-2">
            {themes?.map((theme) => {
              const Icon = THEME_ICONS[theme.id] || Brain;
              const colors = THEME_COLORS[theme.id] || "text-primary bg-primary/10";
              const [textColor, bgColor] = colors.split(" ");
              const progress = getThemeProgress(theme.id);
              const isExpanded = expandedTheme === theme.id;
              const totalSubthemeCards = theme.subthemes.length * 50;

              return (
                <motion.div key={theme.id} layout>
                  <Card
                    className="cursor-pointer hover-elevate"
                    onClick={() => setExpandedTheme(isExpanded ? null : theme.id)}
                    data-testid={`card-theme-${theme.id}`}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-md ${bgColor} flex items-center justify-center flex-shrink-0`}>
                          <Icon className={`w-4.5 h-4.5 ${textColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-sm">{theme.label}</p>
                            <div className="flex items-center gap-2">
                              {progress.due > 0 && (
                                <Badge variant="secondary" className="text-xs">{progress.due}</Badge>
                              )}
                              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Progress value={totalSubthemeCards > 0 ? (progress.mastered / totalSubthemeCards) * 100 : 0} className="h-1 flex-1" />
                            <span className="text-xs text-muted-foreground">{progress.mastered}/{totalSubthemeCards}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="pl-4 pr-1 py-2 space-y-1">
                          {theme.subthemes.map((sub) => (
                            <div
                              key={sub.id}
                              className="flex items-center justify-between gap-2 py-2 px-3 rounded-md hover-elevate cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                startSession.mutate({ themeId: theme.id, subthemeId: sub.id });
                              }}
                              data-testid={`btn-subtheme-${theme.id}-${sub.id}`}
                            >
                              <span className="text-sm">{sub.label}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">50 cartes</span>
                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                              </div>
                            </div>
                          ))}

                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs mt-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              startSession.mutate({ themeId: theme.id });
                            }}
                            data-testid={`button-start-theme-${theme.id}`}
                          >
                            <Play className="w-3 h-3 mr-1" />
                            Tout le theme
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="p-2 text-center">
        <p className={`text-lg font-bold ${color}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function HomeSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <Skeleton className="w-full h-12" />
        <Skeleton className="w-full h-28 rounded-lg" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
