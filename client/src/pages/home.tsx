import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { 
  Flame, 
  Target, 
  Trophy, 
  Clock, 
  ChevronRight, 
  Sparkles,
  TrendingUp,
  Brain,
  MessageSquare,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/lib/store";
import { getTranslations } from "@/lib/i18n";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const [, navigate] = useLocation();
  const { language, profileId, setCurrentSessionId, setSessionPhase } = useAppStore();
  const t = getTranslations(language);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/profiles", profileId],
    enabled: !!profileId,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/stats", profileId],
    enabled: !!profileId,
  });

  const startSession = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sessions", { profileId });
      return res.json();
    },
    onSuccess: (session) => {
      setCurrentSessionId(session.id);
      setSessionPhase("flashcards");
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      navigate("/session");
    },
  });

  const handleStartSession = () => {
    startSession.mutate();
  };

  if (profileLoading) {
    return <HomeSkeleton />;
  }

  const streak = profile?.streak || 0;
  const dueCards = stats?.dueCards || 0;
  const masteredCards = stats?.masteredCards || 0;
  const sessionDuration = profile?.dailySessionMinutes || 12;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <p className="text-muted-foreground">{t.home.welcomeBack}</p>
              <h1 className="text-2xl font-bold">{t.home.readyToTrain}</h1>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
            <CardContent className="p-6 relative">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Flame className="w-6 h-6" />
                  <span className="text-3xl font-bold">{streak}</span>
                  <span className="text-sm opacity-90">{t.home.days}</span>
                </div>
                <Badge variant="secondary" className="bg-white/20 text-white border-0">
                  {t.home.streak}
                </Badge>
              </div>
              <Button
                onClick={handleStartSession}
                disabled={startSession.isPending}
                className="w-full bg-white text-primary hover:bg-white/90 font-semibold"
                size="lg"
                data-testid="button-start-session"
              >
                {startSession.isPending ? (
                  t.common.loading
                ) : (
                  <>
                    {t.home.startSession}
                    <ChevronRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 gap-4 mb-6"
        >
          <StatCard
            icon={Target}
            label={t.home.dueCards}
            value={dueCards}
            color="text-orange-500"
            bgColor="bg-orange-500/10"
          />
          <StatCard
            icon={Trophy}
            label={t.home.masteredCards}
            value={masteredCards}
            color="text-green-500"
            bgColor="bg-green-500/10"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                {t.home.dailyProgress}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-primary" />
                    {t.session.flashcards}
                  </span>
                  <span className="text-muted-foreground">5 {t.home.minutes}</span>
                </div>
                <Progress value={42} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-accent" />
                    {t.session.roleplay}
                  </span>
                  <span className="text-muted-foreground">5 {t.home.minutes}</span>
                </div>
                <Progress value={0} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-chart-3" />
                    {t.session.debrief}
                  </span>
                  <span className="text-muted-foreground">2 {t.home.minutes}</span>
                </div>
                <Progress value={0} className="h-2" />
              </div>
              <div className="pt-2 border-t flex justify-between items-center">
                <span className="text-sm font-medium">{t.home.sessionDuration}</span>
                <Badge variant="secondary">{sessionDuration} {t.home.minutes}</Badge>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-6"
        >
          <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/stats")} data-testid="card-view-stats">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-chart-2/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-chart-2" />
                </div>
                <div>
                  <p className="font-medium">{t.stats.title}</p>
                  <p className="text-sm text-muted-foreground">{t.stats.overview}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bgColor,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
  bgColor: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`w-10 h-10 rounded-full ${bgColor} flex items-center justify-center mb-3`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function HomeSkeleton() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="w-12 h-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="w-24 h-4" />
            <Skeleton className="w-48 h-6" />
          </div>
        </div>
        <Skeleton className="w-full h-40 rounded-lg" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
        </div>
        <Skeleton className="w-full h-64 rounded-lg" />
      </div>
    </div>
  );
}
