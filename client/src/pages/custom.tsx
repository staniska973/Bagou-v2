import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Sparkles,
  Plus,
  Loader2,
  Mic,
  PenLine,
  Trash2,
  Crown,
  Lock,
  ThumbsDown,
  Minus,
  ThumbsUp,
  CheckCircle2,
  Quote,
  Target,
  Wand2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { VocalStep, type GlobalDynamic } from "@/components/parcours/vocal-step";
import { TextDialogue } from "@/components/custom/text-dialogue";
import type { ParcoursCard, Rating } from "@/components/parcours/card-step";
import type { InterlocutorGender } from "@shared/schema";

interface CustomCard {
  cardId: string;
  customTitle: string | null;
  situation: string;
  userGoal: string;
  speakerRole: string;
  otherRole: string;
  relationship?: string | null;
  stakes?: string | null;
  difficulty: string;
  themeId: string;
  subthemeId?: string | null;
  channel?: string | null;
}

interface CustomCardDraft {
  customTitle: string;
  situation: string;
  speakerRole: string;
  otherRole: string;
  relationship: string;
  stakes: string;
  userGoal: string;
  intent: string;
  targetVibe: string;
  constraints: string[];
  tags: string[];
  antiPatterns: string[];
  openingLine: string;
}

type View = "list" | "compose" | "practice";
type PracticeMode = "choose" | "vocal" | "text" | "rate";

const OTHER_ROLE_CHIPS = [
  "Mon père",
  "Ma mère",
  "Mon/ma partenaire",
  "Mon patron",
  "Un·e collègue",
  "Un·e ami·e",
  "Un client",
  "Un proche",
];
const MOOD_CHIPS = [
  "Calme",
  "À cran",
  "Colérique",
  "Fermé·e",
  "Sur la défensive",
  "Condescendant·e",
  "Anxieux·se",
  "Distant·e",
];
const GOAL_CHIPS = [
  "Poser une limite",
  "Dire non",
  "Me faire respecter",
  "Exprimer un besoin",
  "Demander un changement",
  "Faire passer mon message",
];

const RATINGS = [
  { key: "hard" as const, label: "Difficile", Icon: ThumbsDown, base: "border-destructive/40 text-destructive", fill: "bg-destructive text-white border-destructive" },
  { key: "medium" as const, label: "Moyen", Icon: Minus, base: "border-amber-500/40 text-amber-600 dark:text-amber-400", fill: "bg-amber-500 text-white border-amber-500" },
  { key: "easy" as const, label: "Maîtrisé", Icon: ThumbsUp, base: "border-accent/50 text-accent", fill: "bg-accent text-white border-accent" },
];

function toParcoursCard(c: CustomCard): ParcoursCard {
  return {
    cardId: c.cardId,
    situation: c.situation,
    userGoal: c.userGoal,
    difficulty: c.difficulty,
    themeId: c.themeId,
    subthemeId: c.subthemeId ?? undefined,
    channel: c.channel ?? undefined,
    speakerRole: c.speakerRole,
    otherRole: c.otherRole,
    relationship: c.relationship ?? undefined,
    stakes: c.stakes ?? undefined,
  };
}

export default function Custom() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { data: sub, isLoading: subLoading } = useSubscription();

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

  useEffect(() => {
    if (!profileLoading && profile === null) navigate("/onboarding");
  }, [profileLoading, profile, navigate]);

  const isPremium = !!sub?.isPremium;

  if (subLoading || profileLoading || !profile) {
    return (
      <div className="min-h-dvh bg-background p-4">
        <div className="max-w-lg mx-auto space-y-4 pt-10">
          <Skeleton className="w-48 h-7" />
          <Skeleton className="w-full h-24 rounded-xl" />
          <Skeleton className="w-full h-24 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!isPremium) {
    return <PremiumGate onBack={() => navigate("/")} onUpgrade={() => navigate("/abonnement")} />;
  }

  return <CustomInner profileId={profile.id} interlocutorGender={profile.interlocutorGender ?? "femme"} />;
}

