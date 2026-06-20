import OpenAI from "openai";
import type { MotherCard } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const MODEL = "gpt-5-mini";

// Clitic pronouns that can sit between "tu" and the verb (tu lui dis, tu m'écris...)
const CLITICS = "(?:(?:lui|leur|me|nous|vous|y|en)\\s+|m['\u2019]\\s*)*";

// Tier A: unambiguously communicative 2nd-person verbs. A bare match is a leak
// because they always describe the user putting words out ("tu dis", "tu écris").
const TIER_A = [
  "dis", "écris", "ecris", "réponds", "reponds", "répliques", "repliques",
  "rétorques", "retorques", "expliques", "annonces", "demandes", "déclares",
  "declares", "affirmes", "envoies", "racontes", "précises", "precises",
  "remercies", "félicites", "felicites", "objectes", "réclames", "reclames",
  "suggères", "suggeres", "proposes",
];

// Tier B: verbs that are only a leak when they introduce content (quote / "que").
const TIER_B = [
  "lances", "balances", "glisses", "postes", "tapes", "ajoutes", "confies",
  "avoues", "insistes", "rappelles", "répètes", "repetes", "commentes",
  "murmures", "cries", "chuchotes", "promets", "menaces", "ordonnes", "exiges",
];

// Imperative stems used to script the reply ("dis-lui que…", "réponds-lui").
const IMPERATIVES = [
  "dis", "réponds", "reponds", "écris", "ecris", "explique", "propose",
  "demande", "annonce", "ajoute", "précise", "precise", "rappelle", "raconte",
  "réplique", "replique", "rétorque", "retorque", "réclame", "reclame",
  "avoue", "confie", "promets", "menace", "remercie", "félicite", "felicite",
  "suggère", "suggere",
];

// Modal/intent verbs that, when followed by a communicative infinitive AND
// content, also script the reply ("tu dois lui dire que…", "tu vas répondre : …").
const MODALS = "(?:dois|devras|vas|comptes|peux|pourrais|veux|voudrais)";
const INFINITIVES = [
  "dire", "écrire", "ecrire", "répondre", "repondre", "expliquer", "annoncer",
  "proposer", "demander", "préciser", "preciser", "avouer", "déclarer",
  "declarer", "raconter", "rétorquer", "retorquer",
];
const CONTENT_MARKER = "(?::|\u00ab|\u00bb|\u201c|\u201d|\"|\\bque\\b|\\bqu['\u2019])";

// Negative lookbehind: skip relative clauses like "l'approche que tu proposes"
// (the verb describes a noun, it is not the user being told what to say).
const NOT_RELATIVE = "(?<!\\bque\\s)(?<!\\bqu['\u2019])(?<!\\bdont\\s)";

// Every communicative 2nd-person verb. A leak only happens when the user's own
// content (a quote, ":" or "que …") follows — naming the channel alone
// ("tu écris à un client.", "tu envoies un message à Paul.") is NOT a leak.
const COMM_ALL = [...TIER_A, ...TIER_B];
const COMM_2P_SET = new Set(COMM_ALL.map((v) => v.toLowerCase()));

const RE_USER_CONTENT = new RegExp(
  `${NOT_RELATIVE}\\btu\\s+${CLITICS}(?:${COMM_ALL.join("|")})\\b[^.!?\\n]{0,40}?${CONTENT_MARKER}`,
  "gi",
);
// A communicative 2nd-person verb that introduces speech with a colon, even
// without an adjacent "tu" ("… et lui dis : « … »", "tu expliques : '…'").
// The colon is the marker, so this still fires when the quoted content holds
// apostrophes (j'ai, d'être) that defeat quote-span detection. 3rd-person
// interlocutor forms (dit, répond, écrit…) are absent from COMM_ALL, so
// "Il te répond : …" is never flagged.
const RE_2P_COLON = new RegExp(
  `${NOT_RELATIVE}\\b(?:${COMM_ALL.join("|")})\\b[^.!?\\n]{0,25}?:`,
  "gi",
);
const RE_IMPERATIVE = new RegExp(
  `\\b(?:${IMPERATIVES.join("|")})-(?:lui|leur|moi|le|la|les|nous|y|en)\\b`,
  "gi",
);
const RE_MODAL = new RegExp(
  `${NOT_RELATIVE}\\btu\\s+${MODALS}\\s+${CLITICS}(?:${INFINITIVES.join("|")})\\b[^.!?\\n]{0,60}?${CONTENT_MARKER}`,
  "gi",
);

