import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="flex items-center justify-center gap-2 mb-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-2xl font-bold" data-testid="text-not-found">Page introuvable</h1>
          </div>
          <p className="text-sm text-muted-foreground" data-testid="text-not-found-message">
            Cette page n'existe pas ou a été déplacée.
          </p>
          <Button onClick={() => navigate("/")} data-testid="button-go-home">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour à l'accueil
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
