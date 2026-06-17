import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import type { Rating } from "./card-step";

const ratingColor: Record<Rating, string> = {
  easy: "bg-accent",
  medium: "bg-amber-500",
  hard: "bg-destructive",
};

export function SessionProgress({
  total,
  results,
  currentIndex,
}: {
  total: number;
  results: Rating[];
  currentIndex: number;
}) {
  if (total <= 0) return <div className="flex-1" />;

  // Many cards: a single continuous bar stays clean where segments would get noisy.
  if (total > 12) {
    const pct = (Math.min(results.length, total) / total) * 100;
    return (
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden" data-testid="progress-session">
        <motion.div
          className="h-full bg-accent rounded-full"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-1" data-testid="progress-session">
      {Array.from({ length: total }).map((_, i) => {
        const done = i < results.length;
        const current = !done && i === currentIndex;
        return (
          <div key={i} className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${done ? ratingColor[results[i]] : "bg-primary/40"}`}
              initial={false}
              animate={{ width: done || current ? "100%" : "0%" }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function StreakBadge({ streak }: { streak: number }) {
  if (!streak || streak < 1) return null;
  return (
    <div className="flex items-center gap-1 shrink-0" data-testid="badge-streak">
      <Flame className="w-3.5 h-3.5 text-orange-500" />
      <span className="text-xs font-bold tabular-nums">{streak}</span>
    </div>
  );
}

export function CountUp({
  value,
  className,
  duration = 0.9,
  testId,
}: {
  value: number;
  className?: string;
  duration?: number;
  testId?: string;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value <= 0) {
      setDisplay(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(eased * value));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span className={className} data-testid={testId}>
      {display}
    </span>
  );
}

export function CelebrationRings() {
  return (
    <>
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          className="absolute inset-0 rounded-full border border-accent/40"
          initial={{ scale: 0.6, opacity: 0.5 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 1.1, delay: 0.2 + i * 0.25, ease: "easeOut" }}
        />
      ))}
    </>
  );
}

export function pickEncouragement(mastered: number, toReview: number): { title: string; sub: string } {
  const total = mastered + toReview;
  if (total === 0) {
    return { title: "Séance terminée.", sub: "Reviens quand tu veux pour t'entraîner." };
  }

  const tiers =
    toReview === 0
      ? {
          titles: ["Carton plein.", "Sans-faute.", "Impeccable."],
          subs: [
            `${mastered} situation${mastered > 1 ? "s" : ""} enchaînée${mastered > 1 ? "s" : ""} sans accroc. Tu assures.`,
            "Rien à retravailler. Continue sur cette lancée.",
          ],
        }
      : mastered >= toReview
        ? {
            titles: ["Bien joué.", "Solide.", "Beau travail."],
            subs: ["Tu progresses pour de vrai.", "Encore une séance comme ça et c'est ancré."],
          }
        : {
            titles: ["Ça rentre, doucement.", "On y retourne bientôt.", "C'est en forgeant…"],
            subs: [
              "Les ratés d'aujourd'hui sont les réflexes de demain.",
              "Reviens vite : c'est la répétition qui fait tout.",
            ],
          };

  return {
    title: tiers.titles[total % tiers.titles.length],
    sub: tiers.subs[total % tiers.subs.length],
  };
}
