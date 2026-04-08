import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Settings,
  Users,
  Database,
  RefreshCw,
  Trash2,
  Shield,
  Search,
  Zap,
  ArrowLeft,
  ShieldAlert,
  Pencil,
  Bot,
  CreditCard,
  Save,
} from "lucide-react";
import { useLocation } from "wouter";
import type { MotherCard, User } from "@shared/schema";

interface ThemeConfig {
  id: string;
  label: string;
  subthemes: { id: string; label: string }[];
}

export default function Admin() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  if (authLoading) {
    return <AdminSkeleton />;
  }

  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-bold" data-testid="text-access-denied">Accès refusé</h2>
            <p className="text-muted-foreground" data-testid="text-access-denied-message">
              Vous n'avez pas les droits d'administrateur pour accéder à cette page.
            </p>
            <Button onClick={() => navigate("/")} data-testid="button-go-home">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Retour à l'accueil
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-admin-title">Portail Admin</h1>
              <p className="text-sm text-muted-foreground">Gérer le contenu et les utilisateurs Bagou</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate("/")} data-testid="button-back-home">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
        </div>

        <Tabs defaultValue="overview" data-testid="tabs-admin">
          <TabsList className="flex-wrap h-auto gap-1" data-testid="tabs-list">
            <TabsTrigger value="overview" data-testid="tab-overview">Vue d'ensemble</TabsTrigger>
            <TabsTrigger value="cards" data-testid="tab-cards">Cartes</TabsTrigger>
            <TabsTrigger value="generate" data-testid="tab-generate">Générer</TabsTrigger>
            <TabsTrigger value="ai-settings" data-testid="tab-ai-settings">
              <Bot className="w-3.5 h-3.5 mr-1.5" />
              Modèle IA
            </TabsTrigger>
            <TabsTrigger value="subscriptions" data-testid="tab-subscriptions">
              <CreditCard className="w-3.5 h-3.5 mr-1.5" />
              Abonnements
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Utilisateurs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab />
          </TabsContent>
          <TabsContent value="cards">
            <CardsTab />
          </TabsContent>
          <TabsContent value="generate">
            <GenerateTab />
          </TabsContent>
          <TabsContent value="ai-settings">
            <AISettingsTab />
          </TabsContent>
          <TabsContent value="subscriptions">
            <SubscriptionsTab />
          </TabsContent>
          <TabsContent value="users">
            <UsersTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function OverviewTab() {
  const { data: countData, isLoading: countLoading } = useQuery<{ count: number }>({
    queryKey: ["/api/mother-cards/count"],
  });

  const { data: themes, isLoading: themesLoading } = useQuery<ThemeConfig[]>({
    queryKey: ["/api/admin/themes"],
  });

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: allCards, isLoading: cardsLoading } = useQuery<MotherCard[]>({
    queryKey: ["/api/mother-cards"],
  });

  const cardsPerTheme = allCards
    ? allCards.reduce<Record<string, number>>((acc, card) => {
        acc[card.themeId] = (acc[card.themeId] || 0) + 1;
        return acc;
      }, {})
    : {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total cartes</CardTitle>
            <Database className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {countLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-2xl font-bold" data-testid="text-total-cards">{countData?.count ?? 0}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total utilisateurs</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-2xl font-bold" data-testid="text-total-users">{users?.length ?? 0}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Thèmes</CardTitle>
            <Settings className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {themesLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-2xl font-bold" data-testid="text-total-themes">{themes?.length ?? 0}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cartes par thème</CardTitle>
        </CardHeader>
        <CardContent>
          {cardsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {themes?.map((theme) => (
                <div key={theme.id} className="flex items-center justify-between gap-3" data-testid={`row-theme-${theme.id}`}>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{theme.id}</Badge>
                    <span className="text-sm">{theme.label}</span>
                  </div>
                  <span className="text-sm font-medium" data-testid={`text-theme-count-${theme.id}`}>
                    {cardsPerTheme[theme.id] || 0} cartes
                  </span>
                </div>
              ))}
              {(!themes || themes.length === 0) && (
                <p className="text-sm text-muted-foreground">Aucun thème configuré</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CardsTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTheme, setSelectedTheme] = useState<string>("all");
  const [editingCard, setEditingCard] = useState<MotherCard | null>(null);
  const [editForm, setEditForm] = useState<Partial<MotherCard>>({});
  const { toast } = useToast();

  const { data: themes } = useQuery<ThemeConfig[]>({
    queryKey: ["/api/admin/themes"],
  });

  const queryParams = new URLSearchParams({ language: "fr" });
  if (selectedTheme && selectedTheme !== "all") {
    queryParams.set("themeId", selectedTheme);
  }

  const { data: cards, isLoading } = useQuery<MotherCard[]>({
    queryKey: ["/api/mother-cards", selectedTheme],
    queryFn: async () => {
      const res = await fetch(`/api/mother-cards?${queryParams.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch cards");
      return res.json();
    },
  });

  const deleteCard = useMutation({
    mutationFn: async (cardId: string) => {
      await apiRequest("DELETE", `/api/admin/cards/${cardId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mother-cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mother-cards/count"] });
      toast({ title: "Carte supprimée", description: "La carte a été supprimée." });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const updateCard = useMutation({
    mutationFn: async ({ cardId, data }: { cardId: string; data: Partial<MotherCard> }) => {
      const res = await apiRequest("PATCH", `/api/admin/cards/${cardId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mother-cards"] });
      setEditingCard(null);
      toast({ title: "Carte mise à jour", description: "Les modifications ont été enregistrées." });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
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

  const saveEdit = () => {
    if (!editingCard) return;
    updateCard.mutate({ cardId: editingCard.cardId, data: editForm });
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
              <SelectItem key={theme.id} value={theme.id}>
                {theme.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Carte</TableHead>
                  <TableHead>Thème</TableHead>
                  <TableHead>Sous-thème</TableHead>
                  <TableHead className="hidden md:table-cell">Situation</TableHead>
                  <TableHead>Difficulté</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCards && filteredCards.length > 0 ? (
                  filteredCards.map((card) => (
                    <TableRow key={card.cardId} data-testid={`row-card-${card.cardId}`}>
                      <TableCell className="font-mono text-xs">{card.cardId}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{card.themeId}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{card.subthemeId}</TableCell>
                      <TableCell className="hidden md:table-cell max-w-[300px] truncate text-sm text-muted-foreground">
                        {card.situation}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{card.difficulty}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditModal(card)}
                            data-testid={`button-edit-card-${card.cardId}`}
                          >
                            <Pencil className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteCard.mutate(card.cardId)}
                            disabled={deleteCard.isPending}
                            data-testid={`button-delete-card-${card.cardId}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Aucune carte trouvée
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {filteredCards && (
        <p className="text-sm text-muted-foreground" data-testid="text-cards-count">
          Affichage de {filteredCards.length} carte{filteredCards.length !== 1 ? "s" : ""}
        </p>
      )}

      <Dialog open={!!editingCard} onOpenChange={(open) => !open && setEditingCard(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier la carte — {editingCard?.cardId}</DialogTitle>
          </DialogHeader>
          {editingCard && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-situation">Situation</Label>
                <Textarea
                  id="edit-situation"
                  value={editForm.situation || ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, situation: e.target.value }))}
                  rows={3}
                  data-testid="textarea-edit-situation"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-userGoal">Objectif utilisateur</Label>
                <Textarea
                  id="edit-userGoal"
                  value={editForm.userGoal || ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, userGoal: e.target.value }))}
                  rows={2}
                  data-testid="textarea-edit-usergoal"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-targetVibe">Vibe cible</Label>
                <Input
                  id="edit-targetVibe"
                  value={editForm.targetVibe || ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, targetVibe: e.target.value }))}
                  data-testid="input-edit-targetvibe"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-antiPatterns">Anti-patterns (séparés par des virgules)</Label>
                <Textarea
                  id="edit-antiPatterns"
                  value={(editForm.antiPatterns || []).join(", ")}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      antiPatterns: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    }))
                  }
                  rows={2}
                  data-testid="textarea-edit-antipatterns"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-modelAnswerRules">Règles de réponse modèle (séparées par des virgules)</Label>
                <Textarea
                  id="edit-modelAnswerRules"
                  value={(editForm.modelAnswerRules || []).join(", ")}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      modelAnswerRules: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    }))
                  }
                  rows={2}
                  data-testid="textarea-edit-modelanswerrules"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Difficulté</Label>
                  <Select
                    value={editForm.difficulty || "n1"}
                    onValueChange={(val) => setEditForm((f) => ({ ...f, difficulty: val }))}
                  >
                    <SelectTrigger data-testid="select-edit-difficulty">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="n1">N1 — Facile</SelectItem>
                      <SelectItem value="n2">N2 — Moyen</SelectItem>
                      <SelectItem value="n3">N3 — Difficile</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Enjeux</Label>
                  <Select
                    value={editForm.stakes || "low"}
                    onValueChange={(val) => setEditForm((f) => ({ ...f, stakes: val }))}
                  >
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
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCard(null)} data-testid="button-cancel-edit">
              Annuler
            </Button>
            <Button onClick={saveEdit} disabled={updateCard.isPending} data-testid="button-save-edit">
              {updateCard.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Enregistrer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GenerateTab() {
  const [selectedTheme, setSelectedTheme] = useState<string>("");
  const [selectedSubtheme, setSelectedSubtheme] = useState<string>("");
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const { toast } = useToast();

  const { data: themes } = useQuery<ThemeConfig[]>({
    queryKey: ["/api/admin/themes"],
  });

  const currentTheme = themes?.find((t) => t.id === selectedTheme);

  const generateAll = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/generate-cards");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Génération lancée", description: data.message || "La génération de toutes les cartes a commencé en arrière-plan." });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const generateSubtheme = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/generate-subtheme", {
        themeId: selectedTheme,
        subthemeId: selectedSubtheme,
        forceRegenerate,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mother-cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mother-cards/count"] });
      toast({
        title: "Génération terminée",
        description: `${data.cardsGenerated} cartes générées pour ${selectedSubtheme}.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Générer toutes les cartes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Lancer une génération complète des cartes pour tous les thèmes et sous-thèmes.
            L'opération s'exécute en arrière-plan et peut prendre plusieurs minutes.
          </p>
          <Button
            onClick={() => generateAll.mutate()}
            disabled={generateAll.isPending}
            data-testid="button-generate-all"
          >
            {generateAll.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Démarrage...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Générer toutes les cartes
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Générer par sous-thème
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Select
              value={selectedTheme}
              onValueChange={(val) => {
                setSelectedTheme(val);
                setSelectedSubtheme("");
              }}
            >
              <SelectTrigger className="w-[200px]" data-testid="select-gen-theme">
                <SelectValue placeholder="Sélectionner le thème" />
              </SelectTrigger>
              <SelectContent>
                {themes?.map((theme) => (
                  <SelectItem key={theme.id} value={theme.id}>
                    {theme.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedSubtheme}
              onValueChange={setSelectedSubtheme}
              disabled={!selectedTheme}
            >
              <SelectTrigger className="w-[200px]" data-testid="select-gen-subtheme">
                <SelectValue placeholder="Sélectionner le sous-thème" />
              </SelectTrigger>
              <SelectContent>
                {currentTheme?.subthemes.map((sub) => (
                  <SelectItem key={sub.id} value={sub.id}>
                    {sub.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={forceRegenerate}
                onChange={(e) => setForceRegenerate(e.target.checked)}
                className="rounded"
                data-testid="checkbox-force-regenerate"
              />
              Forcer la régénération
            </label>
          </div>

          <Button
            onClick={() => generateSubtheme.mutate()}
            disabled={!selectedTheme || !selectedSubtheme || generateSubtheme.isPending}
            data-testid="button-generate-subtheme"
          >
            {generateSubtheme.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Générer le sous-thème
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function UsersTab() {
  const { toast } = useToast();

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const toggleAdmin = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/admin`, { isAdmin });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Utilisateur mis à jour", description: "Le statut administrateur a été modifié." });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Inscription</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users && users.length > 0 ? (
                users.map((u) => (
                  <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                    <TableCell className="font-medium">
                      {u.firstName} {u.lastName}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.email || "—"}
                    </TableCell>
                    <TableCell>
                      {u.isAdmin ? (
                        <Badge data-testid={`badge-admin-${u.id}`}>
                          <Shield className="w-3 h-3 mr-1" />
                          Admin
                        </Badge>
                      ) : (
                        <Badge variant="secondary" data-testid={`badge-user-${u.id}`}>User</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant={u.isAdmin ? "outline" : "default"}
                        size="sm"
                        onClick={() => toggleAdmin.mutate({ userId: u.id, isAdmin: !u.isAdmin })}
                        disabled={toggleAdmin.isPending}
                        data-testid={`button-toggle-admin-${u.id}`}
                      >
                        {u.isAdmin ? "Retirer Admin" : "Rendre Admin"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Aucun utilisateur trouvé
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

interface AdminSettingsData {
  scoring_model: string;
  generation_model: string;
  bagou_system_extra: string;
  dialogue_turns: number;
}

function AISettingsTab() {
  const { toast } = useToast();
  const [form, setForm] = useState<AdminSettingsData>({
    scoring_model: "gemini",
    generation_model: "gpt",
    bagou_system_extra: "",
    dialogue_turns: 3,
  });

  const { isLoading, data: settingsData } = useQuery<AdminSettingsData>({
    queryKey: ["/api/admin/settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  useEffect(() => {
    if (settingsData) {
      setForm(settingsData);
    }
  }, [settingsData]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/admin/settings", form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: "Paramètres sauvegardés", description: "La configuration IA a été mise à jour." });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="w-4 h-4" />
            Modèles IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Modèle de scoring (évaluation)</Label>
              <Select
                value={form.scoring_model}
                onValueChange={(val) => setForm((f) => ({ ...f, scoring_model: val }))}
              >
                <SelectTrigger data-testid="select-scoring-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">Gemini 2.5 Flash (recommandé)</SelectItem>
                  <SelectItem value="gpt">GPT-4o-mini</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Utilisé pour noter les réponses utilisateur</p>
            </div>

            <div className="space-y-1.5">
              <Label>Modèle de génération</Label>
              <Select
                value={form.generation_model}
                onValueChange={(val) => setForm((f) => ({ ...f, generation_model: val }))}
              >
                <SelectTrigger data-testid="select-generation-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt">GPT-4o-mini (recommandé)</SelectItem>
                  <SelectItem value="gemini">Gemini 2.5 Flash</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Utilisé pour générer les réponses modèles et roleplay</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Paramètres de l'échange
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre de tours par situation ({form.dialogue_turns} tours)</Label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={2}
                max={5}
                value={form.dialogue_turns}
                onChange={(e) => setForm((f) => ({ ...f, dialogue_turns: parseInt(e.target.value) }))}
                className="flex-1"
                data-testid="slider-dialogue-turns"
              />
              <span className="text-sm font-medium w-6">{form.dialogue_turns}</span>
            </div>
            <p className="text-xs text-muted-foreground">Nombre d'échanges (allers-retours) par carte de situation</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Personnalité du coach (instructions supplémentaires)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Ex: Adapte-toi au contexte professionnel. Sois encore plus direct sur les erreurs de cadre..."
            value={form.bagou_system_extra}
            onChange={(e) => setForm((f) => ({ ...f, bagou_system_extra: e.target.value }))}
            rows={4}
            data-testid="textarea-bagou-system-extra"
          />
          <p className="text-xs text-muted-foreground">
            Ces instructions s'ajoutent au prompt système de base du coach Bagou. Laisse vide pour utiliser la personnalité par défaut.
          </p>
        </CardContent>
      </Card>

      <Button
        onClick={() => saveSettings.mutate()}
        disabled={saveSettings.isPending}
        data-testid="button-save-ai-settings"
      >
        {saveSettings.isPending ? (
          <>
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            Sauvegarde...
          </>
        ) : (
          <>
            <Save className="w-4 h-4 mr-2" />
            Sauvegarder les paramètres IA
          </>
        )}
      </Button>
    </div>
  );
}

function SubscriptionsTab() {
  const { toast } = useToast();
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [subForm, setSubForm] = useState({ subscriptionStatus: "none", subscriptionExpiresAt: "" });

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const updateSubscription = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/subscription`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingUser(null);
      toast({ title: "Abonnement mis à jour" });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const openSubModal = (user: User) => {
    setEditingUser(user);
    setSubForm({
      subscriptionStatus: (user as any).subscriptionStatus || "none",
      subscriptionExpiresAt: (user as any).subscriptionExpiresAt
        ? new Date((user as any).subscriptionExpiresAt).toISOString().split("T")[0]
        : "",
    });
  };

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      none: "Aucun",
      trial: "Essai",
      active: "Actif",
      expired: "Expiré",
    };
    return map[status] || status;
  };

  const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    if (status === "active") return "default";
    if (status === "trial") return "secondary";
    if (status === "expired") return "destructive";
    return "outline";
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Statut abonnement</TableHead>
                  <TableHead>Expiration</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users && users.length > 0 ? (
                  users.map((u) => (
                    <TableRow key={u.id} data-testid={`row-sub-${u.id}`}>
                      <TableCell className="font-medium">
                        {u.firstName} {u.lastName}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.email || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant((u as any).subscriptionStatus || "none")} data-testid={`badge-sub-${u.id}`}>
                          {statusLabel((u as any).subscriptionStatus || "none")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {(u as any).subscriptionExpiresAt
                          ? new Date((u as any).subscriptionExpiresAt).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openSubModal(u)}
                          data-testid={`button-edit-sub-${u.id}`}
                        >
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Aucun utilisateur
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
                  <SelectItem value="none">Aucun</SelectItem>
                  <SelectItem value="trial">Essai gratuit</SelectItem>
                  <SelectItem value="active">Actif (payant)</SelectItem>
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
              {updateSubscription.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminSkeleton() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="w-32 h-6" />
            <Skeleton className="w-48 h-4" />
          </div>
        </div>
        <Skeleton className="w-full h-10" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    </div>
  );
}
