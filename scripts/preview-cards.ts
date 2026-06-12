import { generateCardsForPreview, THEMES_CONFIG } from "../server/seed-cards";

async function main() {
  const themeId = process.argv[2] || "SOCIAL";
  const subthemeId = process.argv[3] || "compliments";
  const count = Number(process.argv[4] || 5);

  const theme = THEMES_CONFIG.find((t) => t.id === themeId)!;
  const subtheme = theme.subthemes.find((s) => s.id === subthemeId)!;

  const cards = await generateCardsForPreview(
    theme.id,
    theme.label,
    subtheme.id,
    subtheme.label,
    subtheme.intents,
    subtheme.exampleSituations,
    count,
  );

  cards.forEach((c, i) => {
    console.log(`\n--- Carte ${i + 1} [${c.difficulty}/${c.channel}/${c.stakes}] ---`);
    console.log(`SITUATION : ${c.situation}`);
    console.log(`OBJECTIF  : ${c.userGoal}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
