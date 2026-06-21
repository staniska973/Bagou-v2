import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { PaywallProvider } from "@/components/paywall-provider";
import { SubscriptionBadge } from "@/components/subscription-badge";

import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Onboarding from "@/pages/onboarding";
import Home from "@/pages/home";
import Parcours from "@/pages/parcours";
import Cards from "@/pages/cards";
import Vocal from "@/pages/vocal";
import Stats from "@/pages/stats";
import Admin from "@/pages/admin";
import Pricing from "@/pages/pricing";

function AuthenticatedRouter() {
  return (
    <Switch>
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/parcours" component={Parcours} />
      <Route path="/cards" component={Cards} />
      <Route path="/vocal" component={Vocal} />
      <Route path="/stats" component={Stats} />
      <Route path="/abonnement" component={Pricing} />
      <Route path="/admin" component={Admin} />
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppHeader() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <header className="fixed top-0 right-0 z-50 p-3 flex items-center gap-2">
      <SubscriptionBadge />
      <LanguageToggle />
      <ThemeToggle />
    </header>
  );
}

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <Skeleton className="w-16 h-16 rounded-full mx-auto" />
          <Skeleton className="w-32 h-4 mx-auto" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Landing />;
  }

  return (
    <PaywallProvider>
      <AppHeader />
      <AuthenticatedRouter />
    </PaywallProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AppContent />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
