import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
            <h2 className="text-xl font-bold" data-testid="text-access-denied">Access Denied</h2>
            <p className="text-muted-foreground" data-testid="text-access-denied-message">
              You do not have admin privileges to access this page.
            </p>
            <Button onClick={() => navigate("/")} data-testid="button-go-home">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
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
              <h1 className="text-2xl font-bold" data-testid="text-admin-title">Admin Portal</h1>
              <p className="text-sm text-muted-foreground">Manage Bagou content and users</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate("/")} data-testid="button-back-home">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>

        <Tabs defaultValue="overview" data-testid="tabs-admin">
          <TabsList data-testid="tabs-list">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="cards" data-testid="tab-cards">Cards</TabsTrigger>
            <TabsTrigger value="generate" data-testid="tab-generate">Generate</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
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
            <CardTitle className="text-sm font-medium">Total Cards</CardTitle>
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
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
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
            <CardTitle className="text-sm font-medium">Themes</CardTitle>
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
          <CardTitle className="text-base">Cards per Theme</CardTitle>
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
                    {cardsPerTheme[theme.id] || 0} cards
                  </span>
                </div>
              ))}
              {(!themes || themes.length === 0) && (
                <p className="text-sm text-muted-foreground">No themes configured</p>
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
      toast({ title: "Card deleted", description: "The card has been removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search cards..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-cards"
          />
        </div>
        <Select value={selectedTheme} onValueChange={setSelectedTheme}>
          <SelectTrigger className="w-[180px]" data-testid="select-theme-filter">
            <SelectValue placeholder="Filter by theme" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All themes</SelectItem>
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
                  <TableHead>Card ID</TableHead>
                  <TableHead>Theme</TableHead>
                  <TableHead>Subtheme</TableHead>
                  <TableHead className="hidden md:table-cell">Situation</TableHead>
                  <TableHead>Difficulty</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteCard.mutate(card.cardId)}
                          disabled={deleteCard.isPending}
                          data-testid={`button-delete-card-${card.cardId}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No cards found
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
          Showing {filteredCards.length} card{filteredCards.length !== 1 ? "s" : ""}
        </p>
      )}
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
      toast({ title: "Generation started", description: data.message || "Full card generation has begun in the background." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
        title: "Generation complete",
        description: `Generated ${data.cardsGenerated} cards for ${selectedSubtheme}.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Generate All Cards
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Trigger a full generation of cards across all themes and subthemes.
            This runs in the background and may take several minutes.
          </p>
          <Button
            onClick={() => generateAll.mutate()}
            disabled={generateAll.isPending}
            data-testid="button-generate-all"
          >
            {generateAll.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Generate All Cards
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Generate by Subtheme
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
                <SelectValue placeholder="Select theme" />
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
                <SelectValue placeholder="Select subtheme" />
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
              Force regenerate
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
                Generating...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Generate Subtheme
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
      toast({ title: "User updated", description: "Admin status has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Joined</TableHead>
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
                        {u.isAdmin ? "Remove Admin" : "Make Admin"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No users found
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
