import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, Loader2, Target, Sparkles, ArrowRight, Trophy, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import type { ParcoursCard } from "./card-step";
import { CelebrationRings, pickOralEncouragement } from "./session-ui";

export interface GlobalDynamic {
  feedback: string;
  rating: "hard" | "medium" | "easy";
  pattern: string;
}

type Phase = "intro" | "speaking" | "listening" | "thinking" | "ending";
type Msg = { role: "user" | "assistant"; content: string };

const SESSION_SECONDS = 120;
const NUM_BARS = 7;

export function VocalStep({
  card,
  profileId,
  isLast = false,
  onComplete,
}: {
  card: ParcoursCard;
  profileId: number;
  isLast?: boolean;
  onComplete: (gd: GlobalDynamic | null, transcript: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [micError, setMicError] = useState(false);
  const [endGd, setEndGd] = useState<GlobalDynamic | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const ttsRequestRef = useRef(0);
  const ttsResolveRef = useRef<(() => void) | null>(null);
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null);
  const [ttsPlayingId, setTtsPlayingId] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const historyRef = useRef<Msg[]>([]);
  const turnRef = useRef(1);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startingRef = useRef(false);
  const doneRef = useRef(false);
  const cancelledRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const stopTts = useCallback(() => {
    ttsRequestRef.current += 1;
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setTtsPlayingId(null);
    setTtsLoadingId(null);
    const resolve = ttsResolveRef.current;
    ttsResolveRef.current = null;
    resolve?.();
  }, []);
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  const cleanupMeter = () => {
    try {
      sourceRef.current?.disconnect();
    } catch {
      /* noop */
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    sourceRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current = null;
  };

  useEffect(
    () => () => {
      cancelledRef.current = true;
      stopTts();
      stopTimer();
      cleanupMeter();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, phase]);

  const buildTranscript = () =>
    [
      `[Mise en situation] ${card.situation}`,
      ...historyRef.current.map((m) =>
        m.role === "user" ? `Toi : ${m.content}` : `${card.otherRole} : ${m.content}`,
      ),
    ].join("\n");

  // Single shared audio pipeline: the live conversation auto-plays each
  // interlocutor line, and the per-bubble replay buttons reuse the exact same
  // play/stop logic so only one clip is ever audible across the whole step.
  const playTts = useCallback(
    (text: string, id: string): Promise<void> => {
      if (ttsPlayingId === id || ttsLoadingId === id) {
        stopTts();
        return Promise.resolve();
      }
      stopTts();
      const requestId = ttsRequestRef.current;
      const controller = new AbortController();
      ttsAbortRef.current = controller;
      setTtsLoadingId(id);
      return new Promise<void>((resolve) => {
        ttsResolveRef.current = resolve;
        fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        })
          .then((r) => {
            if (!r.ok) throw new Error("tts");
            return r.blob();
          })
          .then((blob) => {
            if (requestId !== ttsRequestRef.current) {
              resolve();
              return;
            }
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            if (audioRef.current) audioRef.current.pause();
            audioRef.current = audio;
            if (ttsAbortRef.current === controller) ttsAbortRef.current = null;
            const done = () => {
              URL.revokeObjectURL(url);
              if (audioRef.current === audio) audioRef.current = null;
              setTtsPlayingId((c) => (c === id ? null : c));
              if (ttsResolveRef.current === resolve) ttsResolveRef.current = null;
              resolve();
            };
            audio.onended = done;
            audio.onerror = done;
            setTtsLoadingId((c) => (c === id ? null : c));
            setTtsPlayingId(id);
            audio.play().catch(done);
          })
          .catch(() => {
            if (requestId === ttsRequestRef.current) {
              setTtsLoadingId((c) => (c === id ? null : c));
              setTtsPlayingId((c) => (c === id ? null : c));
            }
            if (ttsResolveRef.current === resolve) ttsResolveRef.current = null;
            resolve();
          });
      });
    },
    [ttsPlayingId, ttsLoadingId, stopTts],
  );

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

  const setupAnalyser = useCallback((stream: MediaStream) => {
    if (analyserRef.current) return;
    try {
      const Ctx: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;
      ctx.resume?.().catch(() => {});
    } catch {
      /* meter is optional — never block recording */
    }
  }, []);

  const conclude = useCallback((gd: GlobalDynamic | null) => {
    if (doneRef.current) return;
    doneRef.current = true;
    stopTimer();
    stopTts();
    cleanupMeter();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setEndGd(gd);
    setPhase("ending");
  }, []);

  const submitUserMessage = useCallback(
    async (text: string) => {
      setMessages((prev) => [...prev, { role: "user", content: text }]);
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
        if (cancelledRef.current) return;

        historyRef.current = [
          ...historyRef.current,
          { role: "user", content: text },
          { role: "assistant", content: data.interlocutorReply },
        ];
        setMessages((prev) => [...prev, { role: "assistant", content: data.interlocutorReply }]);
        const replyId = `msg-${historyRef.current.length - 1}`;

        if (data.isFinalTurn || overTime) {
          setPhase("speaking");
          await playTts(data.interlocutorReply, replyId);
          conclude(data.globalDynamic || null);
          return;
        }

        turnRef.current += 1;
        setPhase("speaking");
        await playTts(data.interlocutorReply, replyId);
        startListening();
      } catch {
        if (cancelledRef.current) return;
        // The turn failed: drop the optimistic user bubble so the view stays
        // consistent with historyRef, then let the user say it again.
        setMessages((prev) => prev.slice(0, -1));
        setPhase("listening");
        startListening();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card.cardId, profileId, playTts, conclude],
  );

  const handleUserAudio = useCallback(
    async (blob: Blob, mime: string) => {
      setPhase("thinking");
      try {
        const fd = new FormData();
        fd.append("audio", blob, `rec.${mime.includes("webm") ? "webm" : "mp4"}`);
        const r = await fetch("/api/transcribe", { method: "POST", body: fd });
        if (cancelledRef.current) return;
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
      if (cancelledRef.current) return;
      setPhase("listening");
      startListening();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [submitUserMessage],
  );

  const startListening = useCallback(async () => {
    if (doneRef.current || cancelledRef.current) return;
    const stream = await ensureStream();
    if (!stream || cancelledRef.current) return;
    setupAnalyser(stream);
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      if (cancelledRef.current) return;
      handleUserAudio(new Blob(chunks, { type: mime }), mime);
    };
    recorder.start();
    recorderRef.current = recorder;
    setPhase("listening");
  }, [ensureStream, handleUserAudio, setupAnalyser]);

  const stopListening = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const beginConversation = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setMicError(false);
    historyRef.current = [];
    turnRef.current = 1;
    setMessages([]);

    const stream = await ensureStream();
    if (!stream) {
      startingRef.current = false;
      return;
    }
    setupAnalyser(stream);

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
        setMessages([{ role: "assistant", content: opening }]);
        await playTts(opening, "msg-0");
      }
      startListening();
    } finally {
      startingRef.current = false;
    }
  }, [card.cardId, profileId, ensureStream, setupAnalyser, playTts, startListening]);

  const timerPct = Math.min((elapsed / SESSION_SECONDS) * 100, 100);

  if (phase === "intro") {
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md mx-auto">
        <p className="text-xs font-semibold text-accent uppercase tracking-wide mb-3 text-center">Mise en situation</p>
        <Card className="border-primary/15 bg-card/80 mb-4">
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
          </CardContent>
        </Card>

        {card.userGoal && (
          <div
            className="flex items-start gap-2 rounded-xl bg-accent/10 border border-accent/20 px-3.5 py-2.5 mb-4"
            data-testid="text-vocal-objective-intro"
          >
            <Target className="w-4 h-4 text-accent shrink-0 mt-0.5" />
            <p className="text-sm text-left leading-snug">
              <span className="font-semibold">Ton objectif&nbsp;:</span> {card.userGoal}
            </p>
          </div>
        )}

        <p className="text-sm text-muted-foreground mb-4 text-center">
          L'autre te lance la conversation. À toi de répondre à voix haute&nbsp;— tu verras à l'écran ce qui a été compris.
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

  if (phase === "ending") {
    const enc = pickOralEncouragement(endGd?.rating ?? null);
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md mx-auto text-center"
        data-testid="section-vocal-ending"
      >
        <div className="relative w-20 h-20 mx-auto mb-5 flex items-center justify-center">
          <CelebrationRings />
          <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-accent" />
          </div>
        </div>

        <h2 className="text-2xl font-bold mb-1.5" data-testid="text-vocal-ending-title">
          {enc.title}
        </h2>
        <p className="text-sm text-muted-foreground mb-5">{enc.sub}</p>

        {endGd?.feedback && (
          <Card className="border-accent/30 bg-accent/5 text-left mb-3">
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold text-accent uppercase tracking-wide flex items-center gap-1 mb-1.5">
                <Trophy className="w-3 h-3" /> Le mot de Bagou
              </p>
              <p className="text-sm leading-relaxed" data-testid="text-vocal-ending-feedback">
                {endGd.feedback}
              </p>
              {endGd.pattern && (
                <p className="text-xs text-muted-foreground mt-2" data-testid="text-vocal-ending-pattern">
                  <span className="font-semibold text-foreground/70">Ton réflexe&nbsp;:</span> {endGd.pattern}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Button
          onClick={() => onComplete(endGd, buildTranscript())}
          className="w-full h-14 rounded-2xl text-base gap-2 mt-1"
          data-testid="button-vocal-continue"
        >
          {isLast ? (
            <>
              <Trophy className="w-5 h-5" /> Voir mon débrief
            </>
          ) : (
            <>
              Situation suivante <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </motion.div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto h-full flex flex-col py-2">
      {/* Objective — always visible so the user knows their goal */}
      <div
        className="flex-shrink-0 flex items-start gap-2 rounded-xl bg-accent/10 border border-accent/20 px-3 py-2"
        data-testid="text-vocal-objective"
      >
        <Target className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
        <p className="text-xs text-left leading-snug text-foreground/85">
          <span className="font-semibold">Objectif&nbsp;:</span> {card.userGoal || card.situation}
        </p>
      </div>

      {/* Session timer */}
      <div className="flex-shrink-0 h-1 rounded-full bg-muted overflow-hidden mt-2">
        <div className="h-full bg-primary/40 transition-all duration-300" style={{ width: `${timerPct}%` }} />
      </div>

      {/* Conversation transcript */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto space-y-2.5 py-3 px-0.5" data-testid="list-vocal-conversation">
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[82%] rounded-2xl px-3.5 py-2 ${
                  m.role === "user" ? "bg-primary/10 rounded-br-sm" : "bg-muted rounded-bl-sm"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <p
                    className={`text-[10px] font-semibold uppercase tracking-wide ${
                      m.role === "user" ? "text-primary/70" : "text-muted-foreground"
                    }`}
                  >
                    {m.role === "user" ? "Toi" : card.otherRole}
                  </p>
                  {m.role === "assistant" && (
                    <button
                      type="button"
                      onClick={() => playTts(m.content, `msg-${i}`)}
                      disabled={ttsLoadingId === `msg-${i}` || (phase === "speaking" && ttsPlayingId !== `msg-${i}`)}
                      className="flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                      data-testid={`button-vocal-replay-${i}`}
                      aria-label={ttsPlayingId === `msg-${i}` ? "Arrêter la lecture" : "Réécouter cette réplique"}
                    >
                      {ttsLoadingId === `msg-${i}` ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : ttsPlayingId === `msg-${i}` ? (
                        <Square className="w-3 h-3 fill-current" />
                      ) : (
                        <Volume2 className="w-3 h-3" />
                      )}
                      {ttsPlayingId === `msg-${i}` ? "Stop" : "Réécouter"}
                    </button>
                  )}
                </div>
                <p className="text-[14px] leading-snug text-left text-foreground/90" data-testid={`text-vocal-turn-${i}`}>
                  {m.content}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {phase === "thinking" && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
              <TypingDots />
            </div>
          </div>
        )}
      </div>

      {/* Control dock — turn cue + real mic meter + button */}
      <div className="flex-shrink-0 pt-2">
        <div className="h-8 flex items-center justify-center">
          {phase === "listening" ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 text-accent"
              data-testid="status-vocal-turn"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent" />
              </span>
              <span className="text-sm font-semibold">À toi de parler</span>
            </motion.div>
          ) : (
            <p className="text-xs text-muted-foreground" data-testid="status-vocal-turn">
              {phase === "speaking"
                ? `${card.otherRole} parle…`
                : phase === "thinking"
                  ? `${card.otherRole} réfléchit…`
                  : ""}
            </p>
          )}
        </div>

        <div className="h-12 flex items-end justify-center my-2">
          <MicMeter analyser={analyserRef.current} active={phase === "listening"} />
        </div>

        <div className="flex items-center justify-center h-20">
          {phase === "listening" ? (
            <Button
              size="icon"
              variant="destructive"
              className="w-16 h-16 rounded-full shadow-xl"
              onClick={stopListening}
              data-testid="button-vocal-stop"
            >
              <Square className="w-6 h-6 fill-current" />
            </Button>
          ) : (
            <div className="w-16 h-16 rounded-full bg-muted/40 flex items-center justify-center">
              {phase === "thinking" ? (
                <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
              ) : (
                <Mic className="w-6 h-6 text-muted-foreground/50" />
              )}
            </div>
          )}
        </div>
        <p className="h-4 text-center text-[11px] text-muted-foreground">
          {phase === "listening" ? "Appuie quand tu as fini de parler" : ""}
        </p>
      </div>
    </div>
  );
}

function MicMeter({ analyser, active }: { analyser: AnalyserNode | null; active: boolean }) {
  const [bars, setBars] = useState<number[]>(() => new Array(NUM_BARS).fill(0));
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || !analyser) {
      setBars(new Array(NUM_BARS).fill(0));
      return;
    }
    const freq = new Uint8Array(analyser.frequencyBinCount);
    const usable = Math.max(NUM_BARS, Math.floor(analyser.frequencyBinCount * 0.6));
    const step = Math.max(1, Math.floor(usable / NUM_BARS));

    const tick = () => {
      analyser.getByteFrequencyData(freq);
      const next: number[] = [];
      for (let i = 0; i < NUM_BARS; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += freq[i * step + j] || 0;
        next.push(Math.min(1, sum / step / 190));
      }
      setBars(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [active, analyser]);

  return (
    <div className="flex items-center justify-center gap-1.5 h-full" data-testid="mic-level-meter" aria-hidden="true">
      {bars.map((v, i) => (
        <div
          key={i}
          className={`w-2.5 rounded-full transition-[height,background-color] duration-75 ${
            active ? "bg-accent" : "bg-muted-foreground/25"
          }`}
          style={{ height: `${Math.max(10, v * 100)}%` }}
        />
      ))}
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1" data-testid="indicator-vocal-thinking">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
