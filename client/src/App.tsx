import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useAppStore } from "@/lib/store";

import NotFound from "@/pages/not-found";
import Onboarding from "@/pages/onboarding";
import Home from "@/pages/home";
import Session from "@/pages/session";
import Stats from "@/pages/stats";

function Router() {
  const { hasCompletedOnboarding, profileId, currentSessionId } = useAppStore();

  return (
    <Switch>
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/session">
        {currentSessionId ? <Session /> : <Redirect to="/" />}
      </Route>
      <Route path="/stats" component={Stats} />
      <Route path="/">
        {hasCompletedOnboarding && profileId ? <Home /> : <Redirect to="/onboarding" />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AppHeader() {
  const { hasCompletedOnboarding } = useAppStore();
  
  if (!hasCompletedOnboarding) return null;
  
  return (
    <header className="fixed top-0 right-0 z-50 p-4 flex items-center gap-2">
      <LanguageToggle />
      <ThemeToggle />
    </header>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AppHeader />
          <Router />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
