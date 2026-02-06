import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  TrendingUp,
  Target,
  Trophy,
  Flame,
  Brain,
  Star,
  Award,
  Zap,
  BookOpen,
  Calendar,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/lib/store";
import { getTranslations } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";

const LEVELS = [
  { level: 1, name: "Debutant", min: 0, max: 10 },
  { level: 2, name: "Apprenti", min: 11, max: 30 },
  { level: 3, name: "Communicant", min: 31, max: 60 },
  { level: 4, name: "Orateur", min: 61, max: 100 },
  { level: 5, name: "Tribun", min: 101, max: 200 },
  { level: 6, name: "Virtuose", min: 201, max: 500 },
  { level: 7, name: "Maitre", min: 501, max: Infinity },
];

function getLevel(mastered: number) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (mastered >= LEVELS[i].min) {
      return LEVELS[i];
    }
  }
  return LEVELS[0];
}

function getLevelProgress(mastered: number) {
  const current = getLevel(mastered);
  if (current.level === 7) return 100;
  const next = LEVELS[current.level];
  const progressInLevel = mastered - current.min;
  const levelRange = next.min - current.min;
  return Math.min(100, Math.round((progressInLevel / levelRange) * 100));
}

function getNextLevelCards(mastered: number) {
  const current = getLevel(mastered);
  if (current.level === 7) return 0;
  const next = LEVELS[current.level];
  return next.min - mastered;
}

const THEME_LABELS: Record<string, { fr: string; en: string }> = {
  SOCIAL: { fr: "Social", en: "Social" },
  PRO: { fr: "Professionnel", en: "Professional" },
  DAILY: { fr: "Quotidien", en: "Daily" },
  RELATIONNEL: { fr: "Relationnel", en: "Relationship" },
  DIFFICULT: { fr: "Difficile", en: "Difficult" },
  STORYTELLING: { fr: "Storytelling", en: "Storytelling" },
};

const THEME_COLORS: Record<string, string> = {
  SOCIAL: "bg-chart-1",
  PRO: "bg-chart-2",
  DAILY: "bg-chart-3",
  RELATIONNEL: "bg-chart-4",
  DIFFICULT: "bg-chart-5",
  STORYTELLING: "bg-primary",
};

interface AchievementDef {
  id: string;
  icon: React.ElementType;
  labelFr: string;
  labelEn: string;
  check: (stats: StatsData, profile: ProfileData) => boolean;
}

interface StatsData {
  dueCards: number;
  masteredCards: number;
  totalCards: number;
  totalSessions: number;
  weakPoints: { tag: string; count: number }[];
  themeProgress: { themeId: string; total: number; mastered: number; due: number }[];
}

interface ProfileData {
  id: number;
  streak: number;
  lastSessionDate: string | null;
}