// Paraphrased reply leak: a high-risk communicative 2nd-person verb whose
// DIRECT OBJECT is the communicated content itself, with NO quote/colon/"que"
// marker — e.g. "tu annonces ton départ", "tu proposes une remise de 10%",
// "tu expliques ton retard au client". These reveal what the user will say.
// An optional recipient ("à l'équipe", "au client") may sit between the verb
// and its object. Notes that keep this precise:
//  - Medium verbs (écrire/envoyer) are excluded, so "tu écris à un client" and
//    "tu envoies un message à Paul" (channel only, no content) stay allowed.
//  - Only the PRESENT 2nd-person form fires. Stating intent with an infinitive
//    ("tu veux proposer une remise") is allowed scene-setting, not a leak.
//  - NOT_RELATIVE still skips "l'approche que tu proposes".
const HIGH_RISK_CONTENT = [
  "annonces", "expliques", "proposes", "demandes", "racontes", "déclares",
  "declares", "suggères", "suggeres", "réclames", "reclames", "précises",
  "precises", "objectes", "affirmes", "avoues", "confies", "promets",
  "exiges", "ordonnes",
];
// Determiner that opens a content noun-phrase object (possessive / article /
// demonstrative). A recipient is introduced by "à/au/aux" instead.
const CONTENT_OBJ_DET =
  "(?:ton|ta|tes|mon|ma|mes|son|sa|ses|notre|nos|votre|vos|leur|leurs|le|la|les|l['\u2019]|un|une|des|ce|cet|cette|ces)";
const OPT_RECIPIENT = "(?:(?:\u00e0|au|aux)\\s+(?:[A-Za-z\u00c0-\u00ff'\u2019-]+\\s+){1,4})?";
const RE_PARAPHRASE = new RegExp(
  `${NOT_RELATIVE}\\btu\\s+${CLITICS}(?:${HIGH_RISK_CONTENT.join("|")})\\b\\s+${OPT_RECIPIENT}${CONTENT_OBJ_DET}\\s+[A-Za-z\u00c0-\u00ff]`,
  "gi",
);

const RULES = [RE_USER_CONTENT, RE_2P_COLON, RE_IMPERATIVE, RE_MODAL, RE_PARAPHRASE];

// Speech verbs that attribute a quote to the INTERLOCUTOR ("il dit", "elle te
// répond", "Marc lança : …", "… en disant, '…'"). Covers 3rd-person present,
// passé simple, past participle and the gérondif/participe présent. French
// 3rd-person forms (dit, répond, lance, disant…) differ from the 2nd-person
// leak forms (dis, réponds, lances…), so this never matches the user speaking.
const SPEECH_3P =
  /\b(?:dit|dis(?:ai[ts]|aient)|disant|r[ée]pond(?:u|it|ant)?|lance|lanc(?:[ée]|a|ant)|l[âa]ch(?:e|[ée]|a|ant)|demand(?:e|[ée]|a|ant)|ajout(?:e|[ée]|a|ant)|r[ée]torqu(?:e|[ée]|a|ant)|r[ée]pliqu(?:e|[ée]|a|ant)|s'exclam(?:e|a|ant)|s'[ée]cri(?:e|a|ant)|murmur(?:e|[ée]|a|ant)|soupir(?:e|[ée]|a|ant)|insist(?:e|[ée]|a|ant)|expliqu(?:e|[ée]|a|ant)|annonc(?:e|[ée]|a|ant)|d[ée]clar(?:e|[ée]|a|ant)|[ée]crit|[ée]crivit|gliss(?:e|[ée]|a|ant)|r[ée]p[èe]te|r[ée]p[ée]t(?:[ée]|a|ant)|continue|reprend|reprit|pr[ée]cis(?:e|[ée]|a|ant)|conclut|pr[ée]vient|rappelle|interroge|questionne|propos(?:e|[ée]|a|ant)|sugg[èe]re|sugg[ée]r(?:[ée]|a|ant)|objecte|confi(?:e|[ée]|a|ant)|avou(?:e|[ée]|a|ant)|r[ée]agit|comment(?:e|[ée]|a|ant)|chuchot(?:e|[ée]|a|ant)|coupe|intervient|encha[îi]ne|racont(?:e|[ée]|a|ant)|signale|balance|grommelle|maugr[ée]e|fit|fait\s+remarquer)\b/i;

// A user-action antecedent: "tu (lui) écris/proposes/dis …". When a dangling
// (un-attributed) quote follows one of these, the quote is the user's reply.
const TU_COMM_ANTECEDENT = new RegExp(
  `\\btu\\s+${CLITICS}(?:${COMM_ALL.join("|")})\\b`,
  "i",
);

