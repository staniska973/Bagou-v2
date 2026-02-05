import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  TrendingUp,
  Target,
  Trophy,
  Flame,
  Brain,
  MessageSquare,
  BarChart3,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/lib/store";
import { getTranslations } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

export default function Stats() {
  const [, navigate] = useLocation();
  const { language, profileId } = useAppStore();
  const t = getTranslations(language);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/stats", profileId],
    enabled: !!profileId,
  });

  const { data: profile } = useQuery({
    queryKey: ["/api/profiles", profileId],
    enabled: !!profileId,
  });

  if (isLoading) {
    return <StatsSkeleton />;
  }

  const themeProgress = [
    { theme: "SOCIAL", label: language === "fr" ? "Social" : "Social", progress: 45, color: "bg-chart-1" },
    { theme: "PRO", label: language === "fr" ? "Professionnel" : "Professional", progress: 62, color: "bg-chart-2" },
    { theme: "DAILY", label: language === "fr" ? "Quotidien" : "Daily", progress: 38, color: "bg-chart-3" },
    { theme: "RELATIONNEL", label: language === "fr" ? "Relationnel" : "Relationship", progress: 55, color: "bg-chart-4" },
    { theme: "DIFFICULT", label: language === "fr" ? "Difficile" : "Difficult", progress: 28, color: "bg-chart-5" },
  ];

  const skills = [
    { name: t.debrief.clarity, score: stats?.avgClarity || 72 },
    { name: t.debrief.frame, score: stats?.avgFrame || 68 },
    { name: t.debrief.tone, score: stats?.avgTone || 75 },
    { name: t.debrief.concision, score: stats?.avgConcision || 60 },
  ];

  const weakPoints = stats?.weakPoints || [
    { tag: "late_reply", count: 5 },
    { tag: "negotiation", count: 3 },
    { tag: "boundary", count: 2 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="bg-card border-b p-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back-home">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">{t.stats.title}</h1>
        </div>
      </div>

      <div className="p-6">
        <div className="max-w-lg mx-auto space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 gap-4"
          >
            <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0">
              <CardContent className="p-4">
                <Flame className="w-6 h-6 mb-2" />
                <p className="text-3xl font-bold">{profile?.streak || 0}</p>
                <p className="text-sm opacity-90">{t.home.streak}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <Calendar className="w-6 h-6 mb-2 text-chart-2" />
                <p className="text-3xl font-bold">{stats?.totalSessions || 0}</p>
                <p className="text-sm text-muted-foreground">{t.stats.totalSessions}</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-2 gap-4"
          >
            <Card>
              <CardContent className="p-4">
                <Target className="w-6 h-6 mb-2 text-orange-500" />
                <p className="text-3xl font-bold">{stats?.dueCards || 0}</p>
                <p className="text-sm text-muted-foreground">{t.home.dueCards}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <Trophy className="w-6 h-6 mb-2 text-green-500" />
                <p className="text-3xl font-bold">{stats?.masteredCards || 0}</p>
                <p className="text-sm text-muted-foreground">{t.home.masteredCards}</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  {t.debrief.scores}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {skills.map((skill) => (
                  <div key={skill.name} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{skill.name}</span>
                      <span className="font-medium">{skill.score}%</span>
                    </div>
                    <Progress value={skill.score} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-chart-2" />
                  {t.stats.byTheme}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {themeProgress.map((theme) => (
                  <div key={theme.theme} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{theme.label}</span>
                      <span className="font-medium">{theme.progress}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${theme.color} rounded-full transition-all duration-500`}
                        style={{ width: `${theme.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="w-4 h-4 text-orange-500" />
                  {t.stats.weakPoints}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {weakPoints.map((point: any) => (
                    <Badge key={point.tag} variant="secondary" className="text-sm">
                      {point.tag.replace(/_/g, " ")}
                      <span className="ml-1 text-muted-foreground">({point.count})</span>
                    </Badge>
                  ))}
                </div>
                {weakPoints.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {language === "fr" ? "Aucun point faible détecté" : "No weak points detected"}
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
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
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
          </div>
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
