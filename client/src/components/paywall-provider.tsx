import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Crown, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { QuotaError } from "@/lib/quota";

interface PaywallContextValue {
  showPaywall: (info?: QuotaError | null) => void;
}

const PaywallContext = createContext<PaywallContextValue | null>(null);

export function usePaywall() {
  const ctx = useContext(PaywallContext);
  if (!ctx) throw new Error("usePaywall must be used within PaywallProvider");
  return ctx;
}

const DEFAULT_MESSAGE =
  "Tu as atteint ta limite gratuite. Passe en Premium pour t'entraîner sans limite.";

const PERKS = [
  "Cartes illimitées chaque jour",
  "Simulations vocales sans limite",
  "7 jours d'essai gratuit",
];

export function PaywallProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [, navigate] = useLocation();

  const showPaywall = useCallback((info?: QuotaError | null) => {
    setMessage(info?.message || DEFAULT_MESSAGE);
    setOpen(true);
  }, []);

  return (
    <PaywallContext.Provider value={{ showPaywall }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-paywall">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Crown className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center text-xl">Passe en Premium</DialogTitle>
            <DialogDescription className="text-center" data-testid="text-paywall-message">
              {message}
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2 py-2">
            {PERKS.map((perk) => (
              <li key={perk} className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 shrink-0 text-primary" />
                {perk}
              </li>
            ))}
          </ul>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full"
              onClick={() => {
                setOpen(false);
                navigate("/abonnement");
              }}
              data-testid="button-paywall-upgrade"
            >
              Voir les offres
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setOpen(false)}
              data-testid="button-paywall-later"
            >
              Plus tard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PaywallContext.Provider>
  );
}
