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
} from "lucide-react";
import { useLocation } from "wouter";
import type { MotherCard, User } from "@shared/schema";

type Section = "overview" | "users" | "subscriptions" | "ai" | "cards" | "generate";

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
  { id: "users", label: "Utilisateurs", icon: <Users className="w-5 h-5" /> },
  { id: "subscriptions", label: "Abonnements", icon: <CreditCard className="w-5 h-5" /> },
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
    users: "Utilisateurs",
    subscriptions: "Abonnements",
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
            {activeSection === "users" && <UsersSection />}
            {activeSection === "subscriptions" && <SubscriptionsSection />}
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

  const { data: themes } = useQuery<ThemeConfig[]>({ queryKey: ["/api/admin/themes"] });
  const { data: allCards } = useQuery<MotherCard[]>({ queryKey: ["/api/mother-cards"] });

  const cardsPerTheme = allCards
    ? allCards.reduce<Record<string, number>>((acc, card) => {
        acc[card.themeId] = (acc[card.themeId] || 0) + 1;
        return acc;
      }, {})
    : {};

  const totalSubs = stats
    ? (stats.subscriptions.active + stats.subscriptions.trial + stats.subscriptions.none + stats.subscriptions.expired)
    : 1;

  const subBreakdown = stats ? [
    { label: "Premium", count: stats.subscriptions.active, color: "#10b981", pct: Math.round(stats.subscriptions.active / totalSubs * 100) },
    { label: "Essai", count: stats.subscriptions.trial, color: "#3b82f6", pct: Math.round(stats.subscriptions.trial / totalSubs * 100) },
    { label: "Gratuit", count: stats.subscriptions.none, color: "#94a3b8", pct: Math.round(stats.subscriptions.none / totalSubs * 100) },
    { label: "Expiré", count: stats.subscriptions.expired, color: "#f87171", pct: Math.round(stats.subscriptions.expired / totalSubs * 100) },
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
              value={stats?.subscriptions.active ?? 0}
              sub={`${stats?.subscriptions.trial ?? 0} en essai`}
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
            {statsLoading ? (
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
    </div>
  );
}

function UsersSection() {
  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [subForm, setSubForm] = useState({ subscriptionStatus: "none", subscriptionExpiresAt: "" });
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);
  const { toast } = useToast();

  const { data: users, isLoading } = useQuery<User[]>({ queryKey: ["/api/admin/users"] });

  const updateSubscription = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/subscription`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setEditingUser(null);
      toast({ title: "Abonnement mis à jour" });
    },
    onError: (error: Error) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const toggleAdmin = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/admin`, { isAdmin });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Statut admin modifié" });
    },
    onError: (error: Error) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setConfirmDelete(null);
      toast({ title: "Utilisateur supprimé" });
    },
    onError: (error: Error) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const filtered = users?.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q)
    );
  });

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setSubForm({
      subscriptionStatus: (user as any).subscriptionStatus || "none",
      subscriptionExpiresAt: (user as any).subscriptionExpiresAt
        ? new Date((user as any).subscriptionExpiresAt).toISOString().split("T")[0]
        : "",
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un utilisateur..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-users"
          />
        </div>
        <Badge variant="secondary" className="text-xs">
          {filtered?.length ?? 0} utilisateur{(filtered?.length ?? 0) > 1 ? "s" : ""}
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
                  <TableHead className="w-[240px]">Utilisateur</TableHead>
                  <TableHead>Abonnement</TableHead>
                  <TableHead className="hidden md:table-cell">Inscrit le</TableHead>
                  <TableHead className="hidden lg:table-cell">Rôle</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered && filtered.length > 0 ? (
                  filtered.map((u) => (
                    <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#1B2A4A15" }}>
                            <span className="text-xs font-bold" style={{ color: "#1B2A4A" }}>
                              {(u.firstName || "?").charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {u.firstName} {u.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{u.email || "—"}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <SubBadge status={(u as any).subscriptionStatus || "none"} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString("fr-FR") : "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {u.isAdmin ? (
                          <Badge className="text-[11px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                            <Shield className="w-3 h-3 mr-1" />Admin
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Utilisateur</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => openEditModal(u)}
                            data-testid={`button-edit-user-${u.id}`}
                            title="Modifier l'abonnement"
                          >
                            <CreditCard className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => toggleAdmin.mutate({ userId: u.id, isAdmin: !u.isAdmin })}
                            data-testid={`button-toggle-admin-${u.id}`}
                            title={u.isAdmin ? "Retirer le rôle admin" : "Passer en admin"}
                          >
                            <Shield className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => setConfirmDelete(u)}
                            data-testid={`button-delete-user-${u.id}`}
                            title="Supprimer l'utilisateur"
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                      {search ? "Aucun résultat pour cette recherche" : "Aucun utilisateur inscrit"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Abonnement — {editingUser?.firstName} {editingUser?.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Statut</Label>
              <Select
                value={subForm.subscriptionStatus}
                onValueChange={(val) => setSubForm((f) => ({ ...f, subscriptionStatus: val }))}
              >
                <SelectTrigger data-testid="select-sub-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Gratuit (aucun)</SelectItem>
                  <SelectItem value="trial">Essai gratuit</SelectItem>
                  <SelectItem value="active">Premium (actif)</SelectItem>
                  <SelectItem value="expired">Expiré</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sub-expires">Date d'expiration (optionnel)</Label>
              <Input
                id="sub-expires"
                type="date"
                value={subForm.subscriptionExpiresAt}
                onChange={(e) => setSubForm((f) => ({ ...f, subscriptionExpiresAt: e.target.value }))}
                data-testid="input-sub-expires"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Annuler</Button>
            <Button
              onClick={() => editingUser && updateSubscription.mutate({ userId: editingUser.id, data: subForm })}
              disabled={updateSubscription.isPending}
              data-testid="button-save-subscription"
            >
              {updateSubscription.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Supprimer l'utilisateur ?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Cette action est irréversible. L'utilisateur <strong>{confirmDelete?.firstName} {confirmDelete?.lastName}</strong> et toutes ses données seront supprimés.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && deleteUser.mutate(confirmDelete.id)}
              disabled={deleteUser.isPending}
              data-testid="button-confirm-delete-user"
            >
              {deleteUser.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const PLANS = [
  {
    id: "none",
    name: "Gratuit",
    color: "#94a3b8",
    bgColor: "bg-slate-50 dark:bg-slate-900",
    borderColor: "border-slate-200 dark:border-slate-700",
    features: ["5 dialogues par jour", "Thèmes de base (SOCIAL, PRO)", "Mode texte uniquement", "SRS basique"],
    icon: <MessageCircle className="w-5 h-5" />,
  },
  {
    id: "trial",
    name: "Essai",
    color: "#3b82f6",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    borderColor: "border-blue-200 dark:border-blue-800",
    features: ["14 jours d'accès complet", "Tous les thèmes", "Mode voix inclus", "Toutes les fonctionnalités"],
    icon: <Calendar className="w-5 h-5" />,
    badge: "14 jours",
  },
  {
    id: "active",
    name: "Premium",
    color: "#10b981",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
    borderColor: "border-emerald-200 dark:border-emerald-800",
    features: ["Dialogues illimités", "Tous les thèmes + exclusifs", "Voix IA haute qualité", "Analyse avancée & rapports"],
    icon: <Crown className="w-5 h-5" />,
    badge: "Recommandé",
    highlight: true,
  },
];

function SubscriptionsSection() {
  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
  });
  const { data: users, isLoading: usersLoading } = useQuery<User[]>({ queryKey: ["/api/admin/users"] });
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [subForm, setSubForm] = useState({ subscriptionStatus: "none", subscriptionExpiresAt: "" });
  const { toast } = useToast();

  const updateSubscription = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/subscription`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setEditingUser(null);
      toast({ title: "Abonnement mis à jour" });
    },
    onError: (error: Error) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setSubForm({
      subscriptionStatus: (user as any).subscriptionStatus || "none",
      subscriptionExpiresAt: (user as any).subscriptionExpiresAt
        ? new Date((user as any).subscriptionExpiresAt).toISOString().split("T")[0]
        : "",
    });
  };

  const totalSubs = stats ? (stats.subscriptions.active + stats.subscriptions.trial + stats.subscriptions.none + stats.subscriptions.expired) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`relative rounded-xl border-2 p-5 ${plan.bgColor} ${plan.highlight ? "border-emerald-400 dark:border-emerald-600" : plan.borderColor}`}
          >
            {plan.badge && (
              <span
                className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: plan.color }}
              >
                {plan.badge}
              </span>
            )}
            <div className="flex items-center gap-2 mb-3">
              <span style={{ color: plan.color }}>{plan.icon}</span>
              <h3 className="font-bold text-base">{plan.name}</h3>
              {!statsLoading && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {stats?.subscriptions[plan.id as keyof typeof stats.subscriptions] ?? 0} utilisateurs
                </Badge>
              )}
            </div>
            <ul className="space-y-1.5">
              {plan.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: plan.color }} />
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)
        ) : (
          [
            { label: "Gratuit", count: stats?.subscriptions.none ?? 0, color: "#94a3b8" },
            { label: "Essai", count: stats?.subscriptions.trial ?? 0, color: "#3b82f6" },
            { label: "Premium", count: stats?.subscriptions.active ?? 0, color: "#10b981" },
            { label: "Expiré", count: stats?.subscriptions.expired ?? 0, color: "#f87171" },
          ].map((item) => (
            <Card key={item.label} className="border">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold" style={{ color: item.color }}>{item.count}</div>
                <div className="text-xs text-muted-foreground mt-1">{item.label}</div>
                <div className="text-xs text-muted-foreground">
                  {totalSubs > 0 ? `${Math.round(item.count / totalSubs * 100)}%` : "0%"}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Gestion individuelle</CardTitle>
            <p className="text-xs text-muted-foreground">Gérer manuellement l'abonnement de chaque utilisateur</p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {usersLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Utilisateur</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden md:table-cell">Expiration</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users && users.length > 0 ? (
                  users.map((u) => (
                    <TableRow key={u.id} data-testid={`row-sub-${u.id}`}>
                      <TableCell className="font-medium text-sm">
                        {u.firstName} {u.lastName}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{u.email || "—"}</TableCell>
                      <TableCell>
                        <SubBadge status={(u as any).subscriptionStatus || "none"} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {(u as any).subscriptionExpiresAt
                          ? new Date((u as any).subscriptionExpiresAt).toLocaleDateString("fr-FR")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openEditModal(u)} data-testid={`button-edit-sub-${u.id}`}>
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Aucun utilisateur</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed border-2 bg-muted/20">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <CreditCard className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Intégration paiement</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                L'intégration Stripe pour la gestion automatique des paiements et abonnements est à venir.
                Actuellement, la gestion des abonnements est manuelle via ce tableau de bord.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abonnement — {editingUser?.firstName} {editingUser?.lastName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Statut</Label>
              <Select value={subForm.subscriptionStatus} onValueChange={(val) => setSubForm((f) => ({ ...f, subscriptionStatus: val }))}>
                <SelectTrigger data-testid="select-sub-status-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Gratuit (aucun)</SelectItem>
                  <SelectItem value="trial">Essai gratuit</SelectItem>
                  <SelectItem value="active">Premium (actif)</SelectItem>
                  <SelectItem value="expired">Expiré</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sub-expires-2">Date d'expiration (optionnel)</Label>
              <Input
                id="sub-expires-2"
                type="date"
                value={subForm.subscriptionExpiresAt}
                onChange={(e) => setSubForm((f) => ({ ...f, subscriptionExpiresAt: e.target.value }))}
                data-testid="input-sub-expires-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Annuler</Button>
            <Button
              onClick={() => editingUser && updateSubscription.mutate({ userId: editingUser.id, data: subForm })}
              disabled={updateSubscription.isPending}
              data-testid="button-save-subscription-2"
            >
              {updateSubscription.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Enregistrer
            </Button>
          </DialogFooter>
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

function CardsSection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTheme, setSelectedTheme] = useState<string>("all");
  const [editingCard, setEditingCard] = useState<MotherCard | null>(null);
  const [editForm, setEditForm] = useState<Partial<MotherCard>>({});
  const { toast } = useToast();

  const { data: themes } = useQuery<ThemeConfig[]>({ queryKey: ["/api/admin/themes"] });

  const queryParams = new URLSearchParams({ language: "fr" });
  if (selectedTheme && selectedTheme !== "all") queryParams.set("themeId", selectedTheme);

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
      </div>

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
