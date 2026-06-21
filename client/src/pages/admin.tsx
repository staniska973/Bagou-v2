import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Settings,
  Users,
  LayoutDashboard,
  Library,
  Sparkles,
  Brain,
  CreditCard,
  RefreshCw,
  Trash2,
  Shield,
  Search,
  Zap,
  ArrowLeft,
  Pencil,
  Bot,
  Save,
  LogOut,
  Eye,
  Plus,
  ChevronDown,
  ChevronUp,
  Menu,
  X,
  TrendingUp,
  Volume2,
  Timer,
  Crown,
  Flame,
  UserCheck,
  MessageCircle,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Layers,
  Gift,
  Clock,
  History,
  Infinity as InfinityIcon,
} from "lucide-react";
import { useLocation } from "wouter";
import type { MotherCard, User } from "@shared/schema";

type Section = "overview" | "clients" | "ai" | "cards" | "generate";

interface ThemeConfig {
  id: string;
  label: string;
  subthemes: { id: string; label: string }[];
}

interface AdminStats {
  totalUsers: number;
  newUsersThisMonth: number;
  totalCards: number;
  sessionsThisWeek: number;
  subscriptions: { none: number; trial: number; active: number; expired: number };
  recentUsers: { id: string; name: string; email: string | null; subscriptionStatus: string; createdAt: Date | null }[];
}

interface AdminSettings {
  scoring_model: string;
  generation_model: string;
  bagou_system_extra: string;
  dialogue_turns: number;
  tts_model: string;
  tts_voice: string;
  response_timer_seconds: number;
}

type ClientTier = "free" | "trial" | "premium";
type ClientSource = "none" | "admin" | "stripe";

interface AdminClient {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  isAdmin: boolean;
  createdAt: string | null;
  tier: ClientTier;
  source: ClientSource;
  planLabel: string;
  interval: "month" | "year" | null;
  renewalOrTrialEnd: string | null;
  overrideStatus: string;
  overrideExpiresAt: string | null;
  activity: { cards: number; vocal: number; sessions: number; lastActiveAt: string | null };
}

interface AdminClientKpis {
  totalUsers: number;
  activeSubscribers: number;
  trials: number;
  freeUsers: number;
  compOverrides: number;
  premiumMonthly: number;
  premiumYearly: number;
  mrrCents: number;
}

interface SubscriptionHistoryEntry {
  id: string;
  status: string;
  interval: "month" | "year" | null;
  unitAmount: number | null;
  currency: string | null;
  created: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  endedAt: string | null;
  productName: string | null;
}

interface UsageDayPoint {
  day: string;
  cards: number;
  vocal: number;
}

interface ClientDetail {
  client: AdminClient;
  usageByDay: UsageDayPoint[];
  subscriptionHistory: SubscriptionHistoryEntry[];
}

const eurFormatter = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
function formatEur(cents: number | null | undefined): string {
  return eurFormatter.format((cents ?? 0) / 100);
}
function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString("fr-FR") : "—";
}