function PremiumGate({ onBack, onUpgrade }: { onBack: () => void; onUpgrade: () => void }) {
  return (
    <div className="min-h-dvh bg-gradient-to-br from-background via-background to-primary/5">
      <div className="max-w-lg mx-auto px-4 pt-4">
        <Button variant="ghost" size="icon" className="-ml-2" onClick={onBack} data-testid="button-custom-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
      </div>
      <div className="max-w-lg mx-auto px-4 pt-6 pb-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 text-primary flex items-center justify-center mx-auto mb-4">
            <Crown className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2" data-testid="text-custom-gate-title">
            Mode personnalisé
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            Invente ta propre situation, Bagou la transforme en exercice sur mesure que tu peux rejouer à l'oral
            comme à l'écrit. C'est réservé aux abonnés Premium.
          </p>
        </motion.div>

        <Card className="border-primary/20 bg-card/80 mb-5">
          <CardContent className="p-5 space-y-3">
            {[
              "Remplis un mini-formulaire : Bagou transforme ta scène en exercice sur mesure.",
              "Ta situation est enregistrée et entre dans tes révisions.",
              "Entraîne-toi dessus à l'oral ou à l'écrit, autant de fois que tu veux.",
            ].map((t, i) => (
              <div key={i} className="flex items-start gap-2.5" data-testid={`text-custom-gate-benefit-${i}`}>
                <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <p className="text-sm leading-relaxed">{t}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Button onClick={onUpgrade} className="w-full h-14 rounded-2xl text-base gap-2" data-testid="button-custom-upgrade">
          <Crown className="w-5 h-5" /> Passer en Premium
        </Button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="w-3 h-3" /> Fonctionnalité Premium
        </p>
      </div>
    </div>
  );
}

function CustomInner({ profileId, interlocutorGender }: { profileId: number; interlocutorGender: InterlocutorGender }) {
  const [, navigate] = useLocation();
  const [view, setView] = useState<View>("list");
  const [practiceCard, setPracticeCard] = useState<ParcoursCard | null>(null);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("choose");
  const transcriptRef = useRef<string>("");

  const { data: cards, isLoading: cardsLoading } = useQuery<CustomCard[]>({
    queryKey: ["/api/custom-cards"],
  });

  const startPractice = (c: CustomCard) => {
    setPracticeCard(toParcoursCard(c));
    setPracticeMode("choose");
    setView("practice");
  };

  const backToList = () => {
    setPracticeCard(null);
    setPracticeMode("choose");
    setView("list");
  };

  if (view === "compose") {
    return <ComposerPanel profileId={profileId} onCancel={() => setView("list")} onSaved={() => setView("list")} />;
  }

  if (view === "practice" && practiceCard) {
    return (
      <PracticePanel
        card={practiceCard}
        profileId={profileId}
        interlocutorGender={interlocutorGender}
        mode={practiceMode}
        setMode={setPracticeMode}
        transcriptRef={transcriptRef}
        onExit={backToList}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-background via-background to-primary/5">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b px-4 py-2">
        <div className="max-w-lg mx-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" className="-ml-2" onClick={() => navigate("/")} data-testid="button-custom-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-1.5">
            <Wand2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold">Mode personnalisé</span>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 pb-10">
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold tracking-tight">Tes situations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crée tes propres scènes et entraîne-toi dessus à l'oral ou à l'écrit.
          </p>
        </motion.div>

        <Button
          onClick={() => setView("compose")}
          className="w-full h-14 rounded-2xl text-base gap-2 mt-5"
          data-testid="button-custom-create"
        >
          <Plus className="w-5 h-5" /> Créer une situation
        </Button>

        <div className="mt-6 space-y-2.5">
          {cardsLoading ? (
            <>
              <Skeleton className="w-full h-20 rounded-xl" />
              <Skeleton className="w-full h-20 rounded-xl" />
            </>
          ) : !cards || cards.length === 0 ? (
            <div className="text-center py-10" data-testid="text-custom-empty">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3 text-muted-foreground">
                <Sparkles className="w-6 h-6" />
              </div>
              <p className="text-sm text-muted-foreground">
                Aucune situation pour l'instant.
                <br />
                Crée ta première scène pour commencer.
              </p>
            </div>
          ) : (
            cards.map((c) => (
              <CustomCardRow key={c.cardId} card={c} onPractice={() => startPractice(c)} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function CustomCardRow({ card, onPractice }: { card: CustomCard; onPractice: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    try {
      await apiRequest("DELETE", `/api/custom-cards/${card.cardId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/custom-cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <Card className="overflow-hidden" data-testid={`card-custom-${card.cardId}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Quote className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight" data-testid={`text-custom-title-${card.cardId}`}>
              {card.customTitle || "Situation personnalisée"}
            </p>
            <p className="text-xs text-muted-foreground leading-snug mt-1 line-clamp-2">{card.situation}</p>
          </div>
        </div>

        {confirming ? (
          <div className="flex gap-2 mt-3">
            <Button
              variant="destructive"
              className="flex-1 h-10 rounded-xl gap-1.5"
              onClick={remove}
              disabled={deleting}
              data-testid={`button-custom-confirm-delete-${card.cardId}`}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Supprimer
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-10 rounded-xl"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              data-testid={`button-custom-cancel-delete-${card.cardId}`}
            >
              Annuler
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 mt-3">
            <Button
              className="flex-1 h-10 rounded-xl gap-1.5"
              onClick={onPractice}
              data-testid={`button-custom-practice-${card.cardId}`}
            >
              <Sparkles className="w-4 h-4" /> S'entraîner
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-xl text-muted-foreground"
              onClick={() => setConfirming(true)}
              data-testid={`button-custom-delete-${card.cardId}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChipRow({
  prefix,
  options,
  value,
  onSelect,
}: {
  prefix: string;
  options: string[];
  value: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt, i) => {
        const active = value.trim().toLowerCase() === opt.toLowerCase();
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(active ? "" : opt)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground/80 border-border hover-elevate active-elevate-2"
            }`}
            data-testid={`chip-${prefix}-${i}`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-sm font-semibold text-foreground">{label}</label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function ComposerPanel({
  profileId,
  onCancel,
  onSaved,
}: {
  profileId: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState("");
  const [otherRole, setOtherRole] = useState("");
  const [mood, setMood] = useState("");
  const [userGoal, setUserGoal] = useState("");
  const [relationship, setRelationship] = useState("");
  const [stakes, setStakes] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState<CustomCardDraft | null>(null);
  const [title, setTitle] = useState("");
  const [scene, setScene] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCompose =
    description.trim().length > 0 && otherRole.trim().length > 0 && userGoal.trim().length > 0;

  const compose = async () => {
    if (!canCompose || composing) return;
    setComposing(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/custom/compose", {
        profileId,
        description: description.trim(),
        otherRole: otherRole.trim(),
        relationship: relationship.trim() || undefined,
        mood: mood.trim() || undefined,
        stakes: stakes.trim() || undefined,
        userGoal: userGoal.trim(),
      });
      const data = await res.json();
      const d: CustomCardDraft = data.draft;
      setDraft(d);
      setTitle(d.customTitle);
      setScene(d.situation);
    } catch {
      setError("Bagou n'a pas pu créer la situation. Réessaie dans un instant.");
    } finally {
      setComposing(false);
    }
  };

  const save = async () => {
    if (!draft || saving) return;
    if (!title.trim() || !scene.trim()) {
      setError("Donne un titre et une description à ta situation.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiRequest("POST", "/api/custom-cards", {
        profileId,
        draft: { ...draft, customTitle: title.trim(), situation: scene.trim() },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/custom-cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      onSaved();
    } catch {
      setError("Impossible d'enregistrer la situation. Réessaie.");
      setSaving(false);
    }
  };

  return (
    <div className="h-dvh flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
      <div className="flex-shrink-0 px-4 pt-4 pb-2">
        <div className="max-w-lg mx-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2"
            onClick={draft ? () => setDraft(null) : onCancel}
            data-testid="button-composer-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-1.5">
            <Wand2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold">{draft ? "Valide ta situation" : "Crée ta situation"}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4">
        <div className="max-w-lg mx-auto py-4">
          {draft ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="flex items-center gap-1.5 text-accent">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">Ta situation est prête</span>
              </div>
              <p className="text-sm text-muted-foreground -mt-1">
                Relis, ajuste si besoin, puis enregistre. Tu pourras t'entraîner dessus tout de suite.
              </p>

              <Field label="Titre">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="rounded-xl bg-card"
                  data-testid="input-composer-title"
                />
              </Field>

              <Field label="La scène">
                <Textarea
                  value={scene}
                  onChange={(e) => setScene(e.target.value)}
                  rows={4}
                  className="resize-none text-sm rounded-xl bg-card"
                  data-testid="textarea-composer-scene-edit"
                />
              </Field>

              <Card className="border-border/60 bg-card/60">
                <CardContent className="p-4 space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-start gap-1.5">
                    <Target className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                    <span data-testid="text-composer-goal">
                      <span className="font-semibold text-foreground/70">Objectif&nbsp;:</span> {draft.userGoal}
                    </span>
                  </div>
                  <p>
                    <span className="font-semibold text-foreground/70">Face à toi&nbsp;:</span> {draft.otherRole}
                  </p>
                  {draft.relationship && (
                    <p>
                      <span className="font-semibold text-foreground/70">Relation&nbsp;:</span> {draft.relationship}
                    </p>
                  )}
                  {draft.stakes && (
                    <p>
                      <span className="font-semibold text-foreground/70">En jeu&nbsp;:</span> {draft.stakes}
                    </p>
                  )}
                </CardContent>
              </Card>

              {error && (
                <p className="text-xs text-destructive text-center" data-testid="text-composer-error">
                  {error}
                </p>
              )}
            </motion.div>
          ) : (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Crée ta situation</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Décris ta scène comme tu la vis. Bagou la transforme en exercice sur mesure.
                </p>
              </div>

              <Field label="La scène" hint="Qu'est-ce qui se passe, et où ?">
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Ex : Mon père gère mal le TDAH de mon frère. Je veux lui en parler ce week-end sans que ça finisse en dispute."
                  className="resize-none text-base rounded-xl bg-card/60"
                  data-testid="textarea-composer-scene"
                />
              </Field>

              <Field label="En face de toi" hint="Tu parles à qui ?">
                <Input
                  value={otherRole}
                  onChange={(e) => setOtherRole(e.target.value)}
                  placeholder="Ex : mon père"
                  className="rounded-xl bg-card/60"
                  data-testid="input-composer-other"
                />
                <ChipRow prefix="other" options={OTHER_ROLE_CHIPS} value={otherRole} onSelect={setOtherRole} />
              </Field>

              <Field label="Son état d'esprit" hint="Comment elle arrive dans la scène (facultatif)">
                <ChipRow prefix="mood" options={MOOD_CHIPS} value={mood} onSelect={setMood} />
              </Field>

              <Field label="Ton objectif" hint="Qu'est-ce que tu veux obtenir ?">
                <Input
                  value={userGoal}
                  onChange={(e) => setUserGoal(e.target.value)}
                  placeholder="Ex : qu'il comprenne mon point de vue"
                  className="rounded-xl bg-card/60"
                  data-testid="input-composer-goal"
                />
                <ChipRow prefix="goal" options={GOAL_CHIPS} value={userGoal} onSelect={setUserGoal} />
              </Field>

              <div className="border-t border-border/50 pt-3">
                <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
                  data-testid="button-composer-details"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${showDetails ? "rotate-180" : ""}`} />
                  Ajouter des détails (facultatif)
                </button>
                {showDetails && (
                  <div className="space-y-5 mt-4">
                    <Field label="Votre relation" hint="Quel lien, depuis quand">
                      <Input
                        value={relationship}
                        onChange={(e) => setRelationship(e.target.value)}
                        placeholder="Ex : mon père, depuis toujours"
                        className="rounded-xl bg-card/60"
                        data-testid="input-composer-relationship"
                      />
                    </Field>
                    <Field label="Ce qui est en jeu" hint="Ce que tu risques si ça tourne mal">
                      <Input
                        value={stakes}
                        onChange={(e) => setStakes(e.target.value)}
                        placeholder="Ex : abîmer la relation"
                        className="rounded-xl bg-card/60"
                        data-testid="input-composer-stakes"
                      />
                    </Field>
                  </div>
                )}
              </div>

              {error && (
                <p className="text-xs text-destructive text-center" data-testid="text-composer-error">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 border-t bg-background/80 backdrop-blur-md px-4 py-3">
        <div className="max-w-lg mx-auto">
          {draft ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-12 rounded-xl px-4"
                onClick={() => setDraft(null)}
                disabled={saving}
                data-testid="button-composer-edit"
              >
                Modifier
              </Button>
              <Button
                className="flex-1 h-12 rounded-xl gap-2"
                onClick={save}
                disabled={saving}
                data-testid="button-composer-save"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Enregistrer la situation
              </Button>
            </div>
          ) : (
            <Button
              className="w-full h-14 rounded-2xl text-base gap-2"
              onClick={compose}
              disabled={!canCompose || composing}
              data-testid="button-composer-create"
            >
              {composing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Bagou prépare ta scène…
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5" /> Créer ma situation
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PracticePanel({
  card,
  profileId,
  interlocutorGender,
  mode,
  setMode,
  transcriptRef,
  onExit,
}: {
  card: ParcoursCard;
  profileId: number;
  interlocutorGender: InterlocutorGender;
  mode: PracticeMode;
  setMode: (m: PracticeMode) => void;
  transcriptRef: React.MutableRefObject<string>;
  onExit: () => void;
}) {
  const onDialogueComplete = (_gd: GlobalDynamic | null, transcript: string) => {
    transcriptRef.current = transcript;
    setMode("rate");
  };

  if (mode === "rate") {
    return (
      <RatePanel card={card} profileId={profileId} transcriptRef={transcriptRef} onDone={onExit} />
    );
  }

  if (mode === "vocal" || mode === "text") {
    return (
      <div className="h-dvh flex flex-col bg-gradient-to-b from-background via-background to-primary/10">
        <div className="flex-shrink-0 px-4 pt-4 pb-2">
          <div className="max-w-lg mx-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" className="-ml-2" onClick={onExit} data-testid="button-practice-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-1 text-xs font-medium text-primary">
              {mode === "vocal" ? <Mic className="w-3.5 h-3.5" /> : <PenLine className="w-3.5 h-3.5" />}
              {mode === "vocal" ? "Oral" : "Écrit"}
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 overflow-hidden">
          {mode === "vocal" ? (
            <VocalStep
              key={`vocal-${card.cardId}`}
              card={card}
              profileId={profileId}
              initialGender={interlocutorGender}
              isLast
              onComplete={onDialogueComplete}
            />
          ) : (
            <TextDialogue
              key={`text-${card.cardId}`}
              card={card}
              profileId={profileId}
              initialGender={interlocutorGender}
              onComplete={onDialogueComplete}
            />
          )}
        </div>
      </div>
    );
  }

  // mode === "choose"
  return (
    <div className="min-h-dvh bg-gradient-to-br from-background via-background to-primary/5">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b px-4 py-2">
        <div className="max-w-lg mx-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" className="-ml-2" onClick={onExit} data-testid="button-practice-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <span className="text-sm font-bold">S'entraîner</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 pb-10">
        <Card className="border-primary/15 bg-card/80 mb-5">
          <CardContent className="p-5">
            <div className="flex items-start gap-2.5">
              <Quote className="w-4 h-4 text-primary/50 shrink-0 mt-1" />
              <p className="text-base leading-relaxed font-medium" data-testid="text-practice-situation">
                {card.situation}
              </p>
            </div>
            {card.userGoal && (
              <div className="mt-3 pt-3 border-t border-border/50 flex items-start gap-1.5 text-xs">
                <Target className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground/70">Objectif&nbsp;:</span> {card.userGoal}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-sm font-medium text-foreground/80 mb-3 ml-0.5">Comment veux-tu t'entraîner&nbsp;?</p>
        <div className="grid grid-cols-2 gap-3">
          <Card
            className="cursor-pointer hover-elevate active-elevate-2 border-2 border-primary/20"
            onClick={() => setMode("vocal")}
            data-testid="button-practice-vocal"
          >
            <CardContent className="p-5 flex flex-col items-center text-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
                <Mic className="w-6 h-6" />
              </div>
              <p className="font-semibold">À l'oral</p>
              <p className="text-[11px] text-muted-foreground leading-snug">Parle à voix haute, en live.</p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover-elevate active-elevate-2 border-2 border-accent/20"
            onClick={() => setMode("text")}
            data-testid="button-practice-text"
          >
            <CardContent className="p-5 flex flex-col items-center text-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-accent/15 text-accent flex items-center justify-center">
                <PenLine className="w-6 h-6" />
              </div>
              <p className="font-semibold">À l'écrit</p>
              <p className="text-[11px] text-muted-foreground leading-snug">Réponds par messages écrits.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function RatePanel({
  card,
  profileId,
  transcriptRef,
  onDone,
}: {
  card: ParcoursCard;
  profileId: number;
  transcriptRef: React.MutableRefObject<string>;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<Rating | null>(null);
  const [rating, setRating] = useState(false);
  const [done, setDone] = useState(false);

  const rate = async (r: Rating) => {
    if (rating) return;
    setSelected(r);
    setRating(true);
    try {
      await Promise.all([
        apiRequest("POST", "/api/flashcards/rate", {
          profileId,
          sessionId: null,
          cardId: card.cardId,
          rating: r,
          userAnswer: transcriptRef.current,
        }),
        new Promise((res) => setTimeout(res, 420)),
      ]);
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/flashcards/due"] });
      setDone(true);
    } catch {
      setSelected(null);
      setRating(false);
    }
  };

  if (done) {
    return (
      <div className="h-dvh flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/10 p-5">
        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-accent" />
          </div>
          <h2 className="text-2xl font-bold mb-1.5" data-testid="text-rate-done">C'est noté.</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Cette situation reviendra au bon moment dans tes révisions.
          </p>
          <Button onClick={onDone} className="w-full h-12 rounded-xl text-base" data-testid="button-rate-done">
            Retour à mes situations
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-5">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-sm w-full">
        <p className="text-center text-sm text-muted-foreground mb-1">Sois honnête&nbsp;:</p>
        <h2 className="text-xl font-bold text-center mb-5" data-testid="text-rate-title">
          Tu maîtrisais cette situation&nbsp;?
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {RATINGS.map(({ key, label, Icon, base, fill }) => {
            const isSel = selected === key;
            return (
              <motion.button
                key={key}
                type="button"
                onClick={() => rate(key)}
                disabled={rating}
                whileTap={{ scale: 0.94 }}
                className={`flex flex-col items-center justify-center h-auto py-3 gap-1.5 rounded-xl border font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 ${
                  isSel ? fill : `bg-card hover-elevate active-elevate-2 ${base}`
                } ${rating && !isSel ? "opacity-40" : ""}`}
                data-testid={`button-rate-${key}`}
              >
                {isSel ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                <span className="text-xs font-medium">{label}</span>
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
