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
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={bagouIcon} alt="Bagou" className="w-8 h-8 object-contain" data-testid="img-logo-icon" />
            <span className="font-bold text-lg">Bagou</span>
          </div>
          <Button asChild data-testid="button-login-nav">
            <a href="/api/login">Se connecter</a>
          </Button>
        </div>
      </nav>

      <section className="pt-28 pb-16 px-6">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-4xl lg:text-5xl font-bold leading-tight mb-4 font-serif" data-testid="text-hero-title">
              Entrainez votre reflexe verbal au quotidien
            </h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-md">
              Bagou est votre coach personnel de communication. Flashcards, mises en situation, et repetition espacee pour progresser vraiment.
            </p>
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <Button size="lg" asChild data-testid="button-get-started">
                <a href="/api/login">
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
            className="flex justify-center"
          >
            <img
              src={bagouLogo}
              alt="Bagou - Communication Coach"
              className="w-full max-w-sm object-contain"
              data-testid="img-hero-logo"
            />
          </motion.div>
        </div>
      </section>

      <section id="features" className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold mb-3 font-serif">Un entrainement structure</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Trois piliers pour developper vos reflexes de communication
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Brain,
                title: "Flashcards SRS",
                description: "Situations reelles avec evaluation IA stricte. Le systeme de repetition espacee optimise votre apprentissage.",
                delay: 0,
              },
              {
                icon: MessageSquare,
                title: "Mises en situation",
                description: "Dialogues interactifs avec l'IA pour pratiquer en conditions reelles. Debriefs detailles apres chaque session.",
                delay: 0.1,
              },
              {
                icon: TrendingUp,
                title: "Progression visible",
                description: "Suivez votre progression par theme, gagnez des niveaux et debloquez des badges. Vos faiblesses deviennent vos forces.",
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
                  <CardContent className="p-6">
                    <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                      <feature.icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-6 bg-primary/5">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold mb-4 font-serif">Pret a developper votre bagou ?</h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Rejoignez Bagou et commencez votre entrainement quotidien en communication.
            </p>
            <Button size="lg" asChild data-testid="button-cta-bottom">
              <a href="/api/login">
                Commencer maintenant
                <ChevronRight className="w-5 h-5 ml-1" />
              </a>
            </Button>
          </motion.div>
        </div>
      </section>

      <footer className="py-8 px-6 border-t">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={bagouIcon} alt="Bagou" className="w-5 h-5 object-contain" />
            <span>Bagou</span>
          </div>
          <p>2026 Bagou. Tous droits reserves.</p>
        </div>
      </footer>
    </div>
  );
}
