/**
 * One-off: moves the article out of stored noun lemmas into the gender / plural_only columns
 * ("un quai" → lemma "quai", gender "m"; "des gens" → "gens", plural-only). Covers vocab_entries
 * and the items saved in extractions (which also hold old definite-article lemmas like "le quai").
 *
 * Elided "l'" hides the gender; it is taken from the same noun elsewhere (vocab or other items).
 * Dry run by default; pass --apply to write. Run `npm run db:migrate` first (adds the columns).
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/migrate-noun-gender.mts [--apply]
 *   (point DATABASE_URL at a copy to try it first)
 */
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { extractions, vocabEntries } from "../src/lib/db/schema";
import type { ExtractedItem, Gender } from "../src/lib/types";

const apply = process.argv.includes("--apply");

interface Parsed {
  bare: string;
  gender: Gender | null;
  pluralOnly: boolean;
}

/** Splits a leading article off a noun lemma; null if the lemma has none. */
function parse(lemma: string): Parsed | null {
  const m = /^(un|une|des|le|la|les) (.+)$/.exec(lemma);
  if (m) {
    const [, article, bare] = m;
    if (article === "des" || article === "les") return { bare, gender: null, pluralOnly: true };
    return { bare, gender: article === "un" || article === "le" ? "m" : "f", pluralOnly: false };
  }
  const elided = /^l'(.+)$/.exec(lemma);
  return elided ? { bare: elided[1], gender: null, pluralOnly: false } : null;
}

const vocab = await db.select().from(vocabEntries);

// Rows by their current lemma. Entries are unique per (language, lemma), so a noun that is stored
// both bare and with an article ("envie", "une envie") must be merged into one row.
type Row = (typeof vocab)[number];
const keeperOf = new Map<string, Row>(vocab.filter((v) => v.language === "fr").map((v) => [v.lemma, v]));

// Pass 1: genders known from articles that show them, used to resolve elided "l'" lemmas.
const genderOf = new Map<string, Gender>();
for (const v of vocab) {
  if (v.language !== "fr" || v.partOfSpeech !== "noun") continue;
  const p = parse(v.lemma);
  if (p?.gender) genderOf.set(p.bare, p.gender);
  else if (!p && v.gender) genderOf.set(v.lemma, v.gender);
}
const extractionRows = await db.select().from(extractions);
for (const row of extractionRows) {
  for (const item of row.items) {
    if (item.partOfSpeech !== "noun") continue;
    const p = parse(item.lemma);
    if (p?.gender && !genderOf.has(p.bare)) genderOf.set(p.bare, p.gender);
  }
}

let vocabUpdated = 0;
let merged = 0;
let unresolved = 0;
for (const v of vocab) {
  if (v.language !== "fr" || v.partOfSpeech !== "noun") continue;
  const p = parse(v.lemma);
  if (!p) continue;
  const gender = p.gender ?? (p.pluralOnly ? null : (genderOf.get(p.bare) ?? null));
  if (!gender && !p.pluralOnly) {
    console.log(`NO GENDER   ${v.lemma} (stored as "${p.bare}" without gender)`);
    unresolved++;
  }

  const keeper = keeperOf.get(p.bare);
  if (keeper && keeper.id !== v.id) {
    // Merge into the existing row; a noun keeper gains the gender / plural-only it lacked.
    const fill = keeper.partOfSpeech === "noun";
    console.log(`MERGE       ${v.lemma} -> ${p.bare} (${fill ? "noun" : keeper.partOfSpeech ?? "?"} row kept)`);
    merged++;
    if (apply) {
      if (fill) {
        await db
          .update(vocabEntries)
          .set({
            gender: keeper.gender ?? gender,
            pluralOnly: keeper.pluralOnly || p.pluralOnly,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(vocabEntries.id, keeper.id));
      }
      await db.delete(vocabEntries).where(eq(vocabEntries.id, v.id));
    }
    if (fill) {
      keeper.gender = keeper.gender ?? gender;
      keeper.pluralOnly = keeper.pluralOnly || p.pluralOnly;
    }
    continue;
  }

  keeperOf.delete(v.lemma);
  keeperOf.set(p.bare, { ...v, lemma: p.bare, gender, pluralOnly: p.pluralOnly });
  vocabUpdated++;
  if (apply) {
    await db
      .update(vocabEntries)
      .set({ lemma: p.bare, gender, pluralOnly: p.pluralOnly, updatedAt: new Date().toISOString() })
      .where(eq(vocabEntries.id, v.id));
  }
}

let itemsUpdated = 0;
for (const row of extractionRows) {
  if (row.sourceLanguage !== "fr") continue;
  const seen = new Set<string>();
  const items: ExtractedItem[] = row.items
    .map((item) => {
      const p = item.partOfSpeech === "noun" ? parse(item.lemma) : null;
      if (!p) return item;
      itemsUpdated++;
      const gender = p.gender ?? (p.pluralOnly ? null : (genderOf.get(p.bare) ?? null));
      return { ...item, lemma: p.bare, gender, pluralOnly: p.pluralOnly };
    })
    .filter((item) => !seen.has(item.lemma) && seen.add(item.lemma));
  if (apply) await db.update(extractions).set({ items }).where(eq(extractions.id, row.id));
}

console.log(
  `\n${apply ? "Updated" : "Would update"} ${vocabUpdated} vocab entries (${merged} merged duplicates) and ${itemsUpdated} extraction items` +
    (unresolved ? ` (${unresolved} nouns without gender)` : "") +
    "."
);
