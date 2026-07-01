import { motion } from "framer-motion";
import { MessageSquare, Brain, TrendingUp, Zap, ChevronRight, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import bagouLogo from "../assets/images/bagou-logo-text.png";
import bagouIcon from "../assets/images/bagou-icon.png";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img src={bagouIcon} alt="Bagou" className="w-8 h-8 object-contain" data-testid="img-logo-icon" />
            <span className="font-bold text-lg">Bagou</span>
          </div>
          <Button asChild data-testid="button-login-nav">
            <a href="/api/login" target="_top">Se connecter</a>
          </Button>
        </div>
      </nav>

      <section className="pt-24 pb-12 sm:pt-28 sm:pb-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="order-2 lg:order-1"
          >
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-4 font-serif" data-testid="text-hero-title">
              Entraînez votre réflexe verbal au quotidien
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground mb-6 sm:mb-8 max-w-md">
              Bagou est votre coach personnel de communication. Flashcards, mises en situation, et répétition espacée pour progresser vraiment.
            </p>
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <Button size="lg" asChild data-testid="button-get-started">
                <a href="/api/login" target="_top">
                  Commencer gratuitement
                  <ChevronRight className="w-5 h-5 ml-1" />
                </a>
              </Button>
              <Button variant="outline" size="lg" asChild data-testid="button-learn-more">
                <a href="#features">En savoir plus</a>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Shield className="w-4 h-4" />
                Gratuit pour toujours
              </span>
              <span className="flex items-center gap-1">
                <Zap className="w-4 h-4" />
                Pas de carte bancaire
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex justify-center order-1 lg:order-2"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-primary/10 rounded-full blur-3xl scale-110" />
              <img
                src={bagouLogo}
                alt="Bagou"
                className="relative w-56 sm:w-72 lg:w-full lg:max-w-md object-contain drop-shadow-lg"
                data-testid="img-hero-logo"
              />
            </div>
          </motion.div>
        </div>
      </section>

      <section id="features" className="py-12 sm:py-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10 sm:mb-12"
          >
            <h2 className="text-2xl sm:text-3xl font-bold mb-3 font-serif">Un entraînement structuré</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Trois piliers pour développer vos réflexes de communication
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            {[
              {
                icon: Brain,
                title: "Flashcards SRS",
                description: "Situations réelles avec évaluation IA stricte. Le système de répétition espacée optimise votre apprentissage.",
                delay: 0,
              },
              {
                icon: MessageSquare,
                title: "Mises en situation",
                description: "Dialogues interactifs avec l'IA pour pratiquer en conditions réelles. Débriefs détaillés après chaque session.",
                delay: 0.1,
              },
              {
                icon: TrendingUp,
                title: "Progression visible",
                description: "Suivez votre progression par thème, gagnez des niveaux et débloquez des badges. Vos faiblesses deviennent vos forces.",
                delay: 0.2,
              },
            ].map((feature) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: feature.delay }}
              >
                <Card className="h-full">
                  <CardContent className="p-5 sm:p-6">
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                      <feature.icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-base sm:text-lg mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 px-4 sm:px-6 bg-primary/5">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 font-serif">Prêt à développer votre bagou ?</h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Rejoignez Bagou et commencez votre entraînement quotidien en communication.
            </p>
            <Button size="lg" asChild data-testid="button-cta-bottom">
              <a href="/api/login" target="_top">
                Commencer maintenant
                <ChevronRight className="w-5 h-5 ml-1" />
              </a>
            </Button>
          </motion.div>
        </div>
      </section>

      <footer className="py-6 sm:py-8 px-4 sm:px-6 border-t">
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-4 text-sm text-muted-foreground sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <img src={bagouIcon} alt="Bagou" className="w-5 h-5 object-contain" />
            <span>Bagou</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <a href="/cgv" className="hover:text-foreground" data-testid="link-footer-cgv">
              Conditions générales
            </a>
            <a href="/mentions-legales" className="hover:text-foreground" data-testid="link-footer-mentions">
              Mentions légales
            </a>
          </nav>
          <p>2026 Bagou. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
