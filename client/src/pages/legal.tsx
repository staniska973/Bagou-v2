import { Link } from "wouter";
import { ArrowLeft, FileText, Scale } from "lucide-react";
import bagouIcon from "../assets/images/bagou-icon.png";

const LAST_UPDATED = "25 juin 2026";

const EDITOR = {
  name: "Karim Stanislas-Constantin",
  status: "Entrepreneur individuel (auto-entrepreneur)",
  address: "33 rue de l'Ouest, 75014 Paris, France",
  siret: "En cours d'immatriculation",
};

function LegalLayout({
  title,
  icon,
  testId,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background" data-testid={testId}>
      <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" data-testid="link-legal-home">
            <span className="flex items-center gap-2">
              <img src={bagouIcon} alt="Bagou" className="h-7 w-7 object-contain" />
              <span className="text-lg font-bold">Bagou</span>
            </span>
          </Link>
          <Link href="/" data-testid="link-legal-back">
            <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Retour
            </span>
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </div>
          <div>
            <h1 className="font-serif text-2xl font-bold sm:text-3xl" data-testid="text-legal-title">
              {title}
            </h1>
            <p className="text-sm text-muted-foreground">Dernière mise à jour : {LAST_UPDATED}</p>
          </div>
        </div>

        <div className="space-y-8 leading-relaxed">{children}</div>

        <div className="mt-12 flex flex-wrap gap-3 border-t pt-6 text-sm">
          <Link href="/mentions-legales" data-testid="link-to-mentions">
            <span className="font-medium text-primary hover:underline">Mentions légales</span>
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link href="/cgv" data-testid="link-to-cgv">
            <span className="font-medium text-primary hover:underline">
              Conditions générales de vente et d'utilisation
            </span>
          </Link>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-lg font-semibold">{title}</h2>
      <div className="space-y-3 text-[15px] text-muted-foreground">{children}</div>
    </section>
  );
}

export function LegalNotice() {
  return (
    <LegalLayout title="Mentions légales" icon={<Scale className="h-5 w-5" />} testId="page-mentions-legales">
      <Section title="Éditeur">
        <p>
          Le site et l'application <strong className="text-foreground">Bagou</strong> sont édités par :
        </p>
        <ul className="space-y-1 rounded-xl border bg-muted/30 p-4 text-foreground">
          <li>{EDITOR.name}</li>
          <li>{EDITOR.status}</li>
          <li>{EDITOR.address}</li>
          <li>Numéro SIRET : {EDITOR.siret}</li>
        </ul>
        <p>Directeur de la publication : {EDITOR.name}.</p>
        <p>Contact : par courrier à l'adresse postale ci-dessus.</p>
      </Section>

      <Section title="Hébergement">
        <p>L'application est hébergée par :</p>
        <ul className="space-y-1 rounded-xl border bg-muted/30 p-4 text-foreground">
          <li>Replit, Inc.</li>
          <li>767 Bryant St. #203, San Francisco, CA 94107, États-Unis</li>
          <li>
            <a
              href="https://replit.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              replit.com
            </a>
          </li>
        </ul>
      </Section>

      <Section title="Propriété intellectuelle">
        <p>
          L'ensemble des éléments composant l'application Bagou (textes, contenus pédagogiques,
          interface, logo, identité visuelle) est protégé par le droit de la propriété
          intellectuelle et demeure la propriété exclusive de l'éditeur, sauf mention contraire.
          Toute reproduction ou réutilisation sans autorisation préalable est interdite.
        </p>
      </Section>

      <Section title="Données personnelles">
        <p>
          Conformément au Règlement général sur la protection des données (RGPD) et à la loi
          « Informatique et Libertés », vous disposez d'un droit d'accès, de rectification,
          d'opposition et de suppression de vos données personnelles.
        </p>
        <p>
          Vous pouvez supprimer votre compte et l'ensemble de vos données à tout moment depuis la
          page <strong className="text-foreground">Paramètres</strong> de l'application, ou en
          écrivant à l'adresse postale indiquée ci-dessus.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          Bagou utilise uniquement des cookies strictement nécessaires à son fonctionnement
          (notamment pour la gestion de votre session et de votre connexion). Aucun cookie
          publicitaire n'est déposé.
        </p>
      </Section>
    </LegalLayout>
  );
}