// Quote spans for each style. Iterating spans (not raw quote chars) means we
// only ever inspect the OPENING position, so closing quotes never false-match.
const QUOTE_SPANS = [
  /\u00ab[^\u00bb]{0,400}\u00bb/g, // « … »
  /\u201c[^\u201d]{0,400}\u201d/g, // " … "
  /"[^"]{0,400}"/g, // " … "
  /(?<=[\s:(\u2014\u2013])\u2018[^\u2019]{1,400}?\u2019/g, // ' … '
  /(?<=[\s:(\u2014\u2013])'[^']{1,400}?'(?=[\s.,!?;:)\u2014\u2013]|$)/g, // ' … '
];

/**
 * Detects a quote whose words belong to the USER — either `… et lui dis :
 * "Avec ton style…"` (colon introduced by a 2nd-person verb) or a dangling
 * quote that follows a user action, e.g. `Tu écris à ton voisin. "Je suis
 * désolé…"`. A quote is the interlocutor's (OK) when it is introduced by a
 * speech verb (`il dit`, `en disant,`), by a colon whose introducer is not a
 * 2nd-person verb (`Marc : …`), or when no user action precedes it.
 */
function findUserQuote(text: string): string | null {
  const starts: number[] = [];
  for (const re of QUOTE_SPANS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      starts.push(m.index);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  starts.sort((a, b) => a - b);
  for (const start of starts) {
    const before = text.slice(Math.max(0, start - 120), start);
    if (SPEECH_3P.test(before)) continue; // interlocutor speaks
    const colon = /([\p{L}'\u2019-]+)\s*:\s*$/u.exec(before);
    if (colon) {
      if (COMM_2P_SET.has(colon[1].toLowerCase())) {
        return text.slice(start, start + 48).replace(/\s+/g, " ").trim();
      }
      continue; // "Marc : …" / "Elle dit : …" → interlocutor
    }
    if (TU_COMM_ANTECEDENT.test(before)) {
      return text.slice(start, start + 48).replace(/\s+/g, " ").trim();
    }
  }
  return null;
}

export interface LeakResult {
  isLeak: boolean;
  matches: string[];
}

/**
 * Heuristic detector for "reply leaks": situations that state, quote, or
 * paraphrase what the USER is supposed to say instead of stopping at the moment
 * it becomes the user's turn. Scene-setting verbs (tu vois, tu reçois, tu
 * remarques, "ton collègue te dit …") and the interlocutor's own quoted line
 * are intentionally NOT flagged.
 */
export function detectSituationLeak(text: string): LeakResult {
  if (!text) return { isLeak: false, matches: [] };
  const found = new Set<string>();
  for (const rule of RULES) {
    rule.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.exec(text)) !== null) {
      found.add(m[0].trim().replace(/\s+/g, " "));
      if (m.index === rule.lastIndex) rule.lastIndex++;
    }
  }
  const userQuote = findUserQuote(text);
  if (userQuote) found.add(userQuote);
  return { isLeak: found.size > 0, matches: Array.from(found) };
}

/**
 * Rewrites a card's `situation` so it sets the scene and the interlocutor's
 * words but stops exactly when it becomes the user's turn — removing any
 * scripting of the user's own reply. Returns the cleaned situation text.
 */
export async function rewriteSituationWithoutLeak(card: {
  situation: string;
  otherRole?: string;
  speakerRole?: string;
  relationship?: string;
  userGoal?: string;
  channel?: string;
}): Promise<string> {
  const channelHint =
    card.channel === "text"
      ? "Canal : message/SMS/email écrit."
      : card.channel === "voice"
      ? "Canal : appel/vocal."
      : card.channel === "irl"
      ? "Canal : en personne."
      : "";

  const prompt = `Tu nettoies la "situation" d'une carte d'entraînement à la communication (app Bagou, en français).

PROBLÈME À CORRIGER : la situation ne doit JAMAIS contenir, citer ni résumer la réponse de l'utilisateur. Elle pose UNIQUEMENT le décor et ce que dit ou fait l'interlocuteur, puis s'arrête PILE au moment où c'est à l'utilisateur de parler.

RÈGLES :
- Garde le décor concret. Tu peux dire que l'utilisateur va écrire/appeler/parler (le canal), mais JAMAIS le contenu de ce qu'il va dire.
- SUPPRIME toute réplique de l'utilisateur, qu'elle soit :
  • dictée ("tu dis", "tu écris", "tu réponds que", "dis-lui que", "tu lui expliques que", "tu proposes : '...'"),
  • résumée/paraphrasée, AVEC ou SANS "que" ("tu annonces que le client se retire", "tu annonces ton départ", "tu expliques ton retard au client", "tu proposes une remise de 10%", "tu demandes une augmentation"),
  • OU déplacée dans une citation isolée (une phrase entre guillemets qui n'est PAS attribuée à l'interlocuteur). NE LAISSE JAMAIS une citation pendante des mots de l'utilisateur.
- ACTE DE PAROLE AU PRÉSENT : si l'utilisateur est décrit en train de parler au présent ("tu racontes ton anecdote", "tu proposes une offre", "tu expliques ton choix", "tu demandes une augmentation"), NE garde PAS ce présent. Reformule en INTENTION avec un infinitif ("tu veux raconter ton anecdote", "tu comptes proposer une offre", "tu t'apprêtes à expliquer ton choix", "tu veux demander une augmentation") OU pose le sujet comme décor. Tu peux GARDER le thème/sujet, mais jamais l'acte de parole conjugué au présent ("tu racontes/proposes/expliques/annonces/demandes…").
- La SEULE parole autorisée entre guillemets est celle de l'INTERLOCUTEUR, et elle doit être attribuée juste avant ("Il te répond : '…'", "Marc lance : '…'").
- La situation se termine sur ce que dit/fait l'interlocuteur, ou par une amorce neutre ("C'est à toi de répondre.", "À toi de réagir.") si c'est naturel. Ne termine JAMAIS sur une citation des mots de l'utilisateur.
- 2 à 3 phrases courtes, concrètes, en français. Reste fidèle au décor, aux rôles et à l'enjeu d'origine.
- Si la situation ne contient AUCUNE réplique de l'utilisateur, renvoie-la quasiment inchangée.

EXEMPLES :
- MAUVAIS : "Tu écris à ton voisin. 'Je suis désolé pour le bruit du chien hier soir.'" → BON : "Le chien a aboyé tard hier soir et a dérangé ton voisin. Tu veux lui écrire pour t'excuser. C'est à toi de lui écrire."
- MAUVAIS : "Tu te tournes vers Alice et lui dis : 'J'ai adoré ton approche.'" → BON : "Le projet de groupe vient de se terminer et l'approche de ta collègue Alice t'a impressionné. Tu te tournes vers elle pour lui faire un retour. À toi de parler."
- MAUVAIS : "Tu proposes une nouvelle répartition. 'Je pense que je pourrais prendre le design.' C'est à toi de répondre." → BON : "En réunion d'équipe, tu veux proposer une nouvelle répartition des tâches du projet. C'est à toi de prendre la parole."
- MAUVAIS (paraphrase sans guillemets) : "Tu annonces ton départ à l'équipe. Tout le monde se tait." → BON : "Tu as décidé de quitter l'entreprise et tu réunis ton équipe pour le leur apprendre. Tout le monde se tait. C'est à toi de parler."
- MAUVAIS (paraphrase sans guillemets) : "Tu proposes une remise de 10% au client mécontent." → BON : "Un client mécontent conteste sa facture et attend un geste de ta part. C'est à toi de répondre."
- BON (à GARDER tel quel) : "Tu écris à un client qui conteste le contrat. Il te répond : 'Je ne suis pas d'accord avec ces conditions.'" (la citation est celle de l'interlocuteur).
- CAS "mauvaise nouvelle déjà annoncée" : quand le vrai tour de l'utilisateur est de GÉRER LA RÉACTION ou de RÉPONDRE À UNE QUESTION de l'interlocuteur, transforme l'annonce/la décision de l'utilisateur en simple CONTEXTE (fait posé, passé), jamais en "tu annonces que …" ni "tu dois annoncer que …" ni "tu dois lui dire que …". MAUVAIS : "Tu annonces à Sophie que son projet a été refusé. Elle te regarde, surprise. C'est à toi de répondre." → BON : "Tu viens d'apprendre à ta collègue Sophie que son projet a été refusé. Elle te regarde, surprise. C'est à toi de répondre." MAUVAIS : "Tu dois annoncer à tes parents que tu arrêtes tes études. Ta mère te demande ce qui t'amène à cette décision." → BON : "Tu as décidé d'arrêter tes études et tu en parles à tes parents en personne. Ta mère, inquiète, te demande ce qui t'amène à cette décision. C'est à toi de répondre."

CONTEXTE :
- Rôle de l'utilisateur : ${card.speakerRole || "?"}
- Interlocuteur : ${card.otherRole || "?"}
- Relation : ${card.relationship || "?"}
- Objectif de l'utilisateur : ${card.userGoal || "?"}
- ${channelHint}

SITUATION ACTUELLE :
"""${card.situation}"""

Réponds UNIQUEMENT avec un JSON : { "situation": "..." }`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    reasoning_effort: "minimal",
    max_completion_tokens: 600,
  });

  const content = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  const cleaned = typeof parsed.situation === "string" ? parsed.situation.trim() : "";
  if (!cleaned) throw new Error("Empty rewrite result");
  return cleaned;
}