export default function Admin() {
  const { data: authCheck, isLoading: authLoading } = useQuery<{ ok: boolean }>({
    queryKey: ["/api/admin/check"],
    retry: false,
  });

  if (authLoading) return <AdminSkeleton />;
  if (!authCheck?.ok) {
    return <AdminLogin onLogin={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/check"] })} />;
  }
  return <AdminDashboard />;
}

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { toast } = useToast();

  const login = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Identifiants incorrects");
      return data;
    },
    onSuccess: () => onLogin(),
    onError: (error: Error) => {
      toast({ title: "Accès refusé", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "#f0f4f8" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-xl"
            style={{ backgroundColor: "#1B2A4A" }}
          >
            B
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#1B2A4A" }}>Bagou Admin</h1>
            <p className="text-sm text-gray-500">Portail d'administration</p>
          </div>
        </div>
        <Card className="shadow-xl border-0">
          <CardContent className="p-6">
            <form
              onSubmit={(e) => { e.preventDefault(); login.mutate(); }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="admin-username" className="text-sm font-medium">Identifiant</Label>
                <Input
                  id="admin-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  className="h-11"
                  data-testid="input-admin-username"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-password" className="text-sm font-medium">Mot de passe</Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-11"
                  data-testid="input-admin-password"
                />
              </div>
              {login.isError && (
                <p className="text-sm text-red-500 flex items-center gap-1.5" data-testid="text-login-error">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  Identifiants incorrects
                </p>
              )}
              <Button
                type="submit"
                className="w-full h-11 text-white"
                style={{ backgroundColor: "#1B2A4A" }}
                disabled={login.isPending || !username || !password}
                data-testid="button-admin-login"
              >
                {login.isPending ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Connexion...</>
                ) : (
                  "Se connecter"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Vue d'ensemble", icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: "clients", label: "Clients", icon: <Users className="w-5 h-5" /> },
  { id: "ai", label: "Modèle IA", icon: <Brain className="w-5 h-5" /> },
  { id: "cards", label: "Cartes", icon: <Library className="w-5 h-5" /> },
  { id: "generate", label: "Générer", icon: <Sparkles className="w-5 h-5" /> },
];

function AdminDashboard() {
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const logout = useMutation({
    mutationFn: async () => { await apiRequest("POST", "/api/admin/logout"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/check"] }); },
    onError: (error: Error) => { toast({ title: "Erreur", description: error.message, variant: "destructive" }); },
  });

  const SECTION_TITLES: Record<Section, string> = {
    overview: "Vue d'ensemble",
    clients: "Clients",
    ai: "Modèle IA & Voix",
    cards: "Cartes",
    generate: "Générer des cartes",
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:relative z-30 flex flex-col h-full w-64 flex-shrink-0 transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        style={{ backgroundColor: "#1B2A4A" }}
      >
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            B
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-tight">Bagou Admin</p>
            <p className="text-white/50 text-xs">Tableau de bord</p>
          </div>
          <button
            className="ml-auto text-white/50 hover:text-white lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveSection(item.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                activeSection === item.id
                  ? "bg-white/15 text-white"
                  : "text-white/60 hover:bg-white/8 hover:text-white/90"
              }`}
              data-testid={`nav-${item.id}`}
            >
              <span className={activeSection === item.id ? "text-white" : "text-white/50"}>
                {item.icon}
              </span>
              {item.label}
              {activeSection === item.id && (
                <ChevronRight className="w-4 h-4 ml-auto text-white/50" />
              )}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-white/10 space-y-1">
          <button
            onClick={() => navigate("/")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:bg-white/8 hover:text-white/90 transition-all text-left"
            data-testid="button-back-home"
          >
            <ArrowLeft className="w-5 h-5 text-white/50" />
            Retour app
          </button>
          <button
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:bg-white/8 hover:text-white/90 transition-all text-left"
            data-testid="button-logout"
          >
            <LogOut className="w-5 h-5 text-white/50" />
            Déconnexion
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex-shrink-0 border-b bg-background/95 backdrop-blur px-6 py-4 flex items-center gap-4">
          <button
            className="lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
            data-testid="button-open-sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-admin-title">
              {SECTION_TITLES[activeSection]}
            </h1>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto">
            {activeSection === "overview" && <OverviewSection />}
            {activeSection === "clients" && <ClientsSection />}
            {activeSection === "ai" && <AISettingsSection />}
            {activeSection === "cards" && <CardsSection />}
            {activeSection === "generate" && <GenerateSection />}
          </div>
        </main>
      </div>
    </div>
  );
}

function StatCard({
  title, value, sub, icon, color,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <p className="text-3xl font-bold mt-1" data-testid={`stat-${title.toLowerCase().replace(/\s/g, "-")}`}>
              {value}
            </p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SubBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: "Premium", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
    trial: { label: "Essai", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
    expired: { label: "Expiré", className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30" },
    none: { label: "Gratuit", className: "bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30" },
  };
  const s = map[status] || map["none"];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${s.className}`}>
      {s.label}
    </span>
  );
}

function OverviewSection() {
  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
  });
  const { data: kpis } = useQuery<AdminClientKpis>({ queryKey: ["/api/admin/kpis"] });

  const { data: themes } = useQuery<ThemeConfig[]>({ queryKey: ["/api/admin/themes"] });
  const { data: allCards } = useQuery<MotherCard[]>({ queryKey: ["/api/mother-cards"] });

  const cardsPerTheme = allCards
    ? allCards.reduce<Record<string, number>>((acc, card) => {
        acc[card.themeId] = (acc[card.themeId] || 0) + 1;
        return acc;
      }, {})
    : {};

  const totalSubs = kpis ? Math.max(kpis.totalUsers, 1) : 1;

  const subBreakdown = kpis ? [
    { label: "Payant", count: kpis.activeSubscribers, color: "#10b981", pct: Math.round(kpis.activeSubscribers / totalSubs * 100) },
    { label: "Offert", count: kpis.compOverrides, color: "#8b5cf6", pct: Math.round(kpis.compOverrides / totalSubs * 100) },
    { label: "Essai", count: kpis.trials, color: "#3b82f6", pct: Math.round(kpis.trials / totalSubs * 100) },
    { label: "Gratuit", count: kpis.freeUsers, color: "#94a3b8", pct: Math.round(kpis.freeUsers / totalSubs * 100) },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <StatCard
              title="Utilisateurs"
              value={stats?.totalUsers ?? 0}
              sub={`+${stats?.newUsersThisMonth ?? 0} ce mois`}
              icon={<Users className="w-5 h-5 text-blue-600" />}
              color="bg-blue-500/10"
            />
            <StatCard
              title="Abonnés actifs"
              value={kpis?.activeSubscribers ?? 0}
              sub={`${kpis?.trials ?? 0} essai · MRR ${formatEur(kpis?.mrrCents)}`}
              icon={<Crown className="w-5 h-5 text-emerald-600" />}
              color="bg-emerald-500/10"
            />
            <StatCard
              title="Total cartes"
              value={stats?.totalCards ?? 0}
              sub={`${themes?.length ?? 0} thèmes`}
              icon={<Library className="w-5 h-5 text-purple-600" />}
              color="bg-purple-500/10"
            />
            <StatCard
              title="Sessions (7j)"
              value={stats?.sessionsThisWeek ?? 0}
              sub="derniers 7 jours"
              icon={<TrendingUp className="w-5 h-5 text-orange-600" />}
              color="bg-orange-500/10"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              Répartition abonnements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!kpis ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
            ) : (
              subBreakdown.map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="text-sm w-16 text-muted-foreground">{item.label}</span>
                  <div className="flex-1 bg-muted rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${item.pct}%`, backgroundColor: item.color }}
                    />
                  </div>
                  <span className="text-sm font-medium w-6 text-right">{item.count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Layers className="w-4 h-4 text-muted-foreground" />
              Cartes par thème
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!allCards || !themes ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>
            ) : (
              themes.map((theme) => (
                <div key={theme.id} className="flex items-center justify-between gap-2" data-testid={`row-theme-${theme.id}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="text-[10px] shrink-0">{theme.id}</Badge>
                    <span className="text-sm truncate text-muted-foreground">{theme.label}</span>
                  </div>
                  <span className="text-sm font-semibold shrink-0" data-testid={`text-theme-count-${theme.id}`}>
                    {cardsPerTheme[theme.id] || 0}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-muted-foreground" />
            Inscrits récents
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : stats?.recentUsers && stats.recentUsers.length > 0 ? (
            <div className="space-y-2">
              {stats.recentUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-3 py-1.5">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">
                      {u.name?.charAt(0)?.toUpperCase() || "?"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name || "Anonyme"}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email || "—"}</p>
                  </div>
                  <SubBadge status={u.subscriptionStatus || "none"} />
                  <span className="text-xs text-muted-foreground shrink-0">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString("fr-FR") : "—"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">Aucun utilisateur inscrit</p>
          )}
        </CardContent>
      </Card>

      <AvatarCleanupCard />
    </div>
  );
}

type AvatarReconcileResult = {
  scanned: number;
  live: number;
  orphans: number;
  removed: number;
  dryRun?: boolean;
};

function AvatarCleanupCard() {
  const { toast } = useToast();
  const [result, setResult] = useState<AvatarReconcileResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const reconcile = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const res = await apiRequest("POST", "/api/admin/avatars/reconcile", { dryRun });
      return (await res.json()) as AvatarReconcileResult;
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.dryRun) {
        toast({
          title: "Aperçu terminé",
          description:
            data.orphans > 0
              ? `${data.orphans} photo(s) orpheline(s) seraient supprimée(s).`
              : "Aucune photo orpheline détectée.",
        });
      } else {
        toast({
          title: "Nettoyage terminé",
          description:
            data.removed > 0
              ? `${data.removed} photo(s) orpheline(s) supprimée(s).`
              : "Aucune photo orpheline à supprimer.",
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Échec du nettoyage",
        description: err?.message || "Impossible de nettoyer les photos. Réessayez.",
        variant: "destructive",
      });
    },
  });

  const previewResult = result?.dryRun ? result : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-muted-foreground" />
          Nettoyage des photos de profil
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Supprime les photos de profil stockées qui ne sont plus rattachées à aucun
          utilisateur (laissées par une panne de stockage, par exemple). Lancé automatiquement
          chaque jour — utilisez ce bouton pour forcer un passage immédiat.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => reconcile.mutate(true)}
            disabled={reconcile.isPending}
            data-testid="button-avatar-preview"
          >
            {reconcile.isPending && reconcile.variables === true ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Analyse en cours...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Aperçu (sans suppression)
              </>
            )}
          </Button>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={reconcile.isPending}
                data-testid="button-avatar-cleanup"
              >
                {reconcile.isPending && reconcile.variables === false ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Nettoyage en cours...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Nettoyer les photos orphelines
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent data-testid="dialog-avatar-cleanup-confirm">
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer les photos orphelines ?</AlertDialogTitle>
                <AlertDialogDescription>
                  {previewResult
                    ? `D'après le dernier aperçu, ${previewResult.orphans} photo(s) orpheline(s) seraient supprimée(s) définitivement. Cette action est irréversible.`
                    : "Cette action supprime définitivement les photos de profil orphelines. Elle est irréversible. Lancez d'abord un aperçu pour vérifier le nombre de photos concernées."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-avatar-cleanup-cancel">
                  Annuler
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => reconcile.mutate(false)}
                  data-testid="button-avatar-cleanup-confirm"
                >
                  Supprimer définitivement
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {result && (
          <div className="space-y-2" data-testid="avatar-cleanup-result">
            {result.dryRun && (
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400" data-testid="text-avatar-dryrun-notice">
                Aperçu — aucune photo n'a été supprimée.
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Analysées</p>
                <p className="text-lg font-semibold" data-testid="text-avatar-scanned">{result.scanned}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Actives</p>
                <p className="text-lg font-semibold" data-testid="text-avatar-live">{result.live}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Orphelines</p>
                <p className="text-lg font-semibold" data-testid="text-avatar-orphans">{result.orphans}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  {result.dryRun ? "À supprimer" : "Supprimées"}
                </p>
                <p className="text-lg font-semibold text-emerald-600" data-testid="text-avatar-removed">{result.removed}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClientPlanBadge({ client }: { client: AdminClient }) {
  const { tier, source, planLabel } = client;
  let className = "bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30";
  let icon: React.ReactNode = null;
  if (tier === "premium" && source === "stripe") {
    className = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
    icon = <Crown className="w-3 h-3 mr-1" />;
  } else if (tier === "premium" && source === "admin") {
    className = "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/50 border-dashed";
    icon = <Gift className="w-3 h-3 mr-1" />;
  } else if (tier === "trial" && source === "admin") {
    className = "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/50 border-dashed";
    icon = <Gift className="w-3 h-3 mr-1" />;
  } else if (tier === "trial") {
    className = "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";
    icon = <Calendar className="w-3 h-3 mr-1" />;
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${className}`}
      data-testid={`badge-plan-${client.id}`}
    >
      {icon}
      {planLabel}
    </span>
  );
}

function echeanceLabel(client: AdminClient): { label: string; value: React.ReactNode } {
  if (client.tier === "premium" && client.source === "admin") {
    return {
      label: "Offert",
      value: client.renewalOrTrialEnd ? (
        `jusqu'au ${formatDate(client.renewalOrTrialEnd)}`
      ) : (
        <span className="inline-flex items-center gap-1"><InfinityIcon className="w-3.5 h-3.5" />permanent</span>
      ),
    };
  }
  if (client.tier === "premium") return { label: "Renouvellement", value: formatDate(client.renewalOrTrialEnd) };
  if (client.tier === "trial") return { label: "Fin d'essai", value: formatDate(client.renewalOrTrialEnd) };
  return { label: "", value: "—" };
}

const STRIPE_STATUS_FR: Record<string, { label: string; className: string }> = {
  active: { label: "Actif", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  trialing: { label: "Essai", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  past_due: { label: "Impayé", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  canceled: { label: "Annulé", className: "bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30" },
  incomplete: { label: "Incomplet", className: "bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30" },
  incomplete_expired: { label: "Expiré", className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30" },
  unpaid: { label: "Non payé", className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30" },
};

function StripeStatusTag({ status }: { status: string }) {
  const s = STRIPE_STATUS_FR[status] || { label: status, className: "bg-gray-500/15 text-gray-600 border-gray-500/30" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${s.className}`}>
      {s.label}
    </span>
  );
}

function UsageBars({ data }: { data: UsageDayPoint[] }) {
  if (!data.length) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Aucune activité sur les 30 derniers jours.</p>;
  }
  const max = Math.max(...data.map((d) => d.cards + d.vocal), 1);
  return (
    <div>
      <div className="flex items-end gap-1 h-24">
        {data.map((d) => (
          <div
            key={d.day}
            className="flex-1 flex flex-col justify-end items-center min-w-[3px]"
            title={`${formatDate(d.day)} — ${d.cards} carte(s), ${d.vocal} vocal`}
            data-testid={`bar-usage-${d.day}`}
          >
            <div className="w-full rounded-t-sm bg-blue-500/70" style={{ height: `${(d.vocal / max) * 100}%` }} />
            <div className="w-full rounded-b-sm bg-emerald-500/70" style={{ height: `${(d.cards / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/70" />Cartes</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500/70" />Vocal</span>
      </div>
    </div>
  );
}

function ConfirmAction({
  trigger, title, description, confirmLabel, onConfirm, destructive, testId,
}: {
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
  testId?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-action">Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            data-testid={testId}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ClientActivityInline({ activity }: { activity: AdminClient["activity"] }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1" title="Cartes travaillées"><Library className="w-3.5 h-3.5" />{activity.cards}</span>
      <span className="inline-flex items-center gap-1" title="Sessions vocales"><Volume2 className="w-3.5 h-3.5" />{activity.vocal}</span>
      <span className="inline-flex items-center gap-1" title="Sessions"><MessageCircle className="w-3.5 h-3.5" />{activity.sessions}</span>
    </div>
  );
}

function ClientsSection() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | "premium" | "comp" | "trial" | "free">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grantExpiry, setGrantExpiry] = useState("");
  const [trialDays, setTrialDays] = useState("14");

  const { data: clients, isLoading } = useQuery<AdminClient[]>({ queryKey: ["/api/admin/clients"] });
  const { data: kpis } = useQuery<AdminClientKpis>({ queryKey: ["/api/admin/kpis"] });
  const { data: detail, isLoading: detailLoading } = useQuery<ClientDetail>({
    queryKey: ["/api/admin/clients", selectedId],
    enabled: !!selectedId,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/kpis"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
  };
  const onErr = (error: Error) => toast({ title: "Erreur", description: error.message, variant: "destructive" });

  const grantPremium = useMutation({
    mutationFn: async ({ userId, expiresAt }: { userId: string; expiresAt: string | null }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/grant-premium`, { expiresAt });
      return res.json();
    },
    onSuccess: () => { invalidateAll(); setGrantExpiry(""); toast({ title: "Accès Premium offert" }); },
    onError: onErr,
  });
  const revokePremium = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/revoke-premium`);
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Accès offert révoqué" }); },
    onError: onErr,
  });
  const extendTrial = useMutation({
    mutationFn: async ({ userId, days }: { userId: string; days: number }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/extend-trial`, { days });
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Essai accordé" }); },
    onError: onErr,
  });
  const toggleAdmin = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/admin`, { isAdmin });
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Rôle administrateur modifié" }); },
    onError: onErr,
  });
  const deleteClient = useMutation({
    mutationFn: async (userId: string) => { await apiRequest("DELETE", `/api/admin/users/${userId}`); },
    onSuccess: () => { invalidateAll(); setSelectedId(null); toast({ title: "Client supprimé" }); },
    onError: onErr,
  });

  const filtered = clients?.filter((c) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      `${c.firstName ?? ""} ${c.lastName ?? ""}`.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q);
    let matchesTier = true;
    if (tierFilter === "premium") matchesTier = c.tier === "premium" && c.source === "stripe";
    else if (tierFilter === "comp") matchesTier = c.tier === "premium" && c.source === "admin";
    else if (tierFilter === "trial") matchesTier = c.tier === "trial";
    else if (tierFilter === "free") matchesTier = c.tier === "free";
    return matchesSearch && matchesTier;
  });

  const client = detail?.client;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Revenu mensuel (MRR)"
          value={formatEur(kpis?.mrrCents)}
          sub="récurrent, hors offerts"
          icon={<CreditCard className="w-5 h-5 text-emerald-600" />}
          color="bg-emerald-500/10"
        />
        <StatCard
          title="Abonnés actifs"
          value={kpis?.activeSubscribers ?? 0}
          sub={`${kpis?.premiumMonthly ?? 0} mensuel · ${kpis?.premiumYearly ?? 0} annuel`}
          icon={<Crown className="w-5 h-5 text-amber-600" />}
          color="bg-amber-500/10"
        />
        <StatCard
          title="Essais en cours"
          value={kpis?.trials ?? 0}
          sub={`${kpis?.compOverrides ?? 0} Premium offert(s)`}
          icon={<Calendar className="w-5 h-5 text-blue-600" />}
          color="bg-blue-500/10"
        />
        <StatCard
          title="Utilisateurs gratuits"
          value={kpis?.freeUsers ?? 0}
          sub={`${kpis?.totalUsers ?? 0} clients au total`}
          icon={<Users className="w-5 h-5 text-slate-600" />}
          color="bg-slate-500/10"
        />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-clients"
          />
        </div>
        <Select value={tierFilter} onValueChange={(v) => setTierFilter(v as typeof tierFilter)}>
          <SelectTrigger className="w-full sm:w-52" data-testid="select-tier-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les offres</SelectItem>
            <SelectItem value="premium">Premium payant</SelectItem>
            <SelectItem value="comp">Premium offert</SelectItem>
            <SelectItem value="trial">En essai</SelectItem>
            <SelectItem value="free">Gratuit</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-xs whitespace-nowrap" data-testid="text-client-count">
          {filtered?.length ?? 0} client{(filtered?.length ?? 0) > 1 ? "s" : ""}
        </Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-[230px]">Client</TableHead>
                  <TableHead>Offre</TableHead>
                  <TableHead className="hidden md:table-cell">Échéance</TableHead>
                  <TableHead className="hidden lg:table-cell">Activité</TableHead>
                  <TableHead className="hidden sm:table-cell">Inscrit le</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered && filtered.length > 0 ? (
                  filtered.map((c) => {
                    const ech = echeanceLabel(c);
                    return (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setSelectedId(c.id)}
                        data-testid={`row-client-${c.id}`}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#1B2A4A15" }}>
                              <span className="text-xs font-bold" style={{ color: "#1B2A4A" }}>
                                {(c.firstName || c.email || "?").charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate flex items-center gap-1.5">
                                {`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "Anonyme"}
                                {c.isAdmin && <Shield className="w-3 h-3 text-amber-600 flex-shrink-0" />}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">{c.email || "—"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><ClientPlanBadge client={c} /></TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {ech.label ? (
                            <div>
                              <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">{ech.label}</span>
                              <p className="text-sm text-foreground">{ech.value}</p>
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <ClientActivityInline activity={c.activity} />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                          {formatDate(c.createdAt)}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                      {search || tierFilter !== "all" ? "Aucun client ne correspond à ces critères" : "Aucun client"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!selectedId}
        onOpenChange={(open) => { if (!open) { setSelectedId(null); setGrantExpiry(""); setTrialDays("14"); } }}
      >
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          {detailLoading || !client ? (
            <div className="space-y-4 py-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <span data-testid="text-detail-name">{`${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "Anonyme"}</span>
                  <ClientPlanBadge client={client} />
                  {client.isAdmin && (
                    <Badge className="text-[11px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                      <Shield className="w-3 h-3 mr-1" />Admin
                    </Badge>
                  )}
                </DialogTitle>
                <p className="text-sm text-muted-foreground">{client.email || "—"}</p>
              </DialogHeader>

              <div className="space-y-5 py-1">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Cartes</p>
                    <p className="text-lg font-bold" data-testid="text-detail-cards">{client.activity.cards}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Vocal</p>
                    <p className="text-lg font-bold" data-testid="text-detail-vocal">{client.activity.vocal}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sessions</p>
                    <p className="text-lg font-bold" data-testid="text-detail-sessions">{client.activity.sessions}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Inscrit le</p>
                    <p className="text-sm font-semibold mt-1">{formatDate(client.createdAt)}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                    Activité (30 derniers jours)
                  </h3>
                  <UsageBars data={detail.usageByDay} />
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <History className="w-4 h-4 text-muted-foreground" />
                    Historique d'abonnement
                  </h3>
                  <div className="space-y-2">
                    {detail.subscriptionHistory.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Aucun historique d'abonnement Stripe.
                        {client.source === "admin" && " Cet accès est un avantage offert manuellement."}
                      </p>
                    ) : (
                      detail.subscriptionHistory.map((s) => (
                        <div key={s.id} className="rounded-lg border p-3" data-testid={`row-sub-history-${s.id}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <StripeStatusTag status={s.status} />
                            <span className="text-sm font-medium">
                              {s.interval === "month" ? "Mensuel" : s.interval === "year" ? "Annuel" : "—"}
                            </span>
                            {s.unitAmount != null && (
                              <span className="text-sm text-muted-foreground">
                                {formatEur(s.unitAmount)}{s.interval === "month" ? "/mois" : s.interval === "year" ? "/an" : ""}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Depuis {formatDate(s.created)} · échéance {formatDate(s.currentPeriodEnd)}
                            {s.cancelAtPeriodEnd ? " · annulation programmée" : ""}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Gift className="w-4 h-4 text-violet-600" />
                    Accès complémentaire (offert)
                  </h3>
                  <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="space-y-1.5 flex-1">
                      <Label htmlFor="grant-expiry" className="text-xs">Expiration (vide = permanent)</Label>
                      <Input
                        id="grant-expiry"
                        type="date"
                        value={grantExpiry}
                        onChange={(e) => setGrantExpiry(e.target.value)}
                        data-testid="input-grant-expiry"
                      />
                    </div>
                    <ConfirmAction
                      testId="button-confirm-grant"
                      title="Offrir un accès Premium ?"
                      description={
                        grantExpiry
                          ? `${client.firstName ?? "Ce client"} bénéficiera d'un accès Premium offert jusqu'au ${formatDate(grantExpiry)}.`
                          : `${client.firstName ?? "Ce client"} bénéficiera d'un accès Premium offert sans expiration (permanent).`
                      }
                      confirmLabel="Offrir Premium"
                      onConfirm={() => grantPremium.mutate({ userId: client.id, expiresAt: grantExpiry || null })}
                      trigger={
                        <Button variant="outline" className="border-violet-500/40 text-violet-700 dark:text-violet-400" data-testid="button-grant-premium">
                          <Gift className="w-4 h-4 mr-2" />Offrir Premium
                        </Button>
                      }
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="space-y-1.5 w-full sm:w-40">
                      <Label htmlFor="trial-days" className="text-xs">Durée d'essai (jours)</Label>
                      <Input
                        id="trial-days"
                        type="number"
                        min={1}
                        max={365}
                        value={trialDays}
                        onChange={(e) => setTrialDays(e.target.value)}
                        data-testid="input-trial-days"
                      />
                    </div>
                    <ConfirmAction
                      testId="button-confirm-trial"
                      title="Accorder un essai ?"
                      description={`${client.firstName ?? "Ce client"} bénéficiera d'un essai gratuit de ${trialDays} jour(s).`}
                      confirmLabel="Accorder l'essai"
                      onConfirm={() => extendTrial.mutate({ userId: client.id, days: Math.max(1, Number(trialDays) || 14) })}
                      trigger={
                        <Button variant="outline" data-testid="button-extend-trial">
                          <Clock className="w-4 h-4 mr-2" />Accorder un essai
                        </Button>
                      }
                    />
                  </div>

                  {client.overrideStatus !== "none" && (
                    <ConfirmAction
                      testId="button-confirm-revoke"
                      title="Révoquer l'accès offert ?"
                      description={`L'avantage manuel de ${client.firstName ?? "ce client"} sera retiré. Son accès dépendra alors de son abonnement Stripe (ou redeviendra gratuit).`}
                      confirmLabel="Révoquer"
                      destructive
                      onConfirm={() => revokePremium.mutate(client.id)}
                      trigger={
                        <Button variant="ghost" size="sm" className="text-red-600" data-testid="button-revoke-premium">
                          <X className="w-4 h-4 mr-2" />Révoquer l'accès offert
                        </Button>
                      }
                    />
                  )}
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Shield className="w-4 h-4 text-muted-foreground" />
                    Compte
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <ConfirmAction
                      testId="button-confirm-toggle-admin"
                      title={client.isAdmin ? "Retirer le rôle admin ?" : "Promouvoir administrateur ?"}
                      description={
                        client.isAdmin
                          ? `${client.firstName ?? "Ce client"} n'aura plus accès au panneau d'administration.`
                          : `${client.firstName ?? "Ce client"} aura un accès complet au panneau d'administration.`
                      }
                      confirmLabel={client.isAdmin ? "Retirer" : "Promouvoir"}
                      onConfirm={() => toggleAdmin.mutate({ userId: client.id, isAdmin: !client.isAdmin })}
                      trigger={
                        <Button variant="outline" size="sm" data-testid="button-toggle-admin">
                          <Shield className="w-4 h-4 mr-2" />
                          {client.isAdmin ? "Retirer admin" : "Passer admin"}
                        </Button>
                      }
                    />
                    <ConfirmAction
                      testId="button-confirm-delete-client"
                      title="Supprimer ce client ?"
                      description={`Cette action est irréversible. Le compte de ${client.firstName ?? "ce client"} et toutes ses données seront définitivement supprimés.`}
                      confirmLabel="Supprimer définitivement"
                      destructive
                      onConfirm={() => deleteClient.mutate(client.id)}
                      trigger={
                        <Button variant="ghost" size="sm" className="text-red-600" data-testid="button-delete-client">
                          <Trash2 className="w-4 h-4 mr-2" />Supprimer le client
                        </Button>
                      }
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const TTS_VOICES = [
  { id: "alloy", label: "Alloy", desc: "Neutre, équilibré" },
  { id: "echo", label: "Echo", desc: "Masculin, posé" },
  { id: "fable", label: "Fable", desc: "Expressif, storytelling" },
  { id: "onyx", label: "Onyx", desc: "Grave, autoritaire" },
  { id: "nova", label: "Nova", desc: "Féminin, chaleureux" },
  { id: "shimmer", label: "Shimmer", desc: "Doux, intime" },
];

function AISettingsSection() {
  const { toast } = useToast();

  const { data: settingsData, isLoading } = useQuery<AdminSettings>({
    queryKey: ["/api/admin/settings"],
  });

  const [form, setForm] = useState<AdminSettings>({
    scoring_model: "gemini",
    generation_model: "gpt",
    bagou_system_extra: "",
    dialogue_turns: 3,
    tts_model: "tts-1",
    tts_voice: "nova",
    response_timer_seconds: 0,
  });

  useEffect(() => {
    if (settingsData) setForm(settingsData);
  }, [settingsData]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/admin/settings", form);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: "Paramètres sauvegardés", description: "Les changements sont pris en compte immédiatement." });
    },
    onError: (error: Error) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Bot className="w-4 h-4 text-muted-foreground" />
              Modèles de texte
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Modèle d'évaluation</Label>
              <Select value={form.scoring_model} onValueChange={(val) => setForm((f) => ({ ...f, scoring_model: val }))}>
                <SelectTrigger data-testid="select-scoring-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">Gemini 2.5 Flash — Rapide, économique</SelectItem>
                  <SelectItem value="gpt">GPT-4o Mini — Précis, cohérent</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Utilisé pour scorer les réponses des utilisateurs.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Modèle de génération</Label>
              <Select value={form.generation_model} onValueChange={(val) => setForm((f) => ({ ...f, generation_model: val }))}>
                <SelectTrigger data-testid="select-generation-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt">GPT-4o Mini — Précis, cohérent</SelectItem>
                  <SelectItem value="gemini">Gemini 2.5 Flash — Rapide, économique</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Utilisé pour créer les nouvelles cartes.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Nombre de tours par dialogue</Label>
              <Select
                value={String(form.dialogue_turns)}
                onValueChange={(val) => setForm((f) => ({ ...f, dialogue_turns: parseInt(val) }))}
              >
                <SelectTrigger data-testid="select-dialogue-turns">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} tours{n === 3 ? " — Recommandé" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-muted-foreground" />
              Voix & Audio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Modèle TTS</Label>
              <Select value={form.tts_model} onValueChange={(val) => setForm((f) => ({ ...f, tts_model: val }))}>
                <SelectTrigger data-testid="select-tts-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tts-1">tts-1 — Rapide, ~300ms latence ✓ Recommandé</SelectItem>
                  <SelectItem value="tts-1-hd">tts-1-hd — Haute qualité, ~500ms latence</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                <strong>tts-1</strong> pour le dialogue temps réel (latence minimale).{" "}
                <strong>tts-1-hd</strong> pour une qualité audio supérieure.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Voix de l'interlocuteur</Label>
              <Select value={form.tts_voice} onValueChange={(val) => setForm((f) => ({ ...f, tts_voice: val }))}>
                <SelectTrigger data-testid="select-tts-voice">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TTS_VOICES.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.label} — {v.desc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5" />
                  Timer de réponse
                </Label>
                {form.response_timer_seconds > 0 && (
                  <Badge variant="secondary" className="text-xs">{form.response_timer_seconds}s</Badge>
                )}
              </div>
              <Select
                value={String(form.response_timer_seconds)}
                onValueChange={(val) => setForm((f) => ({ ...f, response_timer_seconds: parseInt(val) }))}
              >
                <SelectTrigger data-testid="select-response-timer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Désactivé — Pas de limite</SelectItem>
                  <SelectItem value="10">10 secondes — Mode combat</SelectItem>
                  <SelectItem value="15">15 secondes — Recommandé</SelectItem>
                  <SelectItem value="20">20 secondes — Confortable</SelectItem>
                  <SelectItem value="30">30 secondes — Débutant</SelectItem>
                  <SelectItem value="45">45 secondes — Très souple</SelectItem>
                  <SelectItem value="60">60 secondes — Sans pression</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Temps accordé à l'utilisateur pour formuler sa réponse vocale. Adapte la difficulté.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" />
            Instructions système (Bagou Extra)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Instructions supplémentaires injectées dans le prompt système de Bagou pour personnaliser le style de coaching.
          </p>
          <Textarea
            value={form.bagou_system_extra}
            onChange={(e) => setForm((f) => ({ ...f, bagou_system_extra: e.target.value }))}
            placeholder="Ex: Adapte tes réponses à un public de managers. Sois plus direct dans les situations PRO."
            rows={4}
            className="font-mono text-sm"
            data-testid="textarea-bagou-extra"
          />
        </CardContent>
      </Card>

      <Button
        onClick={() => saveSettings.mutate()}
        disabled={saveSettings.isPending}
        className="w-full"
        style={{ backgroundColor: "#1B2A4A" }}
        data-testid="button-save-ai-settings"
      >
        {saveSettings.isPending ? (
          <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Sauvegarde...</>
        ) : (
          <><Save className="w-4 h-4 mr-2" />Sauvegarder tous les paramètres</>
        )}
      </Button>
    </div>
  );
}

type LeakRow = { cardId: string; themeId: string; subthemeId: string; situation: string; matches: string[] };

function CardsSection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTheme, setSelectedTheme] = useState<string>("all");
  const [editingCard, setEditingCard] = useState<MotherCard | null>(null);
  const [editForm, setEditForm] = useState<Partial<MotherCard>>({});
  const { toast } = useToast();

  const { data: themes } = useQuery<ThemeConfig[]>({ queryKey: ["/api/admin/themes"] });

  const queryParams = new URLSearchParams({ language: "fr" });
  if (selectedTheme && selectedTheme !== "all") queryParams.set("themeId", selectedTheme);

  const [leakData, setLeakData] = useState<{ total: number; leakCount: number; leaks: LeakRow[] } | null>(null);
  const [fixingIds, setFixingIds] = useState<Set<string>>(new Set());
  const [fixingAll, setFixingAll] = useState(false);
  const [fixProgress, setFixProgress] = useState({ done: 0, total: 0 });

  const scanLeaks = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/cards/leaks?language=fr", { credentials: "include" });
      if (!res.ok) throw new Error("Échec de l'analyse");
      return res.json() as Promise<{ total: number; leakCount: number; leaks: LeakRow[] }>;
    },
    onSuccess: (data) => setLeakData(data),
    onError: (error: Error) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const fixOneLeak = async (cardId: string): Promise<{ stillLeaks: boolean; matches: string[] }> => {
    const res = await apiRequest("POST", `/api/admin/cards/${cardId}/fix-leak`);
    const data = await res.json();
    return { stillLeaks: !!data.stillLeaks, matches: data.matches || [] };
  };

  const handleFix = async (cardId: string) => {
    setFixingIds((s) => new Set(s).add(cardId));
    try {
      const { stillLeaks, matches } = await fixOneLeak(cardId);
      if (stillLeaks) {
        // Rewrite ran but the card still leaks — keep it in the list (with the
        // updated matches) so the admin knows it needs a manual edit.
        setLeakData((prev) =>
          prev
            ? { ...prev, leaks: prev.leaks.map((l) => (l.cardId === cardId ? { ...l, matches } : l)) }
            : prev,
        );
        toast({
          title: "Toujours une fuite",
          description: `${cardId} reste à corriger manuellement`,
          variant: "destructive",
        });
      } else {
        setLeakData((prev) =>
          prev ? { ...prev, leakCount: prev.leakCount - 1, leaks: prev.leaks.filter((l) => l.cardId !== cardId) } : prev,
        );
        toast({ title: "Carte corrigée", description: cardId });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/mother-cards"] });
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message || "Échec de la correction", variant: "destructive" });
    } finally {
      setFixingIds((s) => {
        const n = new Set(s);
        n.delete(cardId);
        return n;
      });
    }
  };

  const handleFixAll = async () => {
    if (!leakData || leakData.leaks.length === 0) return;
    setFixingAll(true);
    const list = [...leakData.leaks];
    setFixProgress({ done: 0, total: list.length });
    let failed = 0;
    for (let i = 0; i < list.length; i++) {
      try {
        const { stillLeaks } = await fixOneLeak(list[i].cardId);
        if (stillLeaks) failed++;
      } catch {
        failed++;
      }
      setFixProgress({ done: i + 1, total: list.length });
    }
    setFixingAll(false);
    queryClient.invalidateQueries({ queryKey: ["/api/mother-cards"] });
    scanLeaks.mutate();
    toast({
      title: "Correction terminée",
      description: failed ? `${failed} carte(s) encore à corriger` : "Toutes les fuites traitées",
    });
  };

  const { data: cards, isLoading } = useQuery<MotherCard[]>({
    queryKey: ["/api/mother-cards", selectedTheme],
    queryFn: async () => {
      const res = await fetch(`/api/mother-cards?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch cards");
      return res.json();
    },
  });

  const deleteCard = useMutation({
    mutationFn: async (cardId: string) => { await apiRequest("DELETE", `/api/admin/cards/${cardId}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mother-cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mother-cards/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Carte supprimée" });
    },
    onError: (error: Error) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const updateCard = useMutation({
    mutationFn: async ({ cardId, data }: { cardId: string; data: Partial<MotherCard> }) => {
      const res = await apiRequest("PATCH", `/api/admin/cards/${cardId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mother-cards"] });
      setEditingCard(null);
      toast({ title: "Carte mise à jour" });
    },
    onError: (error: Error) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const filteredCards = cards?.filter((card) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      card.cardId.toLowerCase().includes(q) ||
      card.situation.toLowerCase().includes(q) ||
      card.intent.toLowerCase().includes(q) ||
      card.subthemeId.toLowerCase().includes(q)
    );
  });

  const openEditModal = (card: MotherCard) => {
    setEditingCard(card);
    setEditForm({
      situation: card.situation,
      userGoal: card.userGoal,
      antiPatterns: card.antiPatterns,
      targetVibe: card.targetVibe,
      modelAnswerRules: card.modelAnswerRules,
      difficulty: card.difficulty,
      stakes: card.stakes,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher des cartes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-cards"
          />
        </div>
        <Select value={selectedTheme} onValueChange={setSelectedTheme}>
          <SelectTrigger className="w-[180px]" data-testid="select-theme-filter">
            <SelectValue placeholder="Filtrer par thème" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les thèmes</SelectItem>
            {themes?.map((theme) => (
              <SelectItem key={theme.id} value={theme.id}>{theme.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filteredCards && (
          <Badge variant="secondary" className="text-xs shrink-0">
            {filteredCards.length} carte{filteredCards.length > 1 ? "s" : ""}
          </Badge>
        )}
        <Button
          variant="outline"
          className="shrink-0 gap-2"
          onClick={() => scanLeaks.mutate()}
          disabled={scanLeaks.isPending}
          data-testid="button-scan-leaks"
        >
          {scanLeaks.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
          Vérifier les fuites
        </Button>
      </div>

      {leakData && (
        <Card data-testid="panel-leaks">
          <CardContent className="p-4">
            {leakData.leakCount === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600" data-testid="text-no-leaks">
                <CheckCircle2 className="w-4 h-4" />
                Aucune fuite détectée sur {leakData.total} cartes — les situations ne dévoilent pas la réponse.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-600" data-testid="text-leak-count">
                    <AlertCircle className="w-4 h-4" />
                    {leakData.leakCount} fuite{leakData.leakCount > 1 ? "s" : ""} détectée{leakData.leakCount > 1 ? "s" : ""} sur {leakData.total} cartes
                  </div>
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={handleFixAll}
                    disabled={fixingAll}
                    data-testid="button-fix-all-leaks"
                  >
                    {fixingAll ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {fixingAll ? `Correction ${fixProgress.done}/${fixProgress.total}` : "Tout corriger (IA)"}
                  </Button>
                </div>
                <div className="space-y-2 max-h-[420px] overflow-y-auto">
                  {leakData.leaks.map((leak) => (
                    <div key={leak.cardId} className="border rounded-lg p-3 space-y-2" data-testid={`row-leak-${leak.cardId}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-muted-foreground">{leak.cardId}</span>
                        <Badge variant="secondary" className="text-[10px]">{leak.themeId}</Badge>
                        {leak.matches.map((m, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] text-red-500 border-red-300">{m}</Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{leak.situation}</p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2 h-8"
                          onClick={() => handleFix(leak.cardId)}
                          disabled={fixingIds.has(leak.cardId) || fixingAll}
                          data-testid={`button-fix-leak-${leak.cardId}`}
                        >
                          {fixingIds.has(leak.cardId) ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          Corriger (IA)
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-2 h-8"
                          onClick={() => {
                            const full = cards?.find((c) => c.cardId === leak.cardId);
                            if (full) {
                              openEditModal(full);
                            } else {
                              setSelectedTheme("all");
                              setSearchQuery(leak.cardId);
                              toast({ title: "Carte filtrée", description: "Retrouve-la dans le tableau ci-dessous." });
                            }
                          }}
                          data-testid={`button-edit-leak-${leak.cardId}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Éditer
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>ID Carte</TableHead>
                  <TableHead>Thème</TableHead>
                  <TableHead className="hidden sm:table-cell">Sous-thème</TableHead>
                  <TableHead className="hidden md:table-cell">Situation</TableHead>
                  <TableHead>Diff.</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCards && filteredCards.length > 0 ? (
                  filteredCards.slice(0, 100).map((card) => (
                    <TableRow key={card.cardId} data-testid={`row-card-${card.cardId}`}>
                      <TableCell className="text-xs font-mono text-muted-foreground">{card.cardId}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-[10px]">{card.themeId}</Badge></TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{card.subthemeId}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs max-w-[250px] truncate text-muted-foreground">
                        {card.situation}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium ${card.difficulty === "n1" ? "text-green-600" : card.difficulty === "n2" ? "text-amber-600" : "text-red-600"}`}>
                          {card.difficulty === "n1" ? "Facile" : card.difficulty === "n2" ? "Moyen" : "Difficile"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditModal(card)} data-testid={`button-edit-card-${card.cardId}`}>
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => { if (confirm("Supprimer cette carte ?")) deleteCard.mutate(card.cardId); }}
                            data-testid={`button-delete-card-${card.cardId}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                      {searchQuery ? "Aucune carte pour cette recherche" : "Aucune carte trouvée"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
          {filteredCards && filteredCards.length > 100 && (
            <p className="text-xs text-muted-foreground text-center py-3 border-t">
              Affichage des 100 premiers résultats sur {filteredCards.length}. Utilisez la recherche pour filtrer.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingCard} onOpenChange={(open) => !open && setEditingCard(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier la carte — {editingCard?.cardId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Situation</Label>
              <Textarea
                value={editForm.situation || ""}
                onChange={(e) => setEditForm((f) => ({ ...f, situation: e.target.value }))}
                rows={3}
                data-testid="textarea-edit-situation"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Objectif utilisateur</Label>
              <Input
                value={editForm.userGoal || ""}
                onChange={(e) => setEditForm((f) => ({ ...f, userGoal: e.target.value }))}
                data-testid="input-edit-user-goal"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Vibe cible</Label>
              <Input
                value={editForm.targetVibe || ""}
                onChange={(e) => setEditForm((f) => ({ ...f, targetVibe: e.target.value }))}
                data-testid="input-edit-target-vibe"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Difficulté</Label>
                <Select value={editForm.difficulty || "n1"} onValueChange={(val) => setEditForm((f) => ({ ...f, difficulty: val }))}>
                  <SelectTrigger data-testid="select-edit-difficulty">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="n1">Facile</SelectItem>
                    <SelectItem value="n2">Moyen</SelectItem>
                    <SelectItem value="n3">Difficile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Enjeux</Label>
                <Select value={editForm.stakes || "low"} onValueChange={(val) => setEditForm((f) => ({ ...f, stakes: val }))}>
                  <SelectTrigger data-testid="select-edit-stakes">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Faibles</SelectItem>
                    <SelectItem value="medium">Moyens</SelectItem>
                    <SelectItem value="high">Élevés</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCard(null)}>Annuler</Button>
            <Button
              onClick={() => editingCard && updateCard.mutate({ cardId: editingCard.cardId, data: editForm })}
              disabled={updateCard.isPending}
              data-testid="button-save-card"
            >
              {updateCard.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Sauvegarder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GenerateSection() {
  const [selectedTheme, setSelectedTheme] = useState("");
  const [selectedSubtheme, setSelectedSubtheme] = useState("");
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const [previewCount, setPreviewCount] = useState("20");
  const [previewCards, setPreviewCards] = useState<any[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [showNewSubtheme, setShowNewSubtheme] = useState(false);
  const [newThemeId, setNewThemeId] = useState("");
  const [newThemeLabel, setNewThemeLabel] = useState("");
  const [newSubthemeId, setNewSubthemeId] = useState("");
  const [newSubthemeLabel, setNewSubthemeLabel] = useState("");
  const [newIntents, setNewIntents] = useState("open, respond, close");
  const [newExamples, setNewExamples] = useState("");
  const { toast } = useToast();

  const { data: themes } = useQuery<ThemeConfig[]>({ queryKey: ["/api/admin/themes"] });
  const currentTheme = themes?.find((t) => t.id === selectedTheme);

  const generateAll = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/admin/generate-cards"); return res.json(); },
    onSuccess: (data) => toast({ title: "Génération lancée", description: data.message }),
    onError: (error: Error) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const generateSubtheme = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/generate-subtheme", { themeId: selectedTheme, subthemeId: selectedSubtheme, forceRegenerate });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mother-cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Génération terminée", description: `${data.cardsGenerated} cartes générées.` });
    },
    onError: (error: Error) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const previewExisting = useMutation({
    mutationFn: async () => {
      const theme = themes?.find((t) => t.id === selectedTheme);
      const subtheme = theme?.subthemes.find((s) => s.id === selectedSubtheme);
      const res = await apiRequest("POST", "/api/admin/preview-cards", {
        themeId: selectedTheme, themeLabel: theme?.label || selectedTheme,
        subthemeId: selectedSubtheme, subthemeLabel: subtheme?.label || selectedSubtheme,
        count: parseInt(previewCount),
      });
      return res.json();
    },
    onSuccess: (data) => { setPreviewCards(data.cards || []); setShowPreviewModal(true); },
    onError: (error: Error) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const previewNew = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/preview-cards", {
        themeId: newThemeId, themeLabel: newThemeLabel || newThemeId,
        subthemeId: newSubthemeId, subthemeLabel: newSubthemeLabel || newSubthemeId,
        subthemeIntents: newIntents.split(",").map((s) => s.trim()).filter(Boolean),
        subthemeExamples: newExamples.split("\n").map((s) => s.trim()).filter(Boolean),
        count: parseInt(previewCount),
      });
      return res.json();
    },
    onSuccess: (data) => { setPreviewCards(data.cards || []); setShowPreviewModal(true); },
    onError: (error: Error) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const saveCards = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/bulk-save-cards", { cards: previewCards });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mother-cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setShowPreviewModal(false);
      setPreviewCards([]);
      toast({ title: "Cartes enregistrées", description: `${data.saved} cartes sauvegardées.` });
    },
    onError: (error: Error) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const countOptions = ["10", "20", "30", "40", "50"];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-muted-foreground" />
            Génération globale
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Lancer une génération complète pour tous les thèmes et sous-thèmes configurés. Prend plusieurs minutes.
          </p>
          <Button onClick={() => generateAll.mutate()} disabled={generateAll.isPending} data-testid="button-generate-all">
            {generateAll.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Démarrage...</> : <><Zap className="w-4 h-4 mr-2" />Générer toutes les cartes</>}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Eye className="w-4 h-4 text-muted-foreground" />
            Aperçu avant enregistrement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Générez un aperçu des cartes pour vérifier leur qualité avant sauvegarde.</p>
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={selectedTheme} onValueChange={(val) => { setSelectedTheme(val); setSelectedSubtheme(""); }}>
              <SelectTrigger className="w-[200px]" data-testid="select-gen-theme"><SelectValue placeholder="Thème" /></SelectTrigger>
              <SelectContent>{themes?.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={selectedSubtheme} onValueChange={setSelectedSubtheme} disabled={!selectedTheme}>
              <SelectTrigger className="w-[200px]" data-testid="select-gen-subtheme"><SelectValue placeholder="Sous-thème" /></SelectTrigger>
              <SelectContent>{currentTheme?.subthemes.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={previewCount} onValueChange={setPreviewCount}>
              <SelectTrigger className="w-[110px]" data-testid="select-preview-count"><SelectValue /></SelectTrigger>
              <SelectContent>{countOptions.map((n) => <SelectItem key={n} value={n}>{n} cartes</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={() => previewExisting.mutate()} disabled={!selectedTheme || !selectedSubtheme || previewExisting.isPending} variant="outline" data-testid="button-preview-existing">
              {previewExisting.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Génération...</> : <><Eye className="w-4 h-4 mr-2" />Aperçu</>}
            </Button>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={forceRegenerate} onChange={(e) => setForceRegenerate(e.target.checked)} className="rounded" data-testid="checkbox-force-regenerate" />
              Forcer régénération
            </label>
            <Button onClick={() => generateSubtheme.mutate()} disabled={!selectedTheme || !selectedSubtheme || generateSubtheme.isPending} data-testid="button-generate-subtheme">
              {generateSubtheme.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Génération...</> : <><RefreshCw className="w-4 h-4 mr-2" />Générer directement</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Plus className="w-4 h-4 text-muted-foreground" />
              Nouveau sous-thème
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowNewSubtheme(!showNewSubtheme)} data-testid="button-toggle-new-subtheme">
              {showNewSubtheme ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </CardHeader>
        {showNewSubtheme && (
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Créer des cartes pour un nouveau sous-thème personnalisé.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-theme-id">ID Thème (ex: ASSERTIVITE)</Label>
                <Input id="new-theme-id" value={newThemeId} onChange={(e) => setNewThemeId(e.target.value.toUpperCase())} placeholder="ASSERTIVITE" data-testid="input-new-theme-id" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-theme-label">Nom du thème</Label>
                <Input id="new-theme-label" value={newThemeLabel} onChange={(e) => setNewThemeLabel(e.target.value)} placeholder="Assertivité" data-testid="input-new-theme-label" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-subtheme-id">ID Sous-thème</Label>
                <Input id="new-subtheme-id" value={newSubthemeId} onChange={(e) => setNewSubthemeId(e.target.value.toUpperCase())} placeholder="REFUS" data-testid="input-new-subtheme-id" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-subtheme-label">Nom du sous-thème</Label>
                <Input id="new-subtheme-label" value={newSubthemeLabel} onChange={(e) => setNewSubthemeLabel(e.target.value)} placeholder="Dire non" data-testid="input-new-subtheme-label" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-intents">Intentions (séparées par virgules)</Label>
              <Input id="new-intents" value={newIntents} onChange={(e) => setNewIntents(e.target.value)} placeholder="open, respond, close, redirect" data-testid="input-new-intents" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-examples">Exemples de situations (une par ligne)</Label>
              <Textarea id="new-examples" value={newExamples} onChange={(e) => setNewExamples(e.target.value)} placeholder={"Refuser une invitation\nDire non à une demande urgente"} rows={4} data-testid="textarea-new-examples" />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={previewCount} onValueChange={setPreviewCount}>
                <SelectTrigger className="w-[120px]" data-testid="select-new-preview-count"><SelectValue /></SelectTrigger>
                <SelectContent>{countOptions.map((n) => <SelectItem key={n} value={n}>{n} cartes</SelectItem>)}</SelectContent>
              </Select>
              <Button onClick={() => previewNew.mutate()} disabled={!newThemeId || !newSubthemeId || previewNew.isPending} variant="outline" data-testid="button-preview-new">
                {previewNew.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Génération...</> : <><Eye className="w-4 h-4 mr-2" />Aperçu</>}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      <Dialog open={showPreviewModal} onOpenChange={(open) => !open && setShowPreviewModal(false)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Aperçu — {previewCards.length} cartes générées</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {previewCards.map((card, i) => (
              <div key={card.cardId || i} className="border rounded-lg overflow-hidden" data-testid={`preview-card-${i}`}>
                <button
                  className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedCard(expandedCard === (card.cardId || String(i)) ? null : (card.cardId || String(i)))}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="secondary" className="shrink-0 text-[10px]">{card.difficulty}</Badge>
                    <span className="text-sm truncate">{card.situation}</span>
                  </div>
                  {expandedCard === (card.cardId || String(i)) ? <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />}
                </button>
                {expandedCard === (card.cardId || String(i)) && (
                  <div className="px-3 pb-3 space-y-1.5 text-sm border-t">
                    <p className="pt-2"><span className="font-medium">Objectif : </span>{card.userGoal}</p>
                    <p><span className="font-medium">Rôles : </span>{card.speakerRole} / {card.otherRole}</p>
                    <p><span className="font-medium">Relation : </span>{card.relationship}</p>
                    <p><span className="font-medium">Vibe : </span>{card.targetVibe}</p>
                    {card.antiPatterns?.length > 0 && <p><span className="font-medium">Anti-patterns : </span>{card.antiPatterns.join(", ")}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPreviewModal(false)} data-testid="button-discard-preview">Annuler</Button>
            <Button onClick={() => saveCards.mutate()} disabled={saveCards.isPending || previewCards.length === 0} data-testid="button-save-preview">
              {saveCards.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Enregistrement...</> : <><Save className="w-4 h-4 mr-2" />Valider ({previewCards.length})</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminSkeleton() {
  return (
    <div className="flex h-screen bg-background">
      <div className="w-64 flex-shrink-0" style={{ backgroundColor: "#1B2A4A" }} />
      <div className="flex-1 p-6 space-y-6">
        <Skeleton className="w-48 h-8" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="w-full h-48" />
      </div>
    </div>
  );
}
