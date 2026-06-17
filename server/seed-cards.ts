import OpenAI from "openai";
import type { InsertMotherCard } from "@shared/schema";
import type { IStorage } from "./storage";
import { detectSituationLeak, rewriteSituationWithoutLeak } from "./leak-detection";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const MODEL = "gpt-4o-mini";

export interface SubthemeConfig {
  id: string;
  label: string;
  intents: string[];
  exampleSituations: string[];
}

export interface ThemeConfig {
  id: string;
  label: string;
  subthemes: SubthemeConfig[];
}

export const THEMES_CONFIG: ThemeConfig[] = [
  {
    id: "SOCIAL",
    label: "Situations sociales",
    subthemes: [
      {
        id: "small_talk",
        label: "Conversations legeres",
        intents: ["open", "small_talk", "connect", "transition", "close", "engage", "respond", "deflect"],
        exampleSituations: [
          "Engager la conversation avec un inconnu dans une file d'attente",
          "Relancer une conversation qui s'essouffle lors d'un apero",
          "Trouver un sujet commun avec un collegue que tu connais peu",
        ],
      },
      {
        id: "compliments",
        label: "Compliments et valorisation",
        intents: ["compliment", "valorize", "acknowledge", "encourage", "react", "deflect", "reciprocate"],
        exampleSituations: [
          "Faire un compliment sincere a un ami sur sa presentation",
          "Reagir a un compliment inattendu sans etre genant",
          "Valoriser le travail d'un collegue devant l'equipe",
        ],
      },
      {
        id: "humor",
        label: "Humour et repartie",
        intents: ["tease", "joke", "deflect_humor", "self_deprecate", "comeback", "lighten", "banter"],
        exampleSituations: [
          "Repondre avec humour a une remarque moqueuse",
          "Detendre l'atmosphere apres un moment genant",
          "Faire une vanne bien placee sans blesser",
        ],
      },
      {
        id: "group_dynamics",
        label: "Dynamique de groupe",
        intents: ["include", "lead", "mediate", "redirect", "engage_group", "defuse", "rally"],
        exampleSituations: [
          "Integrer une personne timide dans une conversation de groupe",
          "Reprendre la parole quand quelqu'un monopolise la discussion",
          "Gerer un desaccord qui emerge dans un groupe d'amis",
        ],
      },
      {
        id: "networking",
        label: "Reseautage et connexions",
        intents: ["introduce", "connect", "follow_up", "pitch_self", "ask_contact", "offer_help", "close_conversation"],
        exampleSituations: [
          "Se presenter a un evenement professionnel decontracte",
          "Demander les coordonnees de quelqu'un rencontre en soiree",
          "Relancer un contact apres une premiere rencontre",
        ],
      },
    ],
  },
  {
    id: "PRO",
    label: "Professionnel",
    subthemes: [
      {
        id: "assertiveness",
        label: "Assertivite au travail",
        intents: ["assert", "refuse", "set_boundary", "express_need", "stand_firm", "negotiate_space", "escalate"],
        exampleSituations: [
          "Dire non a une tache supplementaire quand tu es surcharge",
          "Exprimer ton desaccord en reunion sans creer de conflit",
          "Demander une augmentation a ton manager",
        ],
      },
      {
        id: "negotiation",
        label: "Negociation",
        intents: ["propose", "counter", "anchor", "concede", "close_deal", "explore_options", "frame"],
        exampleSituations: [
          "Negocier un delai supplementaire avec un client exigeant",
          "Discuter les termes d'un contrat freelance",
          "Trouver un compromis sur la repartition des taches en equipe",
        ],
      },
      {
        id: "presentation",
        label: "Prise de parole",
        intents: ["open_speech", "engage_audience", "structure", "handle_question", "close_speech", "improvise", "recover"],
        exampleSituations: [
          "Commencer une presentation devant 20 collegues",
          "Repondre a une question difficile apres ta presentation",
          "Improviser quand le support de presentation plante",
        ],
      },
      {
        id: "feedback",
        label: "Donner et recevoir du feedback",
        intents: ["give_positive", "give_constructive", "receive_feedback", "ask_feedback", "reframe_feedback", "follow_up_feedback"],
        exampleSituations: [
          "Donner un feedback constructif a un collegue sur son travail",
          "Recevoir une critique de ton manager sans te braquer",
          "Demander du feedback apres un projet important",
        ],
      },
      {
        id: "conflict_resolution",
        label: "Gestion de conflits pro",
        intents: ["de_escalate", "mediate", "acknowledge", "propose_solution", "set_boundary", "apologize_pro", "follow_up"],
        exampleSituations: [
          "Calmer un collegue en colere apres un malentendu par email",
          "Resoudre un conflit entre deux membres de ton equipe",
          "Aborder un probleme recurrent avec un collaborateur difficile",
        ],
      },
    ],
  },
  {
    id: "DAILY",
    label: "Vie quotidienne",
    subthemes: [
      {
        id: "complaints",
        label: "Reclamations et plaintes",
        intents: ["complain_politely", "escalate", "demand", "negotiate_refund", "express_dissatisfaction", "follow_up", "accept_resolution"],
        exampleSituations: [
          "Signaler un plat froid au restaurant sans etre desagreable",
          "Reclamer un remboursement pour un produit defectueux",
          "Contester une facture incorrecte par telephone",
        ],
      },
      {
        id: "neighbors",
        label: "Relations de voisinage",
        intents: ["request", "complain_neighbor", "propose", "apologize", "set_boundary", "mediate", "connect"],
        exampleSituations: [
          "Demander a ton voisin de baisser la musique apres 22h",
          "Proposer un arrangement pour le parking partage",
          "Reagir quand un voisin se plaint de ton chien",
        ],
      },
      {
        id: "services",
        label: "Interactions commerciales",
        intents: ["negotiate_price", "ask_info", "complain_service", "tip", "recommend", "refuse_upsell", "bargain"],
        exampleSituations: [
          "Negocier le prix chez un artisan pour des travaux",
          "Refuser poliment un vendeur insistant en magasin",
          "Demander un geste commercial apres un service mediocre",
        ],
      },
      {
        id: "phone_calls",
        label: "Appels telephoniques",
        intents: ["open_call", "navigate_menu", "explain_problem", "insist", "close_call", "follow_up", "escalate_call"],
        exampleSituations: [
          "Appeler le service client pour un probleme de livraison",
          "Prendre rendez-vous par telephone chez un specialiste",
          "Gerer un demarcheur telephonique sans s'enerver",
        ],
      },
      {
        id: "admin",
        label: "Demarches administratives",
        intents: ["explain_situation", "request_document", "contest_decision", "follow_up_admin", "negotiate_delay", "ask_help", "clarify"],
        exampleSituations: [
          "Expliquer ta situation a un agent de la CAF au guichet",
          "Contester une amende que tu juges injustifiee",
          "Relancer un dossier administratif en attente depuis des mois",
        ],
      },
    ],
  },
  {
    id: "RELATIONNEL",
    label: "Relationnel",
    subthemes: [
      {
        id: "flirting",
        label: "Seduction et drague",
        intents: ["open_flirt", "tease", "compliment_subtle", "escalate_interest", "read_signals", "exit_gracefully", "deepen"],
        exampleSituations: [
          "Engager la conversation avec quelqu'un qui te plait dans un bar",
          "Repondre a un message sur une appli de rencontre de maniere originale",
          "Proposer un rendez-vous apres quelques echanges",
        ],
      },
      {
        id: "boundaries",
        label: "Poser ses limites",
        intents: ["refuse", "set_limit", "express_need", "enforce", "explain_boundary", "renegotiate", "stand_firm"],
        exampleSituations: [
          "Dire non a un ami qui te demande toujours des services",
          "Expliquer a ta famille que tu ne viendras pas a une reunion",
          "Poser une limite claire avec un ex qui insiste",
        ],
      },
      {
        id: "emotional_expression",
        label: "Expression emotionnelle",
        intents: ["express_feeling", "share_vulnerability", "ask_support", "validate", "comfort", "open_up", "name_emotion"],
        exampleSituations: [
          "Dire a un ami proche que tu traverses une periode difficile",
          "Exprimer ta gratitude de maniere sincere a quelqu'un",
          "Partager une inquietude sans chercher a etre rassure",
        ],
      },
      {
        id: "deep_conversations",
        label: "Conversations profondes",
        intents: ["deepen", "question", "share_perspective", "challenge_idea", "listen_actively", "bridge", "reflect"],
        exampleSituations: [
          "Aborder un sujet personnel avec un ami de longue date",
          "Explorer les valeurs de quelqu'un lors d'un diner",
          "Relancer une conversation qui reste en surface",
        ],
      },
      {
        id: "conflict_couples",
        label: "Conflits de couple",
        intents: ["express_frustration", "listen_partner", "propose_compromise", "apologize", "de_escalate", "reconnect", "set_boundary_couple"],
        exampleSituations: [
          "Aborder un sujet sensible avec ton partenaire sans l'accuser",
          "Reagir quand ton partenaire te reproche quelque chose injustement",
          "Proposer un compromis apres une dispute recurrente",
        ],
      },
    ],
  },
  {
    id: "DIFFICULT",
    label: "Situations difficiles",
    subthemes: [
      {
        id: "criticism",
        label: "Gerer les critiques",
        intents: ["absorb", "deflect", "respond_calmly", "reframe", "ask_clarification", "set_boundary", "use_humor"],
        exampleSituations: [
          "Reagir a une critique blessante d'un proche sur ton physique",
          "Gerer un commentaire condescendant d'un superieur en reunion",
          "Repondre a quelqu'un qui critique tes choix de vie",
        ],
      },
      {
        id: "manipulation",
        label: "Resister a la manipulation",
        intents: ["identify", "resist", "call_out", "redirect", "disengage", "protect", "assert_reality"],
        exampleSituations: [
          "Reagir face a quelqu'un qui te fait culpabiliser pour obtenir ce qu'il veut",
          "Identifier et contrer un discours manipulateur d'un vendeur",
          "Resister a un ami qui utilise la pression emotionnelle",
        ],
      },
      {
        id: "peer_pressure",
        label: "Pression sociale",
        intents: ["refuse", "stand_firm", "redirect", "use_humor", "exit", "assert_choice", "reframe_social"],
        exampleSituations: [
          "Refuser de boire de l'alcool dans un groupe ou tout le monde boit",
          "Resister a la pression de tes amis pour sortir quand tu es fatigue",
          "Assumer un choix impopulaire devant ton groupe d'amis",
        ],
      },
      {
        id: "bad_news",
        label: "Annoncer de mauvaises nouvelles",
        intents: ["prepare", "deliver", "support", "handle_reaction", "follow_up", "be_honest", "offer_options"],
        exampleSituations: [
          "Annoncer a un ami que tu ne pourras pas etre a son mariage",
          "Informer un collegue que son projet n'a pas ete retenu",
          "Dire a tes parents une decision qu'ils ne vont pas apprecier",
        ],
      },
      {
        id: "awkward_situations",
        label: "Situations genantes",
        intents: ["recover", "lighten", "redirect", "acknowledge", "normalize", "exit_gracefully", "own_it"],
        exampleSituations: [
          "Reagir quand tu appelles quelqu'un par le mauvais prenom",
          "Gerer un silence genant lors d'un premier rendez-vous",
          "Te rattraper apres avoir fait une gaffe en public",
        ],
      },
    ],
  },
  {
    id: "STORY",
    label: "Storytelling et rhetorique",
    subthemes: [
      {
        id: "anecdotes",
        label: "Raconter des anecdotes",
        intents: ["hook", "build_tension", "deliver_punchline", "engage_listener", "set_scene", "close_story", "callback"],
        exampleSituations: [
          "Raconter une mesaventure de voyage de maniere captivante",
          "Partager une anecdote drole au bon moment dans une conversation",
          "Transformer une experience banale en histoire interessante",
        ],
      },
      {
        id: "persuasion",
        label: "Art de la persuasion",
        intents: ["frame", "appeal_emotion", "provide_evidence", "handle_objection", "call_to_action", "build_rapport", "anchor"],
        exampleSituations: [
          "Convaincre un ami de tester une activite qu'il refuse",
          "Persuader ton equipe d'adopter une nouvelle methode de travail",
          "Argumenter pour choisir un restaurant aupres d'un groupe indecis",
        ],
      },
      {
        id: "debate",
        label: "Argumentation et debat",
        intents: ["argue", "counter", "concede_point", "reframe_debate", "ask_question", "summarize", "close_argument"],
        exampleSituations: [
          "Defendre ton point de vue sur un sujet politique sans s'enerver",
          "Contrer un argument fallacieux de maniere elegante",
          "Trouver un terrain d'entente dans un debat anime",
        ],
      },
      {
        id: "pitch",
        label: "Se presenter / pitcher",
        intents: ["hook_intro", "present_value", "differentiate", "handle_question", "close_pitch", "adapt_audience", "tell_story"],
        exampleSituations: [
          "Te presenter en 30 secondes lors d'un evenement networking",
          "Pitcher ton projet a un investisseur potentiel",
          "Expliquer ton metier de maniere interessante a un inconnu",
        ],
      },
      {
        id: "reframing",
        label: "Recadrage et reformulation",
        intents: ["reframe_positive", "reframe_question", "clarify", "redirect_conversation", "summarize_reframe", "challenge_assumption", "normalize"],
        exampleSituations: [
          "Reformuler une critique en opportunite d'amelioration",
          "Recadrer une conversation qui derive vers le negatif",
          "Transformer un echec en lecon lors d'un entretien",
        ],
      },
    ],
  },
];

