/**
 * One-off: rewrites stored French noun lemmas from the definite article ("le quai", "l'arbre")
 * to the indefinite one ("un quai", "un arbre"), matching the current LEMMA_RULES.
 *
 * "le"/"la"/"les" map deterministically. Elided "l'" hides the gender, so those go through the LLM.
 * Dry run by default; pass --apply to write.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/migrate-lemma-articles.mts [--apply]
 *   (point DATABASE_URL at a copy to try it first)
 */
import { and, eq, like, or } from "drizzle-orm";
import { db } from "../src/lib/db";
import { vocabEntries } from "../src/lib/db/schema";
import { llmNormalize } from "../src/lib/llm/normalize";

const apply = process.argv.includes("--apply");

const rows = await db
  .select()
  .from(vocabEntries)
  .where(
    and(
      eq(vocabEntries.language, "fr"),
      or(
        like(vocabEntries.lemma, "le %"),
        like(vocabEntries.lemma, "la %"),
        like(vocabEntries.lemma, "les %"),
        like(vocabEntries.lemma, "l'%")
      )
    )
  );

const existing = new Set((await db.select({ lemma: vocabEntries.lemma }).from(vocabEntries).where(eq(vocabEntries.language, "fr"))).map((r) => r.lemma));

const DETERMINISTIC: Record<string, string> = { "le ": "un ", "la ": "une ", "les ": "des " };
const stripIndefinite = (lemma: string) => lemma.replace(/^(un|une|des) /, "");

const newLemmaById = new Map<string, string>();
const elided = [];
for (const row of rows) {
  const prefix = Object.keys(DETERMINISTIC).find((p) => row.lemma.startsWith(p));
  if (prefix) newLemmaById.set(row.id, DETERMINISTIC[prefix] + row.lemma.slice(prefix.length));
  else elided.push(row);
}

if (elided.length > 0) {
  const { items } = await llmNormalize("fr", elided.map((r) => (r.translation ? `${r.lemma} (${r.translation})` : r.lemma)));
  const byBare = new Map(items.map((i) => [stripIndefinite(i.lemma), i.lemma]));
  for (const row of elided) {
    const next = byBare.get(row.lemma.slice(2));
    if (next && next !== row.lemma) newLemmaById.set(row.id, next);
  }
}

let updated = 0;
for (const row of rows) {
  const next = newLemmaById.get(row.id);
  if (!next) {
    console.log(`UNRESOLVED  ${row.lemma}`);
  } else if (existing.has(next)) {
    console.log(`COLLISION   ${row.lemma} -> ${next} (already stored, left unchanged)`);
  } else {
    console.log(`${row.lemma} -> ${next}`);
    existing.add(next);
    if (apply) {
      await db.update(vocabEntries).set({ lemma: next, updatedAt: new Date().toISOString() }).where(eq(vocabEntries.id, row.id));
    }
    updated++;
  }
}
console.log(`\n${apply ? "Updated" : "Would update"} ${updated} of ${rows.length} entries.`);
