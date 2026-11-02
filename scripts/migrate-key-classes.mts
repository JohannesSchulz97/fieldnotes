/**
 * One-off for #50: rebuilds vocab_entries.homograph_key from the class of part of speech (noun, verb,
 * other; see keyClass in src/lib/lemma.ts) and merges the entries that become the same word.
 *
 * - Entries of one lemma whose keys now agree ("non" adverb and "non" interjection) are merged.
 * - A lemma's entries that are all interjections are merged into its only other word entry
 *   ("attention" interjection into "attention" the noun). With two or more other entries the
 *   interjection is left alone and logged.
 * - The entry kept: a non-interjection first, then a known one, then the oldest. It becomes known
 *   if any merged entry was, keeps the earliest export date, and its translation gains the
 *   meanings of the others.
 * - Items of one extraction that are now the same word are reduced to the first, as extraction does.
 *
 * Dry run by default; pass --apply to write.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/migrate-key-classes.mts [--apply]
 *   (point DATABASE_URL at a copy to try it first)
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/lib/db";
import { extractions, vocabEntries } from "../src/lib/db/schema";
import { homographKey, isInterjection, vocabKey } from "../src/lib/lemma";

type Entry = typeof vocabEntries.$inferSelect;

const apply = process.argv.includes("--apply");

/** The entry a group merges into: a non-interjection, then a known one, then the oldest. */
function survivor(group: Entry[]): Entry {
  return group.toSorted(
    (a, b) =>
      Number(isInterjection(a)) - Number(isInterjection(b)) ||
      Number(b.status === "known") - Number(a.status === "known") ||
      a.createdAt.localeCompare(b.createdAt)
  )[0];
}

/** The meanings of all translations, in order, each once. */
function mergeTranslations(group: Entry[]): string | null {
  const meanings = group.flatMap((e) => e.translation?.split(",").map((m) => m.trim()) ?? []);
  const unique = [...new Set(meanings.filter(Boolean))];
  return unique.length > 0 ? unique.join(", ") : null;
}

const vocab = await db.select().from(vocabEntries);
const groupKey = (e: Entry) => `${e.language}|${vocabKey(e)}`;
const groups = [...Map.groupBy(vocab, groupKey).values()];

// Interjection-only groups of a lemma with exactly one other word group join that group.
const byLemma = Map.groupBy(groups, (g) => `${g[0].language}|${g[0].lemma}`);
const merged: Entry[][] = [];
for (const lemmaGroups of byLemma.values()) {
  const words = lemmaGroups.filter((g) => g[0].kind === "word");
  const interjections = words.filter((g) => g.every(isInterjection));
  const others = words.filter((g) => !g.every(isInterjection));
  if (interjections.length > 0 && others.length === 1) {
    merged.push([...others[0], ...interjections.flat()]);
    merged.push(...lemmaGroups.filter((g) => !words.includes(g)));
  } else {
    if (interjections.length > 0 && others.length > 1) {
      console.log(`SKIP   ${lemmaGroups[0][0].lemma}: interjection with ${others.length} other entries`);
    }
    merged.push(...lemmaGroups);
  }
}

const now = new Date().toISOString();
const deletes: string[] = [];
const updates: { id: string; set: Partial<Entry> }[] = [];
for (const group of merged) {
  const keep = survivor(group);
  const rest = group.filter((e) => e !== keep);
  const set: Partial<Entry> = {};
  const key = homographKey(keep);
  if (key !== keep.homographKey) set.homographKey = key;
  if (rest.length > 0) {
    const exported = group.map((e) => e.exportedAt).filter((d) => d !== null).sort();
    Object.assign(set, {
      status: group.some((e) => e.status === "known") ? "known" : keep.status,
      exportedAt: exported[0] ?? null,
      translation: mergeTranslations([keep, ...rest]),
      exampleSentence: keep.exampleSentence ?? rest.find((e) => e.exampleSentence)?.exampleSentence ?? null,
      updatedAt: now,
    });
    console.log(
      `MERGE  ${keep.lemma}: ${group.map((e) => `${e.partOfSpeech ?? "-"} (${e.source}, ${e.status})`).join(" + ")}` +
        ` -> ${keep.partOfSpeech ?? "-"}, "${set.translation ?? ""}"`
    );
    deletes.push(...rest.map((e) => e.id));
  }
  if (Object.keys(set).length > 0) updates.push({ id: keep.id, set });
}

// Items of one text that are now one word: keep the first.
const rows = await db.select().from(extractions);
const itemUpdates: { id: string; items: (typeof rows)[number]["items"] }[] = [];
for (const row of rows) {
  const seen = new Set<string>();
  const items = row.items.filter((i) => !seen.has(vocabKey(i)) && seen.add(vocabKey(i)));
  if (items.length !== row.items.length) {
    console.log(`DEDUPE ${row.id.slice(0, 8)}: ${row.items.length - items.length} items`);
    itemUpdates.push({ id: row.id, items });
  }
}

if (apply) {
  await db.transaction(async (tx) => {
    // Delete first: the merged entries would collide with the new keys on the unique index.
    if (deletes.length > 0) await tx.delete(vocabEntries).where(inArray(vocabEntries.id, deletes));
    for (const { id, set } of updates) await tx.update(vocabEntries).set(set).where(eq(vocabEntries.id, id));
    for (const { id, items } of itemUpdates) await tx.update(extractions).set({ items }).where(eq(extractions.id, id));
  });
}

console.log(
  `\n${apply ? "Merged" : "Would merge"} ${deletes.length} entries into others, ` +
    `${apply ? "updated" : "would update"} ${updates.length} entries and ${itemUpdates.length} extractions.`
);
