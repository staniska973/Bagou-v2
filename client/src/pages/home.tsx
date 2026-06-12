import { useEffect, useMemo, useState } from "react";
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
  Route as RouteIcon,
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

interface Theme {
  id: string;
  label: string;
  subthemes: { id: string; label: string }[];
}

export default function Home() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [selectedSubtheme, setSelectedSubtheme] = useState<string | null>(null);

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

  const { data: themes } = useQuery<Theme[]>({
    queryKey: ["/api/themes"],
  });

  useEffect(() => {
    if (!profileLoading && !profile) navigate("/onboarding");
  }, [profileLoading, profile, navigate]);

  const orderedThemes = useMemo(() => {
    if (!themes) return [];
    const objectives: string[] = profile?.objectives || [];
    const rank = (id: string) => {
      const i = objectives.indexOf(id);
      return i === -1 ? 999 : i;
    };
    return [...themes].sort((a, b) => rank(a.id) - rank(b.id));
  }, [themes, profile?.objectives]);

  if (profileLoading || !profile) return <HomeSkeleton />;

  const streak = profile?.streak || 0;
  const dueCards = stats?.dueCards || 0;
  const masteredCards = stats?.masteredCards || 0;
  const totalCards = stats?.totalCards || 0;
  const hour = new Date().getHours();
  const greeting = hour < 6 ? "Bonne nuit" : hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

  const activeTheme = selectedTheme ? orderedThemes.find((t) => t.id === selectedTheme) ?? null : null;
  const activeSubtheme = activeTheme?.subthemes.find((s) => s.id === selectedSubtheme) || null;

  const themeQuery = (() => {
    if (!selectedTheme) return "";
    const params = new URLSearchParams();
    params.set("themeId", selectedTheme);
    if (selectedSubtheme) params.set("subthemeId", selectedSubtheme);
    return `?${params.toString()}`;
  })();
  const selectedLabel = activeSubtheme
    ? `${activeTheme?.label} · ${activeSubtheme.label}`
    : activeTheme?.label ?? null;

  const selectTheme = (id: string | null) => {
    setSelectedTheme(id);
    setSelectedSubtheme(null);
  };

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

      <div className="max-w-lg mx-auto px-4 pt-8 pb-10">
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

        {/* Theme selection */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mt-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5 ml-0.5">
            Choisis ton terrain
          </p>
          <div className="flex flex-wrap gap-2" data-testid="group-themes">
            <ThemeChip
              label="Tout"
              active={selectedTheme === null}
              onClick={() => selectTheme(null)}
              testId="chip-theme-all"
            />
            {orderedThemes.map((t) => (
              <ThemeChip
                key={t.id}
                label={t.label}
                active={selectedTheme === t.id}
                onClick={() => selectTheme(t.id)}
                testId={`chip-theme-${t.id}`}
              />
            ))}
          </div>

          {activeTheme && activeTheme.subthemes.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3"
            >
              <p className="text-[11px] text-muted-foreground mb-2 ml-0.5">
                Précise (optionnel)
              </p>
              <div className="flex flex-wrap gap-2" data-testid="group-subthemes">
                <ThemeChip
                  label="Tout le thème"
                  active={selectedSubtheme === null}
                  onClick={() => setSelectedSubtheme(null)}
                  testId="chip-subtheme-all"
                />
                {activeTheme.subthemes.map((s) => (
                  <ThemeChip
                    key={s.id}
                    label={s.label}
                    active={selectedSubtheme === s.id}
                    onClick={() => setSelectedSubtheme(s.id)}
                    testId={`chip-subtheme-${s.id}`}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Primary CTA: Parcours */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-5">
          <Card
            className="cursor-pointer hover-elevate active-elevate-2 overflow-hidden border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-card to-accent/10"
            onClick={() => navigate(`/parcours${themeQuery}`)}
            data-testid="card-parcours"
          >
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <RouteIcon className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold">Parcours du jour</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                    {selectedLabel ? `Thème : ${selectedLabel}. ` : ""}Écrit, puis oral, puis ton débrief complet.
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
              </div>
              <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> Écrit</span>
                <ChevronRight className="w-3 h-3" />
                <span className="flex items-center gap-1"><Mic className="w-3 h-3" /> Oral</span>
                <ChevronRight className="w-3 h-3" />
                <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> Débrief</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Modes libres */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.16 }} className="mt-3">
          <p className="text-[11px] text-muted-foreground mb-2 ml-0.5">Ou entraîne-toi librement</p>
          <div className="grid grid-cols-2 gap-2">
            <FreeMode
              testId="button-mode-cartes"
              onClick={() => navigate(`/cards${themeQuery}`)}
              icon={<Layers className="w-4 h-4" />}
              title="Cartes"
              subtitle="Écrit seul"
            />
            <FreeMode
              testId="button-mode-vocal"
              onClick={() => navigate(`/vocal${themeQuery}`)}
              icon={<Mic className="w-4 h-4" />}
              title="Vocal"
              subtitle="Oral seul"
            />
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.22 }} className="mt-6">
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

function ThemeChip({ label, active, onClick, testId }: { label: string; active: boolean; onClick: () => void; testId: string }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors hover-elevate active-elevate-2 ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-foreground border-border"
      }`}
    >
      {label}
    </button>
  );
}

function FreeMode({ testId, onClick, icon, title, subtitle }: {
  testId: string;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Card className="cursor-pointer hover-elevate active-elevate-2" onClick={onClick} data-testid={testId}>
      <CardContent className="p-3.5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-none">{title}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
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
