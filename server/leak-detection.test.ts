import { detectSituationLeak } from "./leak-detection";

/**
 * Lightweight regression spec for the reply-leak detector. No test runner is
 * configured in this project, so this file is a self-contained assertion script
 * runnable with: `tsx server/leak-detection.test.ts`. It exits non-zero if any
 * case fails, so it can gate the detector against regressions.
 *
 * A "leak" = the situation states / quotes / paraphrases what the USER will
 * say. Scene-setting and the interlocutor's own quoted line are NOT leaks.
 */
const LEAKS: string[] = [
  // Dictated reply (colon + quote)
  "Tu te tournes vers Alice et lui dis : « J'ai adoré ton approche. »",
  // "que" content
  "Ton chef te critique. Tu lui réponds que tu n'es pas d'accord.",
  // Imperative scripting
  "Ton ami est en retard. Dis-lui que tu en as assez.",
  // Modal + infinitive + content
  "Ta mère insiste. Tu dois lui répondre que tu pars quand même : « Désolé. »",
  // Dangling user quote after a user action
  "Tu écris à ton voisin. « Je suis désolé pour le bruit du chien hier soir. »",
  // Paraphrased intent, NO marker (the key cases the detector used to miss)
  "Tu annonces ton départ à l'équipe. Tout le monde se tait.",
  "Tu expliques ton retard au client qui patiente.",
  "Un client conteste sa facture. Tu proposes une remise de 10%.",
  "Ton patron te reçoit. Tu demandes une augmentation.",
  "Tu racontes ta version des faits à ton manager.",
  "Face au jury, tu déclares ton intérêt pour le poste.",
];

const SAFE: string[] = [
  // Channel only (no content) — medium verbs must stay allowed
  "Tu écris à un client qui conteste le contrat. À toi de jouer.",
  "Tu envoies un message à Paul pour fixer un rendez-vous.",
  // Interlocutor's own quoted line + neutral prompt
  "Ton collègue te dit : « On doit parler de ton rapport. » C'est à toi de répondre.",
  "Il te répond : « Je ne suis pas d'accord avec ces conditions. »",
  // Stating intent with an infinitive is allowed scene-setting
  "En réunion, tu veux proposer une nouvelle répartition des tâches. À toi de parler.",
  "Tu comptes annoncer ta décision à tes parents ce soir.",
  // Scene-setting perception verbs
  "Tu remarques que ton voisin a l'air agacé par le bruit.",
  "Tu reçois un mail de ton manager qui te convoque en urgence.",
  // Relative clause: the verb describes a noun, not the user being scripted
  "L'approche que tu proposes ne convient pas à ton chef.",
];

let failures = 0;
const check = (text: string, expected: boolean) => {
  const { isLeak, matches } = detectSituationLeak(text);
  const ok = isLeak === expected;
  if (!ok) {
    failures++;
    console.error(
      `FAIL [expected ${expected ? "LEAK" : "OK"}, got ${isLeak ? "LEAK" : "OK"}]${
        matches.length ? ` matches=${JSON.stringify(matches)}` : ""
      }: ${text}`,
    );
  }
};

for (const t of LEAKS) check(t, true);
for (const t of SAFE) check(t, false);

if (failures > 0) {
  console.error(`\n${failures} detector case(s) failed.`);
  process.exit(1);
}
console.log(`Detector spec passed: ${LEAKS.length} leak + ${SAFE.length} safe cases.`);
