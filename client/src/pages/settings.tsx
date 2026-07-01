import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronRight,
  Crown,
  Loader2,
  LogOut,
  Trash2,
  User as UserIcon,
  Sun,
  Moon,
  Monitor,
  Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useUpload } from "@/hooks/use-upload";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useAppStore } from "@/lib/store";
import { getTranslations, type Language } from "@/lib/i18n";
import { useTheme } from "@/components/theme-provider";
import { useSubscription } from "@/hooks/use-subscription";
import { useBilling, formatPrice, intervalLabel } from "@/hooks/use-billing";
import type { UserProfile } from "@shared/schema";
import {
  toneEnum,
  formalityEnum,
  modeEnum,
  riskLevelEnum,
  tuVousEnum,
  interlocutorGenderEnum,
} from "@shared/schema";
import { OBJECTIVES } from "@/lib/objectives";

const INTERLOCUTOR_GENDER_LABELS: Record<(typeof interlocutorGenderEnum)[number], string> = {
  femme: "Femme",
  homme: "Homme",
};
const INTERLOCUTOR_GENDERS = interlocutorGenderEnum.map((value) => ({
  value,
  label: INTERLOCUTOR_GENDER_LABELS[value],
}));

const TONES = toneEnum;

const FORMALITY_LABELS: Record<(typeof formalityEnum)[number], string> = {
  casual: "Détendu",
  neutral: "Neutre",
  formal: "Soutenu",
};
const FORMALITY = formalityEnum.map((value) => ({ value, label: FORMALITY_LABELS[value] }));

const SESSION_MINUTES = [5, 10, 12, 15, 20, 30];

interface CoachingForm {
  objectives: string[];
  primaryMode: string;
  tonePrimary: string;
  toneSecondary: string;
  riskLevel: string;
  interlocutorGender: string;
  tuVous: string;
  formality: string;
  dailySessionMinutes: number;
  allowSarcasm: boolean;
  allowExplicitFlirt: boolean;
  allowSwearing: boolean;
}

