import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  Send,
  Eye,
  CheckCircle2,
  MessageCircle,
  Loader2,
  Lightbulb,
  ThumbsDown,
  Minus,
  ThumbsUp,
  Sparkles,
  User,
  Quote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";

export type Rating = "hard" | "medium" | "easy";

export interface ParcoursCard {
  cardId: string;
  situation: string;
  userGoal: string;
  difficulty: string;
  themeId: string;
  subthemeId?: string;
  channel?: string;
  speakerRole: string;
  otherRole: string;
  relationship?: string;
  stakes?: string;
}

interface AnswerResult {
  modelAnswer: string;
  variants: { safe: string; medium: string; bold: string };
  rubric: string[];
  feedback: {
    pass: boolean;
    ratingSuggested: Rating;
    oneFix: string;
    feedback: string;
  };
}

type Phase = "formulate" | "loading" | "reveal";

const diffLabel = (d: string) =>
  d === "n1" ? "Facile" : d === "n2" ? "Moyen" : d === "n3" ? "Difficile" : d;

export function CardStep({
  card,
  profileId,
  sessionId,
  onRated,
}: {
  card: ParcoursCard;
  profileId: number;
  sessionId: number | null;
  onRated: (rating: Rating, oneFix: string, userAnswer: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("formulate");
  const [userAnswer, setUserAnswer] = useState("");
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [isRating, setIsRating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(
    () => () => {
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const submitAnswer = useCallback(
    async (skip = false) => {
      if (phase !== "formulate") return;
      const answer = skip ? "" : userAnswer.trim();
      if (!skip && !answer) return;
      setPhase("loading");
      try {
        const res = await apiRequest("POST", "/api/flashcards/generate-answer", {
          profileId,
          cardId: card.cardId,
          userAnswer: answer || "(l'utilisateur a préféré voir directement la réponse)",
        });
        const data: AnswerResult = await res.json();
        setResult(data);
        setPhase("reveal");
      } catch {
        setPhase("formulate");
      }
    },
    [phase, userAnswer, profileId, card.cardId],
  );

  const rate = async (rating: Rating) => {
    if (isRating) return;
    setIsRating(true);
    try {
      await apiRequest("POST", "/api/flashcards/rate", {
        profileId,
        sessionId,
        cardId: card.cardId,
        rating,
        userAnswer,
      });
      onRated(rating, result?.feedback?.oneFix || "", userAnswer);
    } catch {
      /* ignore */
    } finally {
      setIsRating(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);
        const blob = new Blob(chunks, { type: mimeType });
        try {
          const fd = new FormData();
          fd.append("audio", blob, `rec.${mimeType.includes("webm") ? "webm" : "mp4"}`);
          const r = await fetch("/api/transcribe", { method: "POST", body: fd });
          if (r.ok) {
            const { text } = await r.json();
            if (text) setUserAnswer((p) => (p ? p + " " + text : text));
          }
        } catch {
          /* ignore */
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      console.error("Mic denied:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={phase}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -14 }}
        transition={{ duration: 0.22 }}
      >
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          <Badge variant="secondary" className="text-[10px]" data-testid="badge-card-theme">
            {card.themeId}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {diffLabel(card.difficulty)}
          </Badge>
          {card.channel && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {card.channel}
            </Badge>
          )}
        </div>

        <Card className="border-primary/15 bg-card/80 backdrop-blur-sm overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-start gap-2.5">
              <Quote className="w-4 h-4 text-primary/50 shrink-0 mt-1" />
              <p className="text-base leading-relaxed font-medium" data-testid="text-card-situation">
                {card.situation}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border/60 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
              <span>
                <span className="font-semibold text-foreground/70">Toi&nbsp;:</span> {card.speakerRole}
              </span>
              <span className="text-muted-foreground/30">•</span>
              <span>
                <span className="font-semibold text-foreground/70">Face à&nbsp;:</span> {card.otherRole}
              </span>
            </div>
            {card.userGoal && (
              <div className="mt-2 flex items-start gap-1.5 text-xs">
                <Sparkles className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground/70">Objectif&nbsp;:</span> {card.userGoal}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {(phase === "formulate" || phase === "loading") && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
            <p className="text-sm font-medium text-foreground/80 mb-2 ml-1">Qu'est-ce que tu réponds&nbsp;?</p>
            <div className="relative">
              <Textarea
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="Écris ta réplique, ou parle au micro…"
                className="resize-none text-base min-h-[110px] rounded-xl pr-12 bg-card/60"
                disabled={phase === "loading"}
                data-testid="textarea-card-answer"
              />
              <Button
                variant={isRecording ? "destructive" : "ghost"}
                size="icon"
                className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-lg"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={phase === "loading"}
                data-testid="button-card-mic"
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
            </div>
            {isRecording && (
              <p className="text-[11px] text-red-500 animate-pulse mt-1.5 ml-1">● Enregistrement… appuie pour arrêter</p>
            )}

            <div className="flex gap-2 mt-3">
              <Button
                variant="outline"
                className="flex-1 h-12 rounded-xl gap-1.5"
                onClick={() => submitAnswer(true)}
                disabled={phase === "loading"}
                data-testid="button-card-reveal"
              >
                <Eye className="w-4 h-4" /> Voir la réponse
              </Button>
              <Button
                className="flex-1 h-12 rounded-xl gap-1.5"
                onClick={() => submitAnswer(false)}
                disabled={phase === "loading" || !userAnswer.trim()}
                data-testid="button-card-submit"
              >
                {phase === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {phase === "loading" ? "Analyse…" : "Valider"}
              </Button>
            </div>
          </motion.div>
        )}

        {phase === "reveal" && result && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 space-y-3"
            data-testid="section-card-reveal"
          >
            {userAnswer.trim() && (
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3 h-3 text-primary" />
                </div>
                <div
                  className="bg-primary/5 border border-primary/15 rounded-xl px-3 py-2 text-sm flex-1"
                  data-testid="text-card-user-answer"
                >
                  {userAnswer}
                </div>
              </div>
            )}

            {result.feedback?.feedback && (
              <div className="bg-muted/50 rounded-xl px-3.5 py-2.5 flex items-start gap-2">
                {result.feedback.pass ? (
                  <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                ) : (
                  <MessageCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <p className="text-sm leading-relaxed flex-1" data-testid="text-card-feedback">
                  {result.feedback.feedback}
                </p>
              </div>
            )}

            <Card className="border-accent/30 bg-accent/5">
              <CardContent className="p-4">
                <p className="text-[10px] font-semibold text-accent uppercase tracking-wide flex items-center gap-1 mb-2">
                  <Lightbulb className="w-3 h-3" /> La réponse Bagou
                </p>
                <p className="text-base font-medium leading-relaxed" data-testid="text-card-model-answer">
                  {result.modelAnswer}
                </p>
              </CardContent>
            </Card>

            {result.variants && (
              <div className="space-y-1.5">
                {[
                  { label: "Prudente", text: result.variants.safe },
                  { label: "Équilibrée", text: result.variants.medium },
                  { label: "Audacieuse", text: result.variants.bold },
                ]
                  .filter((v) => v.text)
                  .map((v) => (
                    <div
                      key={v.label}
                      className="text-sm border rounded-xl px-3 py-2 bg-card/50"
                      data-testid={`text-card-variant-${v.label}`}
                    >
                      <span className="font-semibold text-muted-foreground text-xs">{v.label} · </span>
                      {v.text}
                    </div>
                  ))}
              </div>
            )}

            <div className="pt-2">
              <p className="text-xs text-center text-muted-foreground mb-2">Tu maîtrisais cette réponse&nbsp;?</p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  onClick={() => rate("hard")}
                  disabled={isRating}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 flex flex-col h-auto py-2.5 gap-1 rounded-xl"
                  data-testid="button-card-rate-hard"
                >
                  <ThumbsDown className="w-4 h-4" />
                  <span className="text-[11px] font-medium">Difficile</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => rate("medium")}
                  disabled={isRating}
                  className="border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 flex flex-col h-auto py-2.5 gap-1 rounded-xl"
                  data-testid="button-card-rate-medium"
                >
                  <Minus className="w-4 h-4" />
                  <span className="text-[11px] font-medium">Moyen</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => rate("easy")}
                  disabled={isRating}
                  className="border-accent/50 text-accent hover:bg-accent/10 flex flex-col h-auto py-2.5 gap-1 rounded-xl"
                  data-testid="button-card-rate-easy"
                >
                  <ThumbsUp className="w-4 h-4" />
                  <span className="text-[11px] font-medium">Maîtrisé</span>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
