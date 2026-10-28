/**
 * Evaluates a grammar catalogue on the learner's own texts: classifies sample sentences several
 * times and reports how often no entry fits (gaps), how stable the classification is across runs,
 * and which entries get mixed up. Costs a few LLM calls per sentence.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/eval-grammar-catalog.mts <lang> [sentences=20] [runs=3]
 */
import { listExtractions, getExtractionSentences } from "../src/lib/db/extractions";
import { activeConstructs, getCatalog } from "../src/lib/grammar-catalog";
import { llmIdentifyGrammar } from "../src/lib/llm/grammar";

const [language, sentenceArg = "20", runArg = "3"] = process.argv.slice(2);
const catalog = language ? getCatalog(language) : null;
if (!catalog) {
  console.error("Usage: eval-grammar-catalog.mts <lang with a catalogue> [sentences] [runs]");
  process.exit(1);
}
const constructs = activeConstructs(catalog);
const names = new Map(constructs.map((c) => [c.id, c.name]));

// Sentences spread evenly over all texts, skipping very short ones.
const pool: { sentence: string; context: string }[] = [];
for (const source of await listExtractions(language)) {
  const data = await getExtractionSentences(source.id);
  data?.sentences.forEach((sentence, i) => {
    if (sentence.split(/\s+/).length >= 6) {
      pool.push({ sentence, context: data.sentences.slice(Math.max(0, i - 1), i + 2).join(" ") });
    }
  });
}
const count = Math.min(Number(sentenceArg), pool.length);
const sample = Array.from({ length: count }, (_, k) => pool[Math.floor((k * pool.length) / count)]);

let total = 0;
let fallbacks = 0;
let stableSentences = 0;
const gaps: string[] = [];
const confusions = new Map<string, number>();

for (const { sentence, context } of sample) {
  const runs: string[][] = [];
  for (let r = 0; r < Number(runArg); r++) {
    const found = await llmIdentifyGrammar({ language, span: sentence, sentence, context, catalog: constructs, savedNames: [] });
    total += found.length;
    for (const c of found.filter((c) => !c.constructId)) {
      fallbacks++;
      gaps.push(`${c.name}  ←  "${c.form}"`);
    }
    runs.push(found.flatMap((c) => (c.constructId ? [c.constructId] : [])).sort());
  }
  const all = new Set(runs.flat());
  const inEvery = [...all].filter((id) => runs.every((r) => r.includes(id)));
  if (inEvery.length === all.size) stableSentences++;
  // Entries that appear in some runs but not others, for the same sentence: candidates for confusion.
  const unstable = [...all].filter((id) => !inEvery.includes(id)).sort();
  for (let i = 0; i < unstable.length; i++) {
    for (let j = i + 1; j < unstable.length; j++) {
      const key = `${names.get(unstable[i])}  ↔  ${names.get(unstable[j])}`;
      confusions.set(key, (confusions.get(key) ?? 0) + 1);
    }
  }
  console.log(`${inEvery.length === all.size ? "stable  " : "unstable"} ${sentence.slice(0, 70)}…  [${[...all].join(", ")}]`);
}

console.log(`\nSentences: ${count}, runs each: ${runArg}, constructs found: ${total}`);
console.log(`Not in catalogue: ${fallbacks} (${((100 * fallbacks) / Math.max(1, total)).toFixed(0)}%)`);
console.log(`Sentences classified identically in every run: ${stableSentences}/${count}`);
console.log(`\nNamed freely (possible gaps):\n${[...new Set(gaps)].map((g) => `  - ${g}`).join("\n") || "  none"}`);
console.log(
  `\nEntries appearing in some runs only, per sentence (possible confusions):\n${
    [...confusions.entries()].map(([k, n]) => `  - ${k} (${n})`).join("\n") || "  none"
  }`
);