export function LegalTerms() {
  return (
    <LegalLayout
      title="Conditions générales de vente et d'utilisation"
      icon={<FileText className="h-5 w-5" />}
      testId="page-cgv"
    >
      <Section title="1. Objet">
        <p>
          Les présentes conditions générales de vente et d'utilisation (« CGVU ») définissent les
          modalités de mise à disposition de l'application Bagou et les conditions de souscription
          à ses offres payantes. Elles s'appliquent à toute utilisation du service.
        </p>
      </Section>

      <Section title="2. Éditeur">
        <p>
          Bagou est édité par {EDITOR.name}, {EDITOR.status.toLowerCase()}, dont l'adresse est{" "}
          {EDITOR.address}. Les coordonnées complètes figurent dans les{" "}
          <Link href="/mentions-legales">
            <span className="text-primary hover:underline">mentions légales</span>
          </Link>
          .
        </p>
      </Section>

      <Section title="3. Acceptation">
        <p>
          En créant un compte et en utilisant Bagou, l'utilisateur reconnaît avoir pris
          connaissance des présentes CGVU et les accepter sans réserve. En cas de désaccord,
          l'utilisateur doit renoncer à utiliser le service.
        </p>
      </Section>

      <Section title="4. Description du service">
        <p>
          Bagou est un coach de communication qui propose des cartes d'entraînement (flashcards),
          des mises en situation interactives et un suivi de progression, avec une assistance par
          intelligence artificielle. Le service comprend une offre gratuite et une offre payante
          (« Bagou Premium »).
        </p>
      </Section>

      <Section title="5. Compte utilisateur">
        <p>
          L'accès au service nécessite la création d'un compte. L'utilisateur est responsable de la
          confidentialité de ses identifiants et de toute activité réalisée depuis son compte.
        </p>
      </Section>

      <Section title="6. Offres et tarifs">
        <p>
          L'offre gratuite donne accès à un usage limité (quotas quotidiens et hebdomadaires).
          L'offre Bagou Premium donne accès à un usage illimité des fonctionnalités d'entraînement.
        </p>
        <p>
          Les prix sont indiqués en euros (€), toutes taxes comprises, sur la page Abonnement. Une
          période d'essai gratuite de 7 jours est proposée, suivie d'une facturation automatique
          selon la formule choisie (mensuelle ou annuelle).
        </p>
        <p>
          Les paiements sont traités de manière sécurisée par notre prestataire Stripe. Bagou ne
          conserve aucune donnée de carte bancaire.
        </p>
      </Section>

      <Section title="7. Facturation et reconduction">
        <p>
          L'abonnement est reconduit automatiquement à l'échéance de chaque période, au tarif en
          vigueur, sauf résiliation. L'utilisateur peut résilier à tout moment depuis l'espace
          « Gérer mon abonnement ». La résiliation prend effet à la fin de la période déjà payée,
          sans remboursement au prorata.
        </p>
      </Section>

      <Section title="8. Droit de rétractation">
        <p>
          Bagou est un service numérique à exécution immédiate. Conformément à l'article L221-28 du
          Code de la consommation, l'utilisateur qui demande l'accès immédiat au service reconnaît
          renoncer à son droit de rétractation de 14 jours dès le début de l'exécution de la
          prestation. La période d'essai gratuite permet de tester le service sans engagement.
        </p>
      </Section>

      <Section title="9. Résiliation">
        <p>
          L'utilisateur peut à tout moment résilier son abonnement ou supprimer définitivement son
          compte depuis la page Paramètres de l'application.
        </p>
      </Section>

      <Section title="10. Propriété intellectuelle">
        <p>
          Tous les contenus et éléments de l'application restent la propriété exclusive de
          l'éditeur. L'utilisateur bénéficie d'un droit d'usage personnel et non exclusif du
          service, à l'exclusion de toute reproduction ou exploitation commerciale.
        </p>
      </Section>

      <Section title="11. Responsabilité">
        <p>
          Bagou est un outil d'entraînement à la communication et ne se substitue pas à un conseil
          professionnel (juridique, psychologique ou autre). Le service est fourni « en l'état » ;
          l'éditeur s'efforce d'en assurer la disponibilité mais ne peut être tenu responsable des
          interruptions, erreurs ou résultats issus de l'usage du service.
        </p>
      </Section>

      <Section title="12. Données personnelles">
        <p>
          Le traitement des données personnelles est décrit dans les{" "}
          <Link href="/mentions-legales">
            <span className="text-primary hover:underline">mentions légales</span>
          </Link>
          . L'utilisateur dispose des droits prévus par le RGPD.
        </p>
      </Section>

      <Section title="13. Modification des conditions">
        <p>
          L'éditeur se réserve le droit de modifier les présentes CGVU à tout moment. La version
          applicable est celle en vigueur au jour de l'utilisation du service.
        </p>
      </Section>

      <Section title="14. Droit applicable et litiges">
        <p>
          Les présentes CGVU sont soumises au droit français. En cas de litige, une solution
          amiable sera recherchée en priorité. À défaut, les tribunaux français seront compétents.
        </p>
        <p>
          Conformément à la réglementation, le consommateur peut recourir gratuitement à un
          médiateur de la consommation en vue de la résolution amiable du litige. Il peut également
          utiliser la plateforme européenne de règlement en ligne des litiges, accessible à
          l'adresse{" "}
          <a
            href="https://ec.europa.eu/consumers/odr"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            ec.europa.eu/consumers/odr
          </a>
          .
        </p>
      </Section>
    </LegalLayout>
  );
}
