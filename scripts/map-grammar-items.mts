/**
 * Links saved grammar items to their grammar catalogue entries: items saved before the catalogue
 * existed (or saved as "not in catalogue") are classified by the LLM, and linked items whose
 * stored name, category or level drifted from the catalogue are synced. Two items that turn out to
 * be the same construct are merged.
 *
 * Dry run by default; pass --apply to write. Run again after catalogue updates.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/map-grammar-items.mts [--apply]
 *   (add --env-file=.env.turso after .env.local to run against the hosted database)
 */
import { activeConstructs, getCatalog, getConstruct } from "../src/lib/grammar-catalog";
import { assignConstruct, listGrammarItems } from "../src/lib/db/grammar";
import { llmClassifySavedConstruct } from "../src/lib/llm/grammar";

const apply = process.argv.includes("--apply");
const items = await listGrammarItems();
const languages = [...new Set(items.map((i) => i.language))];

for (const language of languages) {
  const catalog = getCatalog(language);
  if (!catalog) {
    console.log(`${language}: no catalogue, skipped`);
    continue;
  }
  const constructs = activeConstructs(catalog);
  for (const item of items.filter((i) => i.language === language)) {
    // listGrammarItems shows catalogue data; the stored values are what may need syncing.
    const target = item.constructId
      ? getConstruct(language, item.constructId)
      : await classify(language, constructs, item);
    if (!target) {
      console.log(`${language} "${item.name}": ${item.constructId ? "construct no longer in catalogue" : "no catalogue entry fits"}, left as is`);
      continue;
    }
    console.log(`${language} "${item.name}" -> ${target.id} "${target.name}" (${target.level}, ${target.category})`);
    if (apply) await assignConstruct(item.id, target);
  }
}
console.log(apply ? "Applied." : "Dry run; pass --apply to write.");

async function classify(
  language: string,
  constructs: ReturnType<typeof activeConstructs>,
  item: (typeof items)[number]
) {
  const id = await llmClassifySavedConstruct({ language, catalog: constructs, item });
  return id ? getConstruct(language, id) : null;
}
