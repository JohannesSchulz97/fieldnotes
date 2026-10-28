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
const gaps: string[] = [];
// Stability is judged per form: the same words of a sentence, found in several runs, should get
// the same entry. Which constructs a run picks (at most 4 per selection) may legitimately vary.
let repeatedForms = 0;
let consistentForms = 0;
const confusions = new Map<string, number>();
const key = (form: string) => form.toLowerCase().replace(/\s+/g, " ").trim();

for (const { sentence, context } of sample) {
  const byForm = new Map<string, string[]>();
  for (let r = 0; r < Number(runArg); r++) {
    const found = await llmIdentifyGrammar({ language, span: sentence, sentence, context, catalog: constructs, savedNames: [] });
    total += found.length;
    for (const c of found) {
      if (!c.constructId) {
        fallbacks++;
        gaps.push(`${c.name}  ←  "${c.form}"`);
      }
      const ids = byForm.get(key(c.form)) ?? [];
      byForm.set(key(c.form), [...ids, c.constructId ?? "(not in catalogue)"]);
    }
  }
  for (const ids of byForm.values()) {
    if (ids.length < 2) continue;
    repeatedForms++;
    const distinct = [...new Set(ids)].sort();
    if (distinct.length === 1) consistentForms++;
    else {
      const k = distinct.map((id) => names.get(id) ?? id).join("  ↔  ");
      confusions.set(k, (confusions.get(k) ?? 0) + 1);
    }
  }
  console.log(`${sentence.slice(0, 90)}…`);
}

const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(0)}%`;
console.log(`\nSentences: ${count}, runs each: ${runArg}, constructs found: ${total}`);
console.log(`Not in catalogue: ${fallbacks} (${pct(fallbacks, total)})`);
console.log(`Forms found in 2+ runs that got the same entry every time: ${consistentForms}/${repeatedForms} (${pct(consistentForms, repeatedForms)})`);
console.log(`\nNamed freely (possible gaps):\n${[...new Set(gaps)].map((g) => `  - ${g}`).join("\n") || "  none"}`);
console.log(
  `\nSame words, different entries across runs (possible confusions):\n${
    [...confusions.entries()].map(([k, n]) => `  - ${k} (${n})`).join("\n") || "  none"
  }`
);