const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first_session",
    icon: Zap,
    labelFr: "Premiere session",
    labelEn: "First Session",
    check: (stats) => stats.totalSessions >= 1,
  },
  {
    id: "three_day_streak",
    icon: Flame,
    labelFr: "Serie de 3 jours",
    labelEn: "3-day Streak",
    check: (_stats, profile) => profile.streak >= 3,
  },
  {
    id: "seven_day_streak",
    icon: Flame,
    labelFr: "Serie de 7 jours",
    labelEn: "7-day Streak",
    check: (_stats, profile) => profile.streak >= 7,
  },
  {
    id: "ten_cards",
    icon: BookOpen,
    labelFr: "10 cartes maitrisees",
    labelEn: "10 Cards Mastered",
    check: (stats) => stats.masteredCards >= 10,
  },
  {
    id: "fifty_cards",
    icon: Trophy,
    labelFr: "50 cartes maitrisees",
    labelEn: "50 Cards Mastered",
    check: (stats) => stats.masteredCards >= 50,
  },
  {
    id: "all_themes",
    icon: Star,
    labelFr: "Tous les themes explores",
    labelEn: "All Themes Tried",
    check: (stats) => {
      const themesWithProgress = stats.themeProgress.filter((t) => t.total > 0);
      return themesWithProgress.length >= 5;
    },
  },
  {
    id: "ten_sessions",
    icon: Award,
    labelFr: "10 sessions completees",
    labelEn: "10 Sessions Completed",
    check: (stats) => stats.totalSessions >= 10,
  },
  {
    id: "hundred_cards",
    icon: Brain,
    labelFr: "100 cartes maitrisees",
    labelEn: "100 Cards Mastered",
    check: (stats) => stats.masteredCards >= 100,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function Stats() {
  const [, navigate] = useLocation();
  const { language } = useAppStore();
  const { user } = useAuth();
  const t = getTranslations(language);

  const { data: profile, isLoading: profileLoading } = useQuery<ProfileData>({
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

  const { data: stats, isLoading: statsLoading } = useQuery<StatsData>({
    queryKey: ["/api/stats", profile?.id],
    enabled: !!profile?.id,
  });

  if (profileLoading || statsLoading) {
    return <StatsSkeleton />;
  }

  const masteredCards = stats?.masteredCards || 0;
  const totalCards = stats?.totalCards || 0;
  const totalSessions = stats?.totalSessions || 0;
  const dueCards = stats?.dueCards || 0;
  const streak = profile?.streak || 0;
  const weakPoints = stats?.weakPoints || [];
  const themeProgress = stats?.themeProgress || [];

  const currentLevel = getLevel(masteredCards);
  const levelProgress = getLevelProgress(masteredCards);
  const cardsToNext = getNextLevelCards(masteredCards);
  const overallMastery = totalCards > 0 ? Math.round((masteredCards / totalCards) * 100) : 0;

  const safeStats: StatsData = stats || {
    dueCards: 0,
    masteredCards: 0,
    totalCards: 0,
    totalSessions: 0,
    weakPoints: [],
    themeProgress: [],
  };
  const safeProfile: ProfileData = profile || { id: 0, streak: 0, lastSessionDate: null };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="bg-card border-b p-4 sticky z-50">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back-home">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold" data-testid="text-stats-title">{t.stats.title}</h1>
        </div>
      </div>

      <div className="p-6">
        <motion.div
          className="max-w-lg mx-auto space-y-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants}>
            <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0 relative overflow-visible">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
              <CardContent className="p-6 relative">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div>
                    <p className="text-sm opacity-80">
                      {language === "fr" ? "Niveau" : "Level"} {currentLevel.level}
                    </p>
                    <h2 className="text-2xl font-bold" data-testid="text-level-name">{currentLevel.name}</h2>
                  </div>
                  <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
                    <Award className="w-7 h-7" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm opacity-90">
                    <span data-testid="text-mastered-count">{masteredCards} {language === "fr" ? "maitrisees" : "mastered"}</span>
                    {currentLevel.level < 7 && (
                      <span data-testid="text-next-level">
                        {cardsToNext} {language === "fr" ? "pour le prochain" : "to next"}
                      </span>
                    )}
                  </div>
                  <div className="h-3 bg-white/20 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-white rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${levelProgress}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      data-testid="progress-level"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="bg-gradient-to-r from-orange-500/10 to-red-500/10 border-orange-500/20">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                      <Flame className="w-7 h-7 text-white" />
                    </div>
                    {streak >= 3 && (
                      <motion.div
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                      >
                        <Flame className="w-3 h-3 text-orange-700" />
                      </motion.div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-3xl font-bold" data-testid="text-streak-count">{streak}</p>
                    <p className="text-sm text-muted-foreground">
                      {streak === 1
                        ? (language === "fr" ? "jour de serie" : "day streak")
                        : (language === "fr" ? "jours de serie" : "day streak")}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(streak, 7) }).map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: i * 0.1 }}
                      >
                        <Flame
                          className="w-4 h-4 text-orange-500"
                          data-testid={`icon-streak-flame-${i}`}
                        />
                      </motion.div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants} className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <Trophy className="w-5 h-5 text-green-500 mx-auto mb-2" />
                <p className="text-2xl font-bold" data-testid="text-total-mastered">{masteredCards}</p>
                <p className="text-xs text-muted-foreground">
                  {language === "fr" ? "Maitrisees" : "Mastered"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Target className="w-5 h-5 text-orange-500 mx-auto mb-2" />
                <p className="text-2xl font-bold" data-testid="text-total-due">{dueCards}</p>
                <p className="text-xs text-muted-foreground">{t.home.dueCards}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Calendar className="w-5 h-5 text-primary mx-auto mb-2" />
                <p className="text-2xl font-bold" data-testid="text-total-sessions">{totalSessions}</p>
                <p className="text-xs text-muted-foreground">{t.stats.totalSessions}</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  {language === "fr" ? "Maitrise globale" : "Overall Mastery"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground" data-testid="text-mastery-ratio">
                    {masteredCards}/{totalCards} {language === "fr" ? "cartes" : "cards"}
                  </span>
                  <span className="font-medium" data-testid="text-mastery-percent">{overallMastery}%</span>
                </div>
                <Progress value={overallMastery} className="h-3" data-testid="progress-overall-mastery" />
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-chart-2" />
                  {t.stats.byTheme}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {themeProgress.length > 0 ? (
                  themeProgress.map((theme) => {
                    const percent = theme.total > 0 ? Math.round((theme.mastered / theme.total) * 100) : 0;
                    const label = THEME_LABELS[theme.themeId]?.[language] || theme.themeId;
                    const colorClass = THEME_COLORS[theme.themeId] || "bg-primary";
                    return (
                      <div key={theme.themeId} className="space-y-1" data-testid={`theme-progress-${theme.themeId}`}>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium">{label}</span>
                          <span className="text-muted-foreground">
                            {theme.mastered}/{theme.total} ({percent}%)
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            className={`h-full ${colorClass} rounded-full`}
                            initial={{ width: 0 }}
                            animate={{ width: `${percent}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-theme-data">
                    {language === "fr"
                      ? "Commencez des sessions pour voir votre progression par theme"
                      : "Start sessions to see your progress by theme"}
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                  {t.stats.weakPoints}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {weakPoints.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {weakPoints.map((point) => (
                      <Badge
                        key={point.tag}
                        variant="secondary"
                        className="text-sm"
                        data-testid={`badge-weak-${point.tag}`}
                      >
                        {point.tag.replace(/_/g, " ")}
                        <span className="ml-1 text-muted-foreground">({point.count})</span>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-weak-points">
                    {language === "fr" ? "Aucun point faible detecte" : "No weak points detected"}
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-500" />
                  {language === "fr" ? "Badges" : "Achievements"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {ACHIEVEMENTS.map((achievement) => {
                    const unlocked = achievement.check(safeStats, safeProfile);
                    const Icon = achievement.icon;
                    const label = language === "fr" ? achievement.labelFr : achievement.labelEn;
                    return (
                      <div
                        key={achievement.id}
                        className={`flex items-center gap-3 p-3 rounded-md border transition-colors ${
                          unlocked
                            ? "bg-primary/5 border-primary/20"
                            : "bg-muted/30 border-transparent opacity-50"
                        }`}
                        data-testid={`badge-achievement-${achievement.id}`}
                      >
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                            unlocked ? "bg-primary/10" : "bg-muted"
                          }`}
                        >
                          {unlocked ? (
                            <Icon className="w-4 h-4 text-primary" />
                          ) : (
                            <Icon className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs font-medium truncate ${unlocked ? "" : "text-muted-foreground"}`}>
                            {label}
                          </p>
                          {unlocked && (
                            <CheckCircle2 className="w-3 h-3 text-green-500 mt-0.5" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card border-b p-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <Skeleton className="w-32 h-6" />
        </div>
      </div>
      <div className="p-6">
        <div className="max-w-lg mx-auto space-y-6">
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
          </div>
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
