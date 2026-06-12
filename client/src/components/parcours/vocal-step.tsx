import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import type { ParcoursCard } from "./card-step";

export interface GlobalDynamic {
  feedback: string;
  rating: "hard" | "medium" | "easy";
  pattern: string;
}

type Phase = "intro" | "speaking" | "listening" | "thinking" | "ending";

const SESSION_SECONDS = 120;

export function VocalStep({
  card,
  profileId,
  onComplete,
}: {
  card: ParcoursCard;
  profileId: number;
  onComplete: (gd: GlobalDynamic | null, transcript: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [caption, setCaption] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [micError, setMicError] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const turnRef = useRef(1);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startingRef = useRef(false);
  const doneRef = useRef(false);

  const cleanupAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  };
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(
    () => () => {
      cleanupAudio();
      stopTimer();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const buildTranscript = () =>
    [
      `[Mise en situation] ${card.situation}`,
      ...historyRef.current.map((m) =>
        m.role === "user" ? `Toi : ${m.content}` : `${card.otherRole} : ${m.content}`,
      ),
    ].join("\n");

  const playTTS = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      cleanupAudio();
      fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
        .then((r) => {
          if (!r.ok) throw new Error("tts");
          return r.blob();
        })
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          const end = () => {
            URL.revokeObjectURL(url);
            if (audioRef.current === audio) audioRef.current = null;
            resolve();
          };
          audio.onended = end;
          audio.onerror = end;
          audio.play().catch(end);
        })
        .catch(() => resolve());
    });
  }, []);

  const ensureStream = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current) return streamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      return stream;
    } catch {
      setMicError(true);
      return null;
    }
  }, []);

  const conclude = useCallback(
    (gd: GlobalDynamic | null) => {
      if (doneRef.current) return;
      doneRef.current = true;
      stopTimer();
      cleanupAudio();
      setPhase("ending");
      onComplete(gd, buildTranscript());
    },
    [onComplete],
  );

  const submitUserMessage = useCallback(
    async (text: string) => {
      setCaption("");
      setPhase("thinking");

      const overTime = Date.now() - startTimeRef.current >= (SESSION_SECONDS - 8) * 1000;
      const turnToSend = overTime ? 999 : turnRef.current;

      try {
        const res = await apiRequest("POST", "/api/session/dialogue-turn", {
          profileId,
          cardId: card.cardId,
          history: historyRef.current,
          userMessage: text,
          turnNumber: turnToSend,
        });
        const data = await res.json();

        historyRef.current = [
          ...historyRef.current,
          { role: "user", content: text },
          { role: "assistant", content: data.interlocutorReply },
        ];

        if (data.isFinalTurn || overTime) {
          setCaption(data.interlocutorReply);
          await playTTS(data.interlocutorReply);
          conclude(data.globalDynamic || null);
          return;
        }

        turnRef.current += 1;
        setCaption(data.interlocutorReply);
        setPhase("speaking");
        await playTTS(data.interlocutorReply);
        startListening();
      } catch {
        setPhase("listening");
        startListening();
      }
    },
    [card.cardId, profileId, playTTS, conclude],
  );

  const handleUserAudio = useCallback(
    async (blob: Blob, mime: string) => {
      setPhase("thinking");
      try {
        const fd = new FormData();
        fd.append("audio", blob, `rec.${mime.includes("webm") ? "webm" : "mp4"}`);
        const r = await fetch("/api/transcribe", { method: "POST", body: fd });
        if (r.ok) {
          const { text } = await r.json();
          if (text?.trim()) {
            submitUserMessage(text.trim());
            return;
          }
        }
      } catch {
        /* ignore */
      }
      setPhase("listening");
      startListening();
    },
    [submitUserMessage],
  );

  const startListening = useCallback(async () => {
    if (doneRef.current) return;
    const stream = await ensureStream();
    if (!stream) return;
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      handleUserAudio(new Blob(chunks, { type: mime }), mime);
    };
    recorder.start();
    recorderRef.current = recorder;
    setPhase("listening");
  }, [ensureStream, handleUserAudio]);

  const stopListening = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const beginConversation = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setMicError(false);
    historyRef.current = [];
    turnRef.current = 1;

    const stream = await ensureStream();
    if (!stream) {
      startingRef.current = false;
      return;
    }

    try {
      setPhase("speaking");
      startTimeRef.current = Date.now();
      setElapsed(0);
      stopTimer();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 250);

      let opening = "";
      try {
        const r = await apiRequest("POST", "/api/session/opening", { cardId: card.cardId, profileId });
        opening = (await r.json()).openingLine || "";
      } catch {
        /* ignore */
      }

      if (opening) {
        historyRef.current = [{ role: "assistant", content: opening }];
        setCaption(opening);
        await playTTS(opening);
      }
      startListening();
    } finally {
      startingRef.current = false;
    }
  }, [card.cardId, profileId, ensureStream, playTTS, startListening]);

  const timerPct = Math.min((elapsed / SESSION_SECONDS) * 100, 100);
  const orbState =
    phase === "speaking"
      ? "speaking"
      : phase === "listening"
        ? "listening"
        : phase === "thinking"
          ? "thinking"
          : "idle";

  if (phase === "intro") {
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md mx-auto">
        <p className="text-xs font-semibold text-accent uppercase tracking-wide mb-3 text-center">Mise en situation</p>
        <Card className="border-primary/15 bg-card/80 mb-5">
          <CardContent className="p-5 text-left">
            <p className="text-base leading-relaxed font-medium mb-3" data-testid="text-vocal-situation">
              {card.situation}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
                <span className="text-muted-foreground">{card.userGoal}</span>
              </div>
            )}
          </CardContent>
        </Card>
        <p className="text-sm text-muted-foreground mb-4 text-center">
          Tu vas parler à voix haute. L'autre te répond. Reste naturel, vise ton objectif.
        </p>
        <Button
          onClick={beginConversation}
          className="w-full h-14 rounded-2xl text-base gap-2"
          data-testid="button-vocal-start"
        >
          <Mic className="w-5 h-5" /> Commencer la conversation
        </Button>
        {micError && <p className="text-xs text-destructive mt-3 text-center">Micro inaccessible. Autorise le micro pour démarrer.</p>}
      </motion.div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center">
      <Orb state={orbState} progressPct={timerPct} />

      <div className="h-24 mt-8 flex flex-col items-center justify-start text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={caption + orbState}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="text-[15px] leading-relaxed text-foreground/90 max-w-sm"
            data-testid="text-vocal-caption"
          >
            {phase === "thinking" ? "…" : caption}
          </motion.p>
        </AnimatePresence>
        <p className="text-xs text-muted-foreground mt-2">
          {phase === "speaking"
            ? `${card.otherRole} parle…`
            : phase === "listening"
              ? "À toi — parle, puis appuie sur stop"
              : phase === "ending"
                ? "Conversation terminée"
                : "Bagou réfléchit…"}
        </p>
      </div>

      <div className="mt-6 h-20 flex items-center justify-center">
        {phase === "listening" ? (
          <Button
            size="icon"
            variant="destructive"
            className="w-20 h-20 rounded-full shadow-xl"
            onClick={stopListening}
            data-testid="button-vocal-stop"
          >
            <Square className="w-7 h-7 fill-current" />
          </Button>
        ) : (
          <div className="w-20 h-20 rounded-full bg-muted/40 flex items-center justify-center">
            {phase === "thinking" || phase === "ending" ? (
              <Loader2 className="w-7 h-7 text-muted-foreground animate-spin" />
            ) : (
              <Mic className="w-7 h-7 text-muted-foreground/50" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Orb({ state, progressPct }: { state: "speaking" | "listening" | "thinking" | "idle"; progressPct: number }) {
  const color =
    state === "listening"
      ? "hsl(var(--accent))"
      : state === "thinking"
        ? "hsl(var(--muted-foreground))"
        : "hsl(var(--primary))";

  const r = 90;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="relative w-56 h-56 flex items-center justify-center">
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 224 224">
        <circle cx="112" cy="112" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="3" opacity="0.4" />
        <circle
          cx="112"
          cy="112"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progressPct / 100)}
          style={{ transition: "stroke-dashoffset 0.3s linear" }}
        />
      </svg>

      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{ width: 150, height: 150, border: `1.5px solid ${color}` }}
          animate={
            state === "speaking"
              ? { scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }
              : state === "listening"
                ? { scale: [1, 1.18, 1], opacity: [0.45, 0.1, 0.45] }
                : { scale: 1, opacity: 0.12 }
          }
          transition={{ duration: state === "speaking" ? 1.8 : 2.4, repeat: Infinity, delay: i * 0.5, ease: "easeOut" }}
        />
      ))}

      <motion.div
        className="relative rounded-full"
        style={{ width: 130, height: 130, background: `radial-gradient(circle at 35% 30%, ${color}, hsl(var(--primary)))` }}
        animate={
          state === "thinking"
            ? { scale: [1, 1.04, 1] }
            : state === "listening"
              ? { scale: [1, 1.08, 1] }
              : state === "speaking"
                ? { scale: [1, 1.12, 1] }
                : { scale: 1 }
        }
        transition={{ duration: state === "thinking" ? 2.2 : state === "speaking" ? 0.7 : 1.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="absolute inset-0 rounded-full" style={{ boxShadow: `0 0 60px 8px ${color}55` }} />
      </motion.div>
    </div>
  );
}