const CHANNELS: Array<"text" | "irl" | "voice"> = ["text", "irl", "voice"];
const DIFFICULTIES: Array<"n1" | "n2" | "n3"> = ["n1", "n2", "n3"];
const STAKES: Array<"low" | "medium" | "high"> = ["low", "medium", "high"];
const CARDS_PER_SUBTHEME = 50;
const BATCH_SIZE = 10;

function getDifficultyForIndex(index: number): "n1" | "n2" | "n3" {
  if (index < 20) return "n1";
  if (index < 40) return "n2";
  return "n3";
}

function getChannelForIndex(index: number): "text" | "irl" | "voice" {
  return CHANNELS[index % 3];
}

function getStakesForIndex(index: number): "low" | "medium" | "high" {
  if (index % 5 < 2) return "low";
  if (index % 5 < 4) return "medium";
  return "high";
}

function buildCardIdPrefix(themeId: string, subthemeId: string): string {
  return `FC_${themeId}_${subthemeId.toUpperCase()}`;
}

function buildPackId(themeId: string, subthemeId: string): string {
  return `PACK_${themeId}_${subthemeId.toUpperCase()}`;
}

function buildPrompt(
  theme: ThemeConfig,
  subtheme: SubthemeConfig,
  batchIndex: number,
  batchSize: number
): string {
  const startIndex = batchIndex * batchSize;
  const difficulties: string[] = [];
  const channels: string[] = [];
  const stakes: string[] = [];
  const intentsForBatch: string[] = [];

  for (let i = 0; i < batchSize; i++) {
    const globalIdx = startIndex + i;
    difficulties.push(getDifficultyForIndex(globalIdx));
    channels.push(getChannelForIndex(globalIdx));
    stakes.push(getStakesForIndex(globalIdx));
    intentsForBatch.push(subtheme.intents[globalIdx % subtheme.intents.length]);
  }

  return `Tu es un expert en communication interpersonnelle et coaching conversationnel. 
Tu dois generer exactement ${batchSize} cartes d'entrainement pour l'application Bagou.

THEME: ${theme.label} (${theme.id})
SOUS-THEME: ${subtheme.label} (${subtheme.id})
LANGUE: Francais

EXEMPLES DE SITUATIONS pour ce sous-theme:
${subtheme.exampleSituations.map((s, i) => `- ${s}`).join("\n")}

Pour chaque carte, utilise les parametres suivants:
${difficulties.map((d, i) => `Carte ${i + 1}: difficulty="${d}", channel="${channels[i]}", stakes="${stakes[i]}", intent="${intentsForBatch[i]}"`).join("\n")}

REGLES IMPORTANTES:
- Chaque situation doit etre UNIQUE, REALISTE et CONCRETE (2 a 3 phrases courtes)
- CONCRET ET AUTO-SUFFISANT (regle n1) : nomme TOUJOURS les details specifiques dont l'utilisateur a besoin pour repondre. INTERDIT de rester vague avec "un projet", "un truc", "quelque chose", "une remarque", "une nouvelle" sans le preciser. Donne le detail exact : QUEL projet (ex: "l'appli de suivi de courses qu'il a codee ce week-end"), QUELLE phrase exacte a ete dite, QUEL objet, QUEL evenement. L'utilisateur doit savoir precisement a quoi il reagit et avoir de la matiere concrete pour formuler sa reponse.
- NE PRE-ECRIS JAMAIS LA REPONSE DE L'UTILISATEUR (regle n2) : la situation pose UNIQUEMENT le decor et ce que l'interlocuteur dit ou fait, puis s'arrete PILE au moment ou c'est a l'utilisateur de parler. Elle ne doit JAMAIS contenir ni suggerer la replique de l'utilisateur.
  INTERDIT ABSOLU : toute phrase qui met des mots dans la bouche de l'utilisateur. Pour decrire ce que fait l'utilisateur, n'emploie JAMAIS les tournures "tu dis", "tu ecris", "tu envoies (un message/email pour dire)", "tu reponds (que)", "tu expliques", "tu proposes", "tu demandes", "tu annonces", "tu racontes", "tu precises", "tu declares", "tu suggeres", "tu remercies", ni les imperatifs "dis-lui/reponds-lui/ecris-lui que...", ni "tu dois/tu vas lui dire/repondre/annoncer que...".
  La situation se TERMINE sur ce que dit ou fait l'interlocuteur (ses paroles a LUI entre guillemets), ou au plus par une amorce neutre type "C'est a toi de repondre." / "A toi de reagir." JAMAIS sur la replique de l'utilisateur.
  Exemple INTERDIT : "Ton ami a fait une super presentation sur le climat. Tu lui dis : 'Bravo, c'etait hyper clair !'"
  Exemple CORRECT : "Ton ami vient de terminer sa presentation sur le climat, visiblement fier de lui. Plusieurs collegues hochent la tete. C'est a toi de reagir."
- Si l'interlocuteur dit ou fait quelque chose, ECRIS-LE explicitement et cite SES paroles a LUI entre guillemets (ex: "Ton manager lache en reunion : 'On dirait que tu n'as pas vraiment bosse le sujet.'"). L'utilisateur reagit a du concret, jamais a un resume abstrait.
- PAS DE PLACEHOLDERS : interdit "projet X", "client Y", "entreprise Z", "la societe X", ou toute lettre/symbole qui remplace un vrai detail. Invente un detail concret et credible (ex: "le projet de refonte du site interne", "la cliente du resto d'a cote").
- GENERAL MAIS PAS TROP : des situations du quotidien que tout le monde peut vivre, mais toujours ancrees dans UN detail concret. Evite l'hyper-niche (jargon metier obscur, chiffres inutiles) ET le flou abstrait.
- Les situations doivent couvrir des aspects DIFFERENTS du sous-theme
- Adapte la complexite au niveau de difficulte (n1=debutant, n2=intermediaire, n3=avance)
- Le channel indique le contexte: "text"=message/SMS/email, "irl"=en personne, "voice"=appel/vocal
- Varie les roles, relations et contextes entre les cartes
- userGoal doit etre precis et actionnable, lie aux details concrets de la situation
- Les antiPatterns doivent etre des erreurs courantes a eviter
- Les constraints sont des contraintes specifiques a la situation
- Les variantRules donnent des regles pour generer des reponses safe/medium/bold
- Tout doit etre en FRANCAIS

Reponds UNIQUEMENT avec un JSON valide contenant un tableau "cards" de ${batchSize} objets avec cette structure exacte:
{
  "cards": [
    {
      "intent": "string",
      "situation": "string (2-3 phrases concretes et auto-suffisantes en francais ; pose le decor + ce que dit/fait l'interlocuteur, cite SES paroles entre guillemets ; ne contient JAMAIS la reponse de l'utilisateur ; jamais de flou type 'un projet'/'un truc' ni de placeholder 'projet X')",
      "speakerRole": "string (role du joueur, ex: 'collegue', 'ami', 'client')",
      "otherRole": "string (role de l'interlocuteur)",
      "relationship": "string (nature de la relation, ex: 'collegues proches', 'inconnus', 'couple')",
      "stakes": "string (low/medium/high)",
      "userGoal": "string (objectif precis et actionnable, ancre dans les details concrets de la situation)",
      "constraints": ["string array de contraintes contextuelles"],
      "tags": ["string array de tags pertinents"],
      "antiPatterns": ["string array de comportements a eviter"],
      "targetVibe": "string (le ton/ambiance visee, ex: 'chaleureux et sincere', 'professionnel mais detendu')",
      "modelAnswerRules": ["string array de regles pour la reponse modele"],
      "variantRulesSafe": ["string array de regles pour la variante safe"],
      "variantRulesMedium": ["string array de regles pour la variante medium"],
      "variantRulesBold": ["string array de regles pour la variante bold"]
    }
  ]
}`;
}

