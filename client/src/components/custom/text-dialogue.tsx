import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Loader2,
  Target,
  Sparkles,
  Trophy,
  Volume2,
  Square,
  ArrowRight,
  PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { usePaywall } from "@/components/paywall-provider";
import { parseQuotaError } from "@/lib/quota";
import type { ParcoursCard } from "@/components/parcours/card-step";
import type { GlobalDynamic } from "@/components/parcours/vocal-step";
import type { InterlocutorGender } from "@shared/schema";

type Phase = "intro" | "chatting" | "thinking" | "ending";
type Msg = { role: "user" | "assistant"; content: string };

export function TextDialogue({
  card,
  profileId,
  initialGender = "femme",
  onComplete,
}: {
  card: ParcoursCard;
  profileId: number;
  initialGender?: InterlocutorGender;
  onComplete: (gd: GlobalDynamic | null, transcript: string) => void;
}) {
  const { showPaywall } = usePaywall();
  const [phase, setPhase] = useState<Phase>("intro");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [gender, setGender] = useState<InterlocutorGender>(initialGender);
  const [endGd, setEndGd] = useState<GlobalDynamic | null>(null);
  const [starting, setStarting] = useState(false);

  const sessionTokenRef = useRef<string | null>(null);
  const historyRef = useRef<Msg[]>([]);
  const turnRef = useRef(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const ttsRequestRef = useRef(0);
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null);
  const [ttsPlayingId, setTtsPlayingId] = useState<string | null>(null);

  const stopTts = useCallback(() => {
    ttsRequestRef.current += 1;
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    setTtsPlayingId(null);
    setTtsLoadingId(null);
  }, []);

  useEffect(() => () => stopTts(), [stopTts]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, phase]);

  const playTts = useCallback(
    async (text: string, id: string) => {
      if (ttsPlayingId === id || ttsLoadingId === id) {
        stopTts();
        return;
      }
      stopTts();
      const requestId = ttsRequestRef.current;
      const controller = new AbortController();
      ttsAbortRef.current = controller;
      setTtsLoadingId(id);
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, interlocutorGender: gender }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("tts");
        const blob = await res.blob();
        if (requestId !== ttsRequestRef.current) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        if (ttsAudioRef.current) ttsAudioRef.current.pause();
        ttsAudioRef.current = audio;
        if (ttsAbortRef.current === controller) ttsAbortRef.current = null;
        const cleanup = () => {
          URL.revokeObjectURL(url);
          if (ttsAudioRef.current === audio) ttsAudioRef.current = null;
          setTtsPlayingId((c) => (c === id ? null : c));
        };
        audio.onended = cleanup;
        audio.onerror = cleanup;
        setTtsLoadingId(null);
        setTtsPlayingId(id);
        await audio.play();
      } catch {
        if (requestId !== ttsRequestRef.current) return;
        setTtsLoadingId(null);
        setTtsPlayingId(null);
      }
    },
    [ttsPlayingId, ttsLoadingId, stopTts, gender],
  );

  const buildTranscript = () =>
    [
      `[Mise en situation] ${card.situation}`,
      ...historyRef.current.map((m) =>
        m.role === "user" ? `Toi : ${m.content}` : `${card.otherRole} : ${m.content}`,
      ),
    ].join("\n");

  const begin = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    historyRef.current = [];
    turnRef.current = 1;
    setMessages([]);
    try {
      const r = await apiRequest("POST", "/api/session/opening", {
        cardId: card.cardId,
        profileId,
        interlocutorGender: gender,
      });
      const od = await r.json();
      sessionTokenRef.current = od.sessionToken || null;
      const opening: string = od.openingLine || "";
      if (opening) {
        historyRef.current = [{ role: "assistant", content: opening }];
        setMessages([{ role: "assistant", content: opening }]);
      }
      setPhase("chatting");
    } catch (err) {
      const quota = parseQuotaError(err);
      if (quota) showPaywall(quota);
    } finally {
      setStarting(false);
    }
  }, [starting, card.cardId, profileId, gender, showPaywall]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || phase !== "chatting") return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setPhase("thinking");
    try {
      const res = await apiRequest("POST", "/api/session/dialogue-turn", {
        profileId,
        cardId: card.cardId,
        history: historyRef.current,
        userMessage: text,
        turnNumber: turnRef.current,
        interlocutorGender: gender,
        sessionToken: sessionTokenRef.current,
      });
      const data = await res.json();
      const reply: string = data.interlocutorReply || "...";
      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: text },
        { role: "assistant", content: reply },
      ];
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);

      if (data.isFinalTurn) {
        setEndGd(data.globalDynamic || null);
        setPhase("ending");
        return;
      }
      turnRef.current += 1;
      setPhase("chatting");
    } catch (err) {
      const quota = parseQuotaError(err);
      if (quota) {
        showPaywall(quota);
      }
      // Drop the optimistic user bubble so the view stays consistent with history.
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
      setPhase("chatting");
    }
  }, [input, phase, profileId, card.cardId, gender, showPaywall]);

  // INTRO
  if (phase === "intro") {
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md mx-auto">
        <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-3 text-center">
          Mise en situation · à l'écrit
        </p>
        <Card className="border-primary/15 bg-card/80 mb-4">
          <CardContent className="p-5 text-left">
            <p className="text-base leading-relaxed font-medium mb-3" data-testid="text-textdialogue-situation">
              {card.situation}
            </p>
            <div className="space-y-1.5 text-xs text-muted-foreground border-t border-border/50 pt-3">
              <p>
                <span className="font-semibold text-foreground/70">Ton rôle&nbsp;:</span> {card.speakerRole}
              </p>
              <p>
                <span className="font-semibold text-foreground/70">Face à toi&nbsp;:</span> {card.otherRole}
              </p>
              {card.relationship && (
                <p>
                  <span className="font-semibold text-foreground/70">Relation&nbsp;:</span> {card.relationship}
                </p>
              )}
              {card.stakes && (
                <p>
                  <span className="font-semibold text-foreground/70">Enjeu&nbsp;:</span> {card.stakes}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {card.userGoal && (
          <div className="flex items-start gap-2 rounded-xl bg-accent/10 border border-accent/20 px-3.5 py-2.5 mb-4">
            <Target className="w-4 h-4 text-accent shrink-0 mt-0.5" />
            <p className="text-sm text-left leading-snug">
              <span className="font-semibold">Ton objectif&nbsp;:</span> {card.userGoal}
            </p>
          </div>
        )}

        <p className="text-sm text-muted-foreground mb-4 text-center">
          L'autre te lance la conversation. À toi de répondre par écrit, réplique après réplique.
        </p>
        <div className="mb-4" data-testid="group-textdialogue-gender">
          <p className="text-xs font-semibold text-foreground/70 mb-2 text-center">Voix de ton interlocuteur</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={gender === "femme" ? "default" : "outline"}
              onClick={() => setGender("femme")}
              className="h-11 rounded-xl"
              data-testid="button-textdialogue-gender-femme"
            >
              Femme
            </Button>
            <Button
              type="button"
              variant={gender === "homme" ? "default" : "outline"}
              onClick={() => setGender("homme")}
              className="h-11 rounded-xl"
              data-testid="button-textdialogue-gender-homme"
            >
              Homme
            </Button>
          </div>
        </div>
        <Button
          onClick={begin}
          disabled={starting}
          className="w-full h-14 rounded-2xl text-base gap-2"
          data-testid="button-textdialogue-start"
        >
          {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <PenLine className="w-5 h-5" />}
          {starting ? "Préparation…" : "Commencer la conversation"}
        </Button>
      </motion.div>
    );
  }

  // ENDING
  if (phase === "ending") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md mx-auto text-center"
        data-testid="section-textdialogue-ending"
      >
        <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-5">
          <Sparkles className="w-8 h-8 text-accent" />
        </div>
        <h2 className="text-2xl font-bold mb-1.5" data-testid="text-textdialogue-ending-title">
          Conversation terminée.
        </h2>
        <p className="text-sm text-muted-foreground mb-5">Voici le mot de Bagou avant ton auto-évaluation.</p>

        {endGd?.feedback && (
          <Card className="border-accent/30 bg-accent/5 text-left mb-3">
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold text-accent uppercase tracking-wide flex items-center gap-1 mb-1.5">
                <Trophy className="w-3 h-3" /> Le mot de Bagou
              </p>
              <p className="text-sm leading-relaxed" data-testid="text-textdialogue-ending-feedback">
                {endGd.feedback}
              </p>
              {endGd.pattern && (
                <p className="text-xs text-muted-foreground mt-2">
                  <span className="font-semibold text-foreground/70">Ton réflexe&nbsp;:</span> {endGd.pattern}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Button
          onClick={() => onComplete(endGd, buildTranscript())}
          className="w-full h-14 rounded-2xl text-base gap-2 mt-1"
          data-testid="button-textdialogue-continue"
        >
          M'auto-évaluer <ArrowRight className="w-4 h-4" />
        </Button>
      </motion.div>
    );
  }

  // CHATTING / THINKING
  return (
    <div className="w-full max-w-md mx-auto h-full flex flex-col py-2">
      <div className="flex-shrink-0 flex items-start gap-2 rounded-xl bg-accent/10 border border-accent/20 px-3 py-2">
        <Target className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
        <p className="text-xs text-left leading-snug text-foreground/85">
          <span className="font-semibold">Objectif&nbsp;:</span> {card.userGoal || card.situation}
        </p>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto space-y-2.5 py-3 px-0.5"
        data-testid="list-textdialogue-conversation"
      >
        <AnimatePresence initial={false}>
          {messages.map((m, i) => {
            const id = `msg-${i}`;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card border border-border rounded-bl-md"
                  }`}
                  data-testid={`bubble-textdialogue-${m.role}-${i}`}
                >
                  {m.role === "assistant" ? (
                    <div className="flex items-start gap-2">
                      <span className="flex-1">{m.content}</span>
                      <button
                        type="button"
                        onClick={() => playTts(m.content, id)}
                        disabled={ttsLoadingId === id}
                        className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-accent disabled:opacity-60"
                        data-testid={`button-textdialogue-listen-${i}`}
                        aria-label={ttsPlayingId === id ? "Arrêter la lecture" : "Écouter"}
                      >
                        {ttsLoadingId === id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : ttsPlayingId === id ? (
                          <Square className="w-3.5 h-3.5 fill-current" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </motion.div>
            );
          })}
          {phase === "thinking" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
              data-testid="status-textdialogue-thinking"
            >
              <div className="bg-card border border-border rounded-2xl rounded-bl-md px-3.5 py-2.5">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-shrink-0 flex items-end gap-2 pt-1">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Écris ta réplique…"
          className="resize-none text-base min-h-[52px] max-h-[120px] rounded-xl bg-card/60"
          disabled={phase === "thinking"}
          data-testid="textarea-textdialogue-input"
        />
        <Button
          onClick={send}
          disabled={phase === "thinking" || !input.trim()}
          className="h-[52px] w-[52px] rounded-xl shrink-0"
          size="icon"
          data-testid="button-textdialogue-send"
        >
          {phase === "thinking" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </Button>
      </div>
    </div>
  );
}
