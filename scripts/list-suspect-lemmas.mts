/**
 * Read-only: lists vocabulary entries whose lemma probably breaks the lemma rules, for manual
 * review: a single word's lemma that ends in a governed preposition ("appeler à"), or a verb that
 * is not in the infinitive ("étant"). Nothing is rewritten, since a changed lemma is a changed match key.
 * The checks are French; other languages are skipped.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/list-suspect-lemmas.mts
 */
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { vocabEntries } from "../src/lib/db/schema";

const PREPOSITIONS = new Set(["à", "de", "d'", "du", "des", "en", "sur", "avec", "pour", "par", "dans", "contre", "vers", "sans", "sous", "chez", "entre"]);
const INFINITIVE = /(er|ir|re|oir)$/;

const rows = await db.select().from(vocabEntries).where(eq(vocabEntries.language, "fr"));
const suspects: { lemma: string; why: string; pos: string | null; kind: string }[] = [];

for (const r of rows) {
  const words = r.lemma.split(/[\s']+/).filter(Boolean);
  const last = r.lemma.endsWith("'") ? r.lemma.slice(-2) : words[words.length - 1];
  if (words.length > 1 && PREPOSITIONS.has(last) && r.partOfSpeech === "verb") {
    suspects.push({ lemma: r.lemma, why: "ends in a preposition", pos: r.partOfSpeech, kind: r.kind });
  } else if (r.kind === "word" && r.partOfSpeech === "verb" && !INFINITIVE.test(r.lemma)) {
    suspects.push({ lemma: r.lemma, why: "verb, not an infinitive", pos: r.partOfSpeech, kind: r.kind });
  }
}

suspects.sort((a, b) => a.why.localeCompare(b.why) || a.lemma.localeCompare(b.lemma));
for (const s of suspects) console.log(`${s.why.padEnd(26)} ${s.lemma}  [${s.kind}, ${s.pos}]`);
console.log(`\n${suspects.length} of ${rows.length} French entries to review`);
