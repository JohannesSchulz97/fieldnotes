/**
 * One-off for #21: aligns the items saved in extractions with the homograph-aware vocabulary key,
 * so old extractions keep the new/known split they had when entries matched by lemma alone.
 *
 * - Part of speech is mapped onto the closed set (normalizePartOfSpeech); gender is dropped from
 *   items that are not nouns or are plural-only.
 * - An item that now matches no stored entry, while exactly one entry has its lemma, takes that
 *   entry's kind, part of speech and gender. That is jitter of the model ("ce" pronoun vs.
 *   determiner, "peut-être" expression vs. word), which matched by lemma before. With two or more
 *   entries of the lemma the item is a real homograph and stays as it is.
 *
 * Dry run by default; pass --apply to write. Run `npm run db:migrate` first (adds homograph_key).
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/align-homograph-items.mts [--apply]
 *   (point DATABASE_URL at a copy to try it first)
 */
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { extractions, vocabEntries } from "../src/lib/db/schema";
import { matchStored, normalizeLemma, normalizePartOfSpeech, vocabKey } from "../src/lib/lemma";
import type { ExtractedItem } from "../src/lib/types";

const apply = process.argv.includes("--apply");

const vocab = await db.select().from(vocabEntries);
const rows = await db.select().from(extractions);

let normalized = 0;
let aligned = 0;
for (const row of rows) {
  const entries = vocab.filter((v) => v.language === row.sourceLanguage);
  const stored = new Map(entries.map((v) => [vocabKey(v), v]));
  const byLemma = Map.groupBy(entries, (v) => v.lemma);

  let changed = false;
  const seen = new Set<string>();
  const items = row.items
    .map((item): ExtractedItem => {
      const partOfSpeech = normalizePartOfSpeech(item.partOfSpeech);
      const keepsGender = partOfSpeech === "noun" && !item.pluralOnly;
      let next: ExtractedItem = {
        ...item,
        partOfSpeech,
        ...(item.gender !== undefined && { gender: keepsGender ? item.gender : null }),
      };
      if (next.partOfSpeech !== item.partOfSpeech || next.gender !== item.gender) normalized++;

      const siblings = byLemma.get(normalizeLemma(item.lemma)) ?? [];
      if (!matchStored(stored, next) && siblings.length === 1) {
        const [entry] = siblings;
        console.log(
          `ALIGN  ${row.id.slice(0, 8)}  ${item.lemma}: ${item.kind} ${item.partOfSpeech ?? "-"} ${item.gender ?? "-"}` +
            ` -> ${entry.kind} ${entry.partOfSpeech ?? "-"} ${entry.gender ?? "-"}`
        );
        next = { ...next, kind: entry.kind, partOfSpeech: entry.partOfSpeech, gender: entry.gender };
        aligned++;
      }
      if (JSON.stringify(next) !== JSON.stringify(item)) changed = true;
      return next;
    })
    // Alignment can make two items of one text the same word; keep the first, as extraction does.
    .filter((i) => !seen.has(vocabKey(i)) && seen.add(vocabKey(i)));
  if (items.length !== row.items.length) changed = true;

  if (changed && apply) await db.update(extractions).set({ items }).where(eq(extractions.id, row.id));
}

console.log(
  `\n${apply ? "Updated" : "Would update"} ${normalized} items with normalized part of speech or gender, ` +
    `and aligned ${aligned} items with their stored entry.`
);