async function generateBatch(
  theme: ThemeConfig,
  subtheme: SubthemeConfig,
  batchIndex: number,
  batchSize: number
): Promise<Partial<InsertMotherCard>[]> {
  const prompt = buildPrompt(theme, subtheme, batchIndex, batchSize);
  const startIndex = batchIndex * batchSize;

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 4000,
        temperature: 0.9,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      const cards = parsed.cards;

      if (!Array.isArray(cards) || cards.length === 0) {
        console.warn(`[SeedCards] Empty or invalid response for ${theme.id}/${subtheme.id} batch ${batchIndex}, attempt ${attempt + 1}`);
        continue;
      }

      const built: Partial<InsertMotherCard>[] = cards.map((card: any, i: number) => {
        const globalIdx = startIndex + i;
        return {
          intent: card.intent || subtheme.intents[globalIdx % subtheme.intents.length],
          situation: card.situation || "",
          speakerRole: card.speakerRole || "",
          otherRole: card.otherRole || "",
          relationship: card.relationship || "",
          stakes: card.stakes || getStakesForIndex(globalIdx),
          userGoal: card.userGoal || "",
          constraints: card.constraints || [],
          tags: card.tags || [],
          antiPatterns: card.antiPatterns || [],
          targetVibe: card.targetVibe || "",
          modelAnswerRules: card.modelAnswerRules || [],
          variantRulesSafe: card.variantRulesSafe || [],
          variantRulesMedium: card.variantRulesMedium || [],
          variantRulesBold: card.variantRulesBold || [],
        };
      });

      // Enforce règle n2: a generated "situation" must never script the user's
      // reply. Auto-rewrite any leak before the cards leave the generator, so
      // preview / bulk-save / direct-save paths can never persist a leak.
      // This is FAIL-CLOSED: a card that still leaks after rewrites (or whose
      // rewrite errors out) is dropped, never returned for persistence.
      const sanitized = await Promise.all(
        built.map(async (c): Promise<Partial<InsertMotherCard> | null> => {
          if (!c.situation || !detectSituationLeak(c.situation).isLeak) return c;
          try {
            let s = c.situation;
            for (let r = 0; r < 3 && detectSituationLeak(s).isLeak; r++) {
              s = await rewriteSituationWithoutLeak({
                situation: s,
                otherRole: c.otherRole,
                speakerRole: c.speakerRole,
                relationship: c.relationship,
                userGoal: c.userGoal,
              });
            }
            if (detectSituationLeak(s).isLeak) {
              console.warn(
                `[SeedCards] dropping card that still leaks after rewrites (${theme.id}/${subtheme.id})`,
              );
              return null;
            }
            c.situation = s;
            return c;
          } catch (e: any) {
            console.warn(
              `[SeedCards] leak sanitize failed, dropping card for ${theme.id}/${subtheme.id}: ${e?.message || e}`,
            );
            return null;
          }
        }),
      );

      return sanitized.filter((c): c is Partial<InsertMotherCard> => c !== null);
    } catch (error) {
      console.error(`[SeedCards] Error generating batch ${batchIndex} for ${theme.id}/${subtheme.id}, attempt ${attempt + 1}:`, error);
      if (attempt === maxRetries - 1) {
        throw error;
      }
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }

  return [];
}

