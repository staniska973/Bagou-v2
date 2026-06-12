import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Flame,
  TrendingUp,
  Layers,
  Mic,
  LogOut,
  User as UserIcon,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import bagouIcon from "../assets/images/bagou-icon.png";

interface Stats {
  dueCards: number;
  masteredCards: number;
  totalCards: number;
  weakCards: number;
}

export default function Home() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();

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

  useEffect(() => {
    if (!profileLoading && !profile) navigate("/onboarding");
  }, [profileLoading, profile, navigate]);

  if (profileLoading || !profile) return <HomeSkeleton />;

  const streak = profile?.streak || 0;
  const dueCards = stats?.dueCards || 0;
  const masteredCards = stats?.masteredCards || 0;
  const totalCards = stats?.totalCards || 0;
  const hour = new Date().getHours();
  const greeting = hour < 6 ? "Bonne nuit" : hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

  return (
    <div className="min-h-dvh bg-gradient-to-br from-background via-background to-primary/5">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b px-4 py-2">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img src={bagouIcon} alt="Bagou" className="w-8 h-8 object-contain" data-testid="img-home-logo" />
            <div className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-bold" data-testid="text-streak">{streak}</span>
              <span className="text-xs text-muted-foreground">jour{streak > 1 ? "s" : ""}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => navigate("/stats")} data-testid="button-stats">
              <TrendingUp className="w-4 h-4" />
            </Button>
            <Avatar className="w-7 h-7 cursor-pointer" onClick={() => navigate("/stats")}>
              <AvatarImage src={user?.profileImageUrl || undefined} />
              <AvatarFallback><UserIcon className="w-3.5 h-3.5" /></AvatarFallback>
            </Avatar>
            <Button variant="ghost" size="icon" onClick={() => logout()} data-testid="button-logout">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-8 pb-6">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-greeting">
            {greeting}{user?.firstName ? `, ${user.firstName}` : ""}.
          </h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-due-summary">
            {dueCards > 0
              ? `${dueCards} situation${dueCards > 1 ? "s" : ""} à travailler aujourd'hui.`
              : "Tout est à jour. Entraîne-toi quand tu veux."}
          </p>
        </motion.div>

        <div className="mt-7 space-y-3">
          <ModeCard
            testId="card-mode-cartes"
            onClick={() => navigate("/cards")}
            icon={<Layers className="w-6 h-6" />}
            accent="primary"
            title="Cartes"
            subtitle="Entraîne ton réflexe à l'écrit. Tu formules, Bagou corrige."
            meta={dueCards > 0 ? `${dueCards} à revoir` : "Active recall"}
            delay={0.05}
          />
          <ModeCard
            testId="card-mode-vocal"
            onClick={() => navigate("/vocal")}
            icon={<Mic className="w-6 h-6" />}
            accent="accent"
            title="Vocal"
            subtitle="Une vraie conversation, à voix haute. 2 minutes, en situation."
            meta="Live · 2 min"
            delay={0.12}
          />
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-6">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <MiniStat label="À revoir" value={dueCards} />
            <MiniStat label="Maîtrisées" value={masteredCards} />
            <MiniStat label="Total" value={totalCards} />
          </div>
          <button
            onClick={() => navigate("/stats")}
            className="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors px-1 py-2"
            data-testid="link-progression"
          >
            <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Voir ma progression</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    </div>
  );
}

function ModeCard({ testId, onClick, icon, accent, title, subtitle, meta, delay }: {
  testId: string;
  onClick: () => void;
  icon: React.ReactNode;
  accent: "primary" | "accent";
  title: string;
  subtitle: string;
  meta: string;
  delay: number;
}) {
  const isAccent = accent === "accent";
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card
        className={`cursor-pointer hover-elevate active-elevate-2 overflow-hidden border-2 ${isAccent ? "border-accent/25" : "border-primary/25"}`}
        onClick={onClick}
        data-testid={testId}
      >
        <CardContent className="p-5 flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${isAccent ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"}`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">{title}</h2>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${isAccent ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"}`}>{meta}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{subtitle}</p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
        </CardContent>
      </Card>
    </motion.div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-2.5 text-center">
        <p className="text-xl font-bold">{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function HomeSkeleton() {
  return (
    <div className="min-h-dvh bg-background p-4">
      <div className="max-w-lg mx-auto space-y-4 pt-10">
        <Skeleton className="w-48 h-7" />
        <Skeleton className="w-64 h-4" />
        <div className="space-y-3 pt-4">
          <Skeleton className="w-full h-24 rounded-xl" />
          <Skeleton className="w-full h-24 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
