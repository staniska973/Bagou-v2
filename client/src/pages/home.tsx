import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { 
  Flame, 
  Target, 
  Trophy, 
  ChevronRight, 
  TrendingUp,
  Brain,
  MessageSquare,
  LogOut,
  User as UserIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function Home() {
  const [, navigate] = useLocation();
  const { language } = useAppStore();
  const { user, logout } = useAuth();
  const t = getTranslations(language);

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

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/stats", profile?.id],
    enabled: !!profile?.id,
  });

  const startSession = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sessions", { profileId: profile.id });
      return res.json();
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      navigate(`/session?sessionId=${session.id}&profileId=${profile.id}`);
    },
  });

  if (profileLoading) {
    return <HomeSkeleton />;
  }

  if (!profile) {
    navigate("/onboarding");
    return null;
  }

  const streak = profile?.streak || 0;
  const dueCards = stats?.dueCards || 0;
  const masteredCards = stats?.masteredCards || 0;
  const totalCards = stats?.totalCards || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <img src={bagouIcon} alt="Bagou" className="w-10 h-10 object-contain" data-testid="img-home-logo" />
              <div>
                <p className="text-muted-foreground text-sm" data-testid="text-welcome">{t.home.welcomeBack}{user?.firstName ? `, ${user.firstName}` : ""}</p>
                <h1 className="text-xl font-bold" data-testid="text-ready">{t.home.readyToTrain}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Avatar className="w-8 h-8">
                <AvatarImage src={user?.profileImageUrl || undefined} />
                <AvatarFallback>
                  <UserIcon className="w-4 h-4" />
                </AvatarFallback>
              </Avatar>
              <Button variant="ghost" size="icon" onClick={() => logout()} data-testid="button-logout">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0 relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
            <CardContent className="p-6 relative">
              <div className="flex items-center justify-between gap-4 mb-4">
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
                onClick={() => startSession.mutate()}
                disabled={startSession.isPending}
                className="w-full bg-white text-primary font-semibold"
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
          className="grid grid-cols-3 gap-3 mb-6"
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
          <StatCard
            icon={Brain}
            label="Total"
            value={totalCards}
            color="text-primary"
            bgColor="bg-primary/10"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-2 gap-3"
        >
          <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/session?mode=flashcards")} data-testid="card-flashcards">
            <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-primary" />
              </div>
              <p className="font-medium text-sm">{t.session.flashcards}</p>
              <Badge variant="secondary" className="text-xs">{dueCards} {t.home.dueCards.toLowerCase()}</Badge>
            </CardContent>
          </Card>
          <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/roleplay")} data-testid="card-roleplay">
            <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-accent" />
              </div>
              <p className="font-medium text-sm">{t.session.roleplay}</p>
              <Badge variant="secondary" className="text-xs">Explorer</Badge>
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
            <CardContent className="p-4 flex items-center justify-between gap-3">
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
      <CardContent className="p-3 text-center">
        <div className={`w-8 h-8 rounded-full ${bgColor} flex items-center justify-center mx-auto mb-2`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
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
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