export async function generateSubthemeCards(
  storage: IStorage,
  themeId: string,
  subthemeId: string,
  forceRegenerate = false
): Promise<{ generated: number; skipped: boolean }> {
  const theme = THEMES_CONFIG.find((t) => t.id === themeId);
  if (!theme) throw new Error(`Theme not found: ${themeId}`);

  const subtheme = theme.subthemes.find((s) => s.id === subthemeId);
  if (!subtheme) throw new Error(`Subtheme not found: ${subthemeId} in theme ${themeId}`);

  const existing = await storage.getMotherCardsBySubtheme(themeId, subthemeId, "fr");

  const skipThreshold = Math.floor(CARDS_PER_SUBTHEME * 0.9);
  if (existing.length >= skipThreshold && !forceRegenerate) {
    console.log(`[SeedCards] Skipping ${themeId}/${subthemeId} - already has ${existing.length} cards`);
    return { generated: 0, skipped: true };
  }

  if (forceRegenerate && existing.length > 0) {
    console.log(`[SeedCards] Force regenerating ${themeId}/${subthemeId} - deleting ${existing.length} existing cards`);
    await storage.deleteMotherCardsBySubtheme(themeId, subthemeId);
  }

  const cardIdPrefix = buildCardIdPrefix(themeId, subthemeId);
  const packId = buildPackId(themeId, subthemeId);
  const totalBatches = Math.ceil(CARDS_PER_SUBTHEME / BATCH_SIZE);
  let totalGenerated = 0;

  console.log(`[SeedCards] Generating ${CARDS_PER_SUBTHEME} cards for ${themeId}/${subthemeId} in ${totalBatches} batches`);

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchSize = Math.min(BATCH_SIZE, CARDS_PER_SUBTHEME - batchIdx * BATCH_SIZE);
    const startNum = batchIdx * BATCH_SIZE + 1;

    console.log(`[SeedCards] Batch ${batchIdx + 1}/${totalBatches} for ${themeId}/${subthemeId}...`);

    try {
      const partialCards = await generateBatch(theme, subtheme, batchIdx, batchSize);

      const fullCards: InsertMotherCard[] = partialCards.map((card, i) => {
        const cardNum = startNum + i;
        const globalIdx = batchIdx * BATCH_SIZE + i;
        const paddedNum = String(cardNum).padStart(3, "0");

        return {
          cardId: `${cardIdPrefix}_${paddedNum}`,
          themeId,
          packId,
          subthemeId,
          language: "fr" as const,
          channel: getChannelForIndex(globalIdx),
          difficulty: getDifficultyForIndex(globalIdx),
          intent: card.intent || "",
          situation: card.situation || "",
          speakerRole: card.speakerRole || "",
          otherRole: card.otherRole || "",
          relationship: card.relationship || "",
          stakes: card.stakes || "medium",
          userGoal: card.userGoal || "",
          constraints: card.constraints || [],
          tags: card.tags || [],
          antiPatterns: card.antiPatterns || [],
          targetVibe: card.targetVibe || "",
          modelAnswerRules: card.modelAnswerRules || [],
          variantRulesSafe: card.variantRulesSafe || [],
          variantRulesMedium: card.variantRulesMedium || [],
          variantRulesBold: card.variantRulesBold || [],
        };
      });

      if (fullCards.length > 0) {
        await storage.createMotherCards(fullCards);
        totalGenerated += fullCards.length;
        console.log(`[SeedCards] Inserted ${fullCards.length} cards (batch ${batchIdx + 1}/${totalBatches})`);
      }

      if (batchIdx < totalBatches - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (error) {
      console.error(`[SeedCards] Failed batch ${batchIdx + 1} for ${themeId}/${subthemeId}:`, error);
    }
  }

  console.log(`[SeedCards] Completed ${themeId}/${subthemeId}: ${totalGenerated} cards generated`);
  return { generated: totalGenerated, skipped: false };
}

export interface GenerationProgress {
  totalThemes: number;
  totalSubthemes: number;
  completedSubthemes: number;
  currentTheme: string;
  currentSubtheme: string;
  totalCardsGenerated: number;
  skippedSubthemes: number;
  errors: string[];
}

export async function generateAllCards(
  storage: IStorage,
  onProgress?: (progress: GenerationProgress) => void
): Promise<GenerationProgress> {
  const progress: GenerationProgress = {
    totalThemes: THEMES_CONFIG.length,
    totalSubthemes: THEMES_CONFIG.reduce((sum, t) => sum + t.subthemes.length, 0),
    completedSubthemes: 0,
    currentTheme: "",
    currentSubtheme: "",
    totalCardsGenerated: 0,
    skippedSubthemes: 0,
    errors: [],
  };

  console.log(`[SeedCards] Starting generation of ${progress.totalSubthemes} sub-themes across ${progress.totalThemes} themes`);
  console.log(`[SeedCards] Target: ${progress.totalSubthemes * CARDS_PER_SUBTHEME} total cards`);

  for (const theme of THEMES_CONFIG) {
    progress.currentTheme = theme.id;
    console.log(`\n[SeedCards] === Theme: ${theme.label} (${theme.id}) ===`);

    for (const subtheme of theme.subthemes) {
      progress.currentSubtheme = subtheme.id;

      try {
        const result = await generateSubthemeCards(storage, theme.id, subtheme.id);
        progress.totalCardsGenerated += result.generated;

        if (result.skipped) {
          progress.skippedSubthemes++;
        }

        progress.completedSubthemes++;
        onProgress?.(progress);
      } catch (error: any) {
        const errorMsg = `Failed ${theme.id}/${subtheme.id}: ${error.message}`;
        console.error(`[SeedCards] ${errorMsg}`);
        progress.errors.push(errorMsg);
        progress.completedSubthemes++;
        onProgress?.(progress);
      }
    }
  }

  console.log(`\n[SeedCards] === Generation Complete ===`);
  console.log(`[SeedCards] Total cards generated: ${progress.totalCardsGenerated}`);
  console.log(`[SeedCards] Skipped sub-themes: ${progress.skippedSubthemes}`);
  console.log(`[SeedCards] Errors: ${progress.errors.length}`);

  return progress;
}

export async function generateCardsForPreview(
  themeId: string,
  themeLabel: string,
  subthemeId: string,
  subthemeLabel: string,
  subthemeIntents: string[],
  subthemeExamples: string[],
  count: number
): Promise<InsertMotherCard[]> {
  const theme: ThemeConfig = {
    id: themeId,
    label: themeLabel,
    subthemes: [{
      id: subthemeId,
      label: subthemeLabel,
      intents: subthemeIntents.length > 0 ? subthemeIntents : ["open", "respond", "close"],
      exampleSituations: subthemeExamples,
    }],
  };
  const subtheme = theme.subthemes[0];
  const cardIdPrefix = buildCardIdPrefix(themeId, subthemeId);
  const packId = buildPackId(themeId, subthemeId);

  const totalBatches = Math.ceil(count / BATCH_SIZE);
  const allCards: InsertMotherCard[] = [];

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchSize = Math.min(BATCH_SIZE, count - batchIdx * BATCH_SIZE);
    const startNum = batchIdx * BATCH_SIZE + 1;

    try {
      const partialCards = await generateBatch(theme, subtheme, batchIdx, batchSize);

      const fullCards: InsertMotherCard[] = partialCards.map((card, i) => {
        const cardNum = startNum + i;
        const globalIdx = batchIdx * BATCH_SIZE + i;
        const paddedNum = String(cardNum).padStart(3, "0");

        return {
          cardId: `${cardIdPrefix}_PREV_${paddedNum}`,
          themeId,
          packId,
          subthemeId,
          language: "fr" as const,
          channel: getChannelForIndex(globalIdx),
          difficulty: getDifficultyForIndex(globalIdx),
          intent: card.intent || "",
          situation: card.situation || "",
          speakerRole: card.speakerRole || "",
          otherRole: card.otherRole || "",
          relationship: card.relationship || "",
          stakes: card.stakes || "medium",
          userGoal: card.userGoal || "",
          constraints: card.constraints || [],
          tags: card.tags || [],
          antiPatterns: card.antiPatterns || [],
          targetVibe: card.targetVibe || "",
          modelAnswerRules: card.modelAnswerRules || [],
          variantRulesSafe: card.variantRulesSafe || [],
          variantRulesMedium: card.variantRulesMedium || [],
          variantRulesBold: card.variantRulesBold || [],
        };
      });

      allCards.push(...fullCards);

      if (batchIdx < totalBatches - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (error) {
      console.error(`[SeedCards] Preview batch ${batchIdx + 1} failed:`, error);
      throw error;
    }
  }

  return allCards;
}