export default function Settings() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const { language, setLanguage } = useAppStore();
  const { theme, setTheme } = useTheme();
  const t = getTranslations(language);

  const { data: profile, isLoading: profileLoading } = useQuery<UserProfile | null>({
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

  const { data: status } = useSubscription();
  const { plans, plansLoading, checkout, portal } = useBilling();

  const [form, setForm] = useState<CoachingForm | null>(null);

  useEffect(() => {
    if (profile && !form) {
      setForm({
        objectives: profile.objectives ?? [],
        primaryMode: profile.primaryMode,
        tonePrimary: profile.tonePrimary,
        toneSecondary: profile.toneSecondary,
        riskLevel: profile.riskLevel,
        interlocutorGender: profile.interlocutorGender,
        tuVous: profile.tuVous,
        formality: profile.formality,
        dailySessionMinutes: profile.dailySessionMinutes,
        allowSarcasm: profile.allowSarcasm,
        allowExplicitFlirt: profile.allowExplicitFlirt,
        allowSwearing: profile.allowSwearing,
      });
    }
  }, [profile, form]);

  useEffect(() => {
    if (!profileLoading && user?.id && !profile) navigate("/onboarding");
  }, [profileLoading, profile, user?.id, navigate]);

  const saveProfile = useMutation({
    mutationFn: async (updates: Partial<UserProfile>) => {
      if (!profile) throw new Error("No profile");
      const res = await apiRequest("PATCH", `/api/profiles/${profile.id}`, updates);
      return (await res.json()) as UserProfile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/user", user?.id] });
      toast({
        title: "Préférences enregistrées",
        description: "Tes changements sont pris en compte immédiatement.",
      });
    },
    onError: () =>
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer. Réessaie dans un instant.",
        variant: "destructive",
      }),
  });

  const deleteAccount = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/account");
    },
    onSuccess: () => {
      (window.top ?? window).location.href = "/api/logout";
    },
    onError: () =>
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le compte. Réessaie dans un instant.",
        variant: "destructive",
      }),
  });

  const { getUploadParameters } = useUpload();

  const saveProfileImage = useMutation({
    mutationFn: async (imageUrl: string | null) => {
      const res = await apiRequest("PUT", "/api/account/profile-image", { imageUrl });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Photo mise à jour",
        description: "Ta nouvelle photo de profil est visible dans toute l'app.",
      });
    },
    onError: () =>
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour la photo. Réessaie dans un instant.",
        variant: "destructive",
      }),
  });

  const handleLanguageChange = (lang: Language) => {
    const previous = language;
    setLanguage(lang);
    if (profile)
      saveProfile.mutate(
        { language: lang },
        { onError: () => setLanguage(previous) },
      );
  };

  const updateForm = <K extends keyof CoachingForm>(key: K, value: CoachingForm[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const toggleObjective = (key: string) =>
    setForm((prev) =>
      prev
        ? {
            ...prev,
            objectives: prev.objectives.includes(key)
              ? prev.objectives.filter((o) => o !== key)
              : [...prev.objectives, key],
          }
        : prev
    );

  if (profileLoading || !profile || !form) return <SettingsSkeleton />;

  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Utilisateur Bagou";
  const tier = status?.tier ?? "free";
  const isPaid = status?.isPremium ?? false;

  return (
    <div className="min-h-dvh bg-gradient-to-br from-background via-background to-primary/5">
      <div className="sticky top-0 z-40 border-b bg-background/80 px-4 py-2 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-base font-bold" data-testid="text-settings-title">
            Paramètres
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-8 px-4 pb-16 pt-6">
        {/* ── Section: Compte ── */}
        <motion.section initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <SectionTitle>Compte</SectionTitle>

          <Card>
            <CardContent className="space-y-5 p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12" data-testid="img-account-avatar">
                  <AvatarImage src={user?.customImageUrl || user?.profileImageUrl || undefined} />
                  <AvatarFallback>
                    <UserIcon className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold" data-testid="text-account-name">
                    {fullName}
                  </p>
                  <p className="truncate text-sm text-muted-foreground" data-testid="text-account-email">
                    {user?.email || "—"}
                  </p>
                </div>
                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={10 * 1024 * 1024}
                  onGetUploadParameters={getUploadParameters}
                  onComplete={(result) => {
                    const uploaded = result.successful?.[0];
                    const uploadURL = uploaded?.uploadURL;
                    if (uploadURL) saveProfileImage.mutate(uploadURL);
                  }}
                  buttonClassName="h-9 shrink-0 bg-transparent border border-border text-foreground hover-elevate active-elevate-2"
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium" data-testid="button-upload-photo">
                    <Camera className="h-4 w-4" />
                    Photo
                  </span>
                </ObjectUploader>
              </div>
              {user?.customImageUrl && (
                <button
                  type="button"
                  onClick={() => saveProfileImage.mutate(null)}
                  disabled={saveProfileImage.isPending}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
                  data-testid="button-remove-photo"
                >
                  Rétablir la photo par défaut
                </button>
              )}

              <div className="space-y-2">
                <Label>Langue</Label>
                <Segmented
                  value={language}
                  testIdPrefix="button-language"
                  options={[
                    { value: "fr", label: "Français" },
                    { value: "en", label: "English" },
                  ]}
                  onChange={(v) => handleLanguageChange(v as Language)}
                />
              </div>

              <div className="space-y-2">
                <Label>Thème</Label>
                <div className="flex flex-wrap gap-2" data-testid="group-theme">
                  {[
                    { value: "light", label: "Clair", icon: Sun },
                    { value: "dark", label: "Sombre", icon: Moon },
                    { value: "system", label: "Système", icon: Monitor },
                  ].map((opt) => {
                    const Icon = opt.icon;
                    const active = theme === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setTheme(opt.value as "light" | "dark" | "system")}
                        data-testid={`button-theme-${opt.value}`}
                        className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors hover-elevate active-elevate-2 ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-foreground"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => logout()}
                  data-testid="button-logout"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Déconnexion
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="flex-1" data-testid="button-delete-account">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Supprimer mon compte
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent data-testid="dialog-delete-account">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer définitivement ton compte ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Cette action est irréversible. Ton profil, ta progression et tout ton
                        historique d'entraînement seront supprimés. Si tu as un abonnement actif,
                        pense à l'annuler depuis « Gérer mon abonnement ».
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-cancel-delete">Annuler</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => {
                          e.preventDefault();
                          deleteAccount.mutate();
                        }}
                        disabled={deleteAccount.isPending}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        data-testid="button-confirm-delete"
                      >
                        {deleteAccount.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Oui, supprimer
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </motion.section>

        {/* ── Section: Préférences de coaching ── */}
        <section>
          <SectionTitle>Préférences de coaching</SectionTitle>

          <Card>
            <CardContent className="space-y-6 p-4">
              <Field label="Objectifs">
                <div className="flex flex-wrap gap-2" data-testid="group-objectives">
                  {OBJECTIVES.map((o) => {
                    const active = form.objectives.includes(o.key);
                    return (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => toggleObjective(o.key)}
                        data-testid={`chip-objective-${o.key}`}
                        className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors hover-elevate active-elevate-2 ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-foreground"
                        }`}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label={t.onboarding.mode.title}>
                <Segmented
                  value={form.primaryMode}
                  testIdPrefix="button-mode"
                  options={modeEnum.map((value) => ({ value, label: t.onboarding.mode[value] }))}
                  onChange={(v) => updateForm("primaryMode", v)}
                />
              </Field>

              <Field label="Ton principal">
                <Select value={form.tonePrimary} onValueChange={(v) => updateForm("tonePrimary", v)}>
                  <SelectTrigger data-testid="select-tone-primary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONES.map((tone) => (
                      <SelectItem key={tone} value={tone} data-testid={`option-tone-primary-${tone}`}>
                        {t.onboarding.tone[tone]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Ton secondaire">
                <Select
                  value={form.toneSecondary}
                  onValueChange={(v) => updateForm("toneSecondary", v)}
                >
                  <SelectTrigger data-testid="select-tone-secondary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONES.map((tone) => (
                      <SelectItem key={tone} value={tone} data-testid={`option-tone-secondary-${tone}`}>
                        {t.onboarding.tone[tone]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label={t.onboarding.riskLevel.title}>
                <Segmented
                  value={form.riskLevel}
                  testIdPrefix="button-risk"
                  options={riskLevelEnum.map((value) => ({ value, label: t.onboarding.riskLevel[value] }))}
                  onChange={(v) => updateForm("riskLevel", v)}
                />
              </Field>

              <Field label="Genre de l'interlocuteur">
                <Segmented
                  value={form.interlocutorGender}
                  testIdPrefix="button-gender"
                  options={INTERLOCUTOR_GENDERS}
                  onChange={(v) => updateForm("interlocutorGender", v)}
                />
              </Field>

              <Field label={t.onboarding.limits.tuVous}>
                <Segmented
                  value={form.tuVous}
                  testIdPrefix="button-tuvous"
                  options={tuVousEnum.map((value) => ({ value, label: t.onboarding.limits[value] }))}
                  onChange={(v) => updateForm("tuVous", v)}
                />
              </Field>

              <Field label="Niveau de langage">
                <Segmented
                  value={form.formality}
                  testIdPrefix="button-formality"
                  options={FORMALITY}
                  onChange={(v) => updateForm("formality", v)}
                />
              </Field>

              <Field label="Durée de session par jour">
                <Select
                  value={String(form.dailySessionMinutes)}
                  onValueChange={(v) => updateForm("dailySessionMinutes", parseInt(v, 10))}
                >
                  <SelectTrigger data-testid="select-session-minutes">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SESSION_MINUTES.map((m) => (
                      <SelectItem key={m} value={String(m)} data-testid={`option-minutes-${m}`}>
                        {m} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="space-y-4 border-t pt-4">
                <ToggleRow
                  id="allow-sarcasm"
                  label={t.onboarding.limits.allowSarcasm}
                  checked={form.allowSarcasm}
                  onChange={(v) => updateForm("allowSarcasm", v)}
                  testId="switch-sarcasm"
                />
                <ToggleRow
                  id="allow-flirt"
                  label={t.onboarding.limits.allowExplicitFlirt}
                  checked={form.allowExplicitFlirt}
                  onChange={(v) => updateForm("allowExplicitFlirt", v)}
                  testId="switch-flirt"
                />
                <ToggleRow
                  id="allow-swearing"
                  label={t.onboarding.limits.allowSwearing}
                  checked={form.allowSwearing}
                  onChange={(v) => updateForm("allowSwearing", v)}
                  testId="switch-swearing"
                />
              </div>

              <Button
                className="w-full"
                onClick={() => saveProfile.mutate(form)}
                disabled={saveProfile.isPending}
                data-testid="button-save-preferences"
              >
                {saveProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enregistrer les préférences
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* ── Section: Abonnement & facturation ── */}
        <section>
          <SectionTitle>Abonnement & facturation</SectionTitle>

          <Card>
            <CardContent className="space-y-5 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Crown className="h-5 w-5" />
                </div>
                <div data-testid="text-subscription-status">
                  {tier === "premium" && <p className="font-semibold">Bagou Premium</p>}
                  {tier === "trial" && <p className="font-semibold">Essai gratuit en cours</p>}
                  {tier === "free" && <p className="font-semibold">Offre gratuite</p>}
                  <p className="text-sm text-muted-foreground">
                    {tier === "premium" &&
                      (status?.renewsAt
                        ? `Accès illimité. Renouvellement le ${new Date(status.renewsAt).toLocaleDateString("fr-FR")}.`
                        : "Accès illimité à tout l'entraînement.")}
                    {tier === "trial" &&
                      (status?.trialEndsAt
                        ? `Jusqu'au ${new Date(status.trialEndsAt).toLocaleDateString("fr-FR")}.`
                        : "Profite de l'accès illimité pendant ton essai.")}
                    {tier === "free" && "Passe en Premium pour t'entraîner sans limite."}
                  </p>
                </div>
              </div>

              {tier === "free" && status && (
                <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
                  <UsageBar
                    label="Cartes aujourd'hui"
                    used={status.usage.cards.used}
                    limit={status.usage.cards.limit}
                    testId="usage-cards"
                  />
                  <UsageBar
                    label="Simulation vocale cette semaine"
                    used={status.usage.vocal.used}
                    limit={status.usage.vocal.limit}
                    testId="usage-vocal"
                  />
                </div>
              )}

              {isPaid ? (
                <Button
                  className="w-full"
                  onClick={() => portal.mutate()}
                  disabled={portal.isPending}
                  data-testid="button-manage-subscription"
                >
                  {portal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Gérer mon abonnement
                </Button>
              ) : plansLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                </div>
              ) : plans.length === 0 ? (
                <p
                  className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground"
                  data-testid="text-no-plans"
                >
                  Les offres ne sont pas disponibles pour le moment. Reviens un peu plus tard.
                </p>
              ) : (
                <div className="space-y-2">
                  {plans.map((plan) => {
                    const recommended = plan.interval === "year";
                    return (
                      <div
                        key={plan.priceId}
                        className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
                          recommended ? "border-2 border-primary/40" : ""
                        }`}
                        data-testid={`card-plan-${plan.interval}`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">
                              {plan.interval === "year" ? "Annuel" : "Mensuel"}
                            </p>
                            {recommended && (
                              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                Le plus avantageux
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            <span className="text-base font-bold text-foreground">
                              {formatPrice(plan.unitAmount, plan.currency)}
                            </span>
                            {intervalLabel(plan.interval)}
                          </p>
                        </div>
                        <Button
                          onClick={() => checkout.mutate(plan.priceId)}
                          disabled={checkout.isPending}
                          data-testid={`button-checkout-${plan.interval}`}
                        >
                          {checkout.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Essai gratuit
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ── Section: Légal ── */}
        <section>
          <SectionTitle>Légal</SectionTitle>

          <Card>
            <CardContent className="flex flex-col divide-y p-0">
              <a
                href="/cgv"
                className="flex items-center justify-between px-4 py-3.5 text-sm font-medium hover-elevate active-elevate-2"
                data-testid="link-settings-cgv"
              >
                Conditions générales de vente et d'utilisation
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </a>
              <a
                href="/mentions-legales"
                className="flex items-center justify-between px-4 py-3.5 text-sm font-medium hover-elevate active-elevate-2"
                data-testid="link-settings-mentions"
              >
                Mentions légales
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </a>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2.5 ml-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
  testIdPrefix,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          data-testid={`${testIdPrefix}-${o.value}`}
          className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors hover-elevate active-elevate-2 ${
            value === o.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  onChange,
  testId,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="cursor-pointer">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} data-testid={testId} />
    </div>
  );
}

function UsageBar({
  label,
  used,
  limit,
  testId,
}: {
  label: string;
  used: number;
  limit: number | null;
  testId: string;
}) {
  const pct = limit && limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div data-testid={testId}>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {used}/{limit ?? "∞"}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="min-h-dvh bg-background p-4">
      <div className="mx-auto max-w-lg space-y-6 pt-10">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  );
}
