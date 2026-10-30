import "server-only";
import { and, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import type {
  Gender,
  LanguageCode,
  PartOfSpeech,
  VocabEntry,
  WordKind,
  WordSource,
  WordStatus,
} from "../types";
import {
  homographKey,
  type KeyedItem,
  matchStored,
  normalizeLemma,
  normalizePartOfSpeech,
  vocabKey,
} from "../lemma";
import { db } from ".";
import { vocabEntries } from "./schema";

export interface VocabPage {
  entries: VocabEntry[];
  /** Number of entries matching the filters, across all pages. */
  total: number;
}

/** One page of a language's entries, newest first, optionally filtered by source and a search in lemma/translation. */
export async function listVocab({
  language,
  source,
  query,
  page,
  pageSize,
}: {
  language: LanguageCode;
  source?: WordSource;
  query?: string;
  page: number;
  pageSize: number;
}): Promise<VocabPage> {
  const pattern = query ? `%${query.replace(/[\\%_]/g, "\\$&")}%` : null;
  const where = and(
    eq(vocabEntries.language, language),
    source ? eq(vocabEntries.source, source) : undefined,
    pattern
      ? or(
          sql`${vocabEntries.lemma} like ${pattern} escape '\\'`,
          sql`${vocabEntries.translation} like ${pattern} escape '\\'`
        )
      : undefined
  );
  const [entries, [{ n }]] = await Promise.all([
    db
      .select()
      .from(vocabEntries)
      .where(where)
      .orderBy(desc(vocabEntries.createdAt), vocabEntries.lemma)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: count() }).from(vocabEntries).where(where),
  ]);
  return { entries, total: n };
}

export async function countBySource(language: LanguageCode): Promise<Record<WordSource, number>> {
  const rows = await db
    .select({ source: vocabEntries.source, n: count() })
    .from(vocabEntries)
    .where(eq(vocabEntries.language, language))
    .groupBy(vocabEntries.source);
  const counts: Record<WordSource, number> = { extraction: 0, manual: 0, anki: 0, basic: 0 };
  for (const r of rows) counts[r.source] = r.n;
  return counts;
}

/** Removes an entry, so the word counts as new again. */
export async function deleteEntry(id: string): Promise<void> {
  await db.delete(vocabEntries).where(eq(vocabEntries.id, id));
}

/** Every known lemma of a language (from any source), alphabetically. */
export async function listKnownLemmas(language: LanguageCode): Promise<string[]> {
  const rows = await db
    .select({ lemma: vocabEntries.lemma })
    .from(vocabEntries)
    .where(and(eq(vocabEntries.language, language), eq(vocabEntries.status, "known")))
    .orderBy(vocabEntries.lemma);
  return [...new Set(rows.map((r) => r.lemma))];
}

/** A stored entry as far as matching items against the vocabulary needs it. */
export interface StoredEntry {
  id: string;
  lemma: string;
  partOfSpeech: PartOfSpeech | null;
  kind: WordKind;
  gender: Gender | null;
  status: WordStatus;
  translation: string | null;
  createdAt: string;
  exportedAt: string | null;
}

/** SQLite caps bound parameters per statement; 14 columns × 500 rows stays well below it. */
const BATCH_SIZE = 500;

/** Every stored entry of a language with one of the lemmas, whatever its part of speech or gender. */
async function entriesWithLemmas(language: LanguageCode, lemmas: string[]): Promise<StoredEntry[]> {
  const unique = [...new Set(lemmas.map(normalizeLemma))];
  const chunks = Array.from({ length: Math.ceil(unique.length / BATCH_SIZE) }, (_, i) =>
    unique.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
  );
  const rows = await Promise.all(
    chunks.map((chunk) =>
      db
        .select({
          id: vocabEntries.id,
          lemma: vocabEntries.lemma,
          partOfSpeech: vocabEntries.partOfSpeech,
          kind: vocabEntries.kind,
          gender: vocabEntries.gender,
          status: vocabEntries.status,
          translation: vocabEntries.translation,
          createdAt: vocabEntries.createdAt,
          exportedAt: vocabEntries.exportedAt,
        })
        .from(vocabEntries)
        .where(and(eq(vocabEntries.language, language), inArray(vocabEntries.lemma, chunk)))
    )
  );
  return rows.flat();
}

/**
 * The stored entries that share a lemma with one of the given items, by vocabKey. Which entry an
 * item stands for is decided by matchStored, not by looking its key up.
 */
export async function getStoredEntries(
  language: LanguageCode,
  items: KeyedItem[]
): Promise<Map<string, StoredEntry>> {
  if (items.length === 0) return new Map();
  const rows = await entriesWithLemmas(
    language,
    items.map((i) => i.lemma)
  );
  return new Map(rows.map((r) => [vocabKey(r), r]));
}

/** The stored entries sharing each lemma (homographs of each other), by lemma. */
export async function getLemmaSiblings(
  language: LanguageCode,
  lemmas: string[]
): Promise<Map<string, StoredEntry[]>> {
  if (lemmas.length === 0) return new Map();
  return Map.groupBy(await entriesWithLemmas(language, lemmas), (r) => r.lemma);
}

/** The stored entry an item stands for (see matchStored), or null if the item is new. */
export async function findStoredEntry(
  language: LanguageCode,
  item: KeyedItem
): Promise<StoredEntry | null> {
  return matchStored(await getStoredEntries(language, [item]), item) ?? null;
}

export interface EntryInput {
  lemma: string;
  partOfSpeech: PartOfSpeech | null;
  kind: WordKind;
  gender?: Gender | null;
  pluralOnly?: boolean;
  translation: string | null;
  exampleSentence?: string | null;
}

/**
 * Inserts entries with the given status and source. Existing rows with the same vocabKey keep
 * their data and source but get the new status (and exportedAt, if given). An entry that matches a
 * stored one only by lemma (see matchStored) is taken to be that entry, so it does not create a
 * second one. Gender is kept for nouns only, and not for plural-only ones.
 */
export async function upsertEntries(
  entries: EntryInput[],
  language: LanguageCode,
  translationLanguage: LanguageCode,
  status: WordStatus,
  source: WordSource,
  exportedAt: string | null = null
): Promise<void> {
  const normalized = entries.map((e) => {
    const partOfSpeech = normalizePartOfSpeech(e.partOfSpeech);
    return {
      ...e,
      lemma: normalizeLemma(e.lemma),
      partOfSpeech,
      gender: partOfSpeech === "noun" && !e.pluralOnly ? (e.gender ?? null) : null,
    };
  });
  const stored = await getStoredEntries(language, normalized);
  const resolved = normalized.map((e) => {
    const match = matchStored(stored, e);
    return match
      ? { ...e, partOfSpeech: match.partOfSpeech, kind: match.kind, gender: match.gender }
      : e;
  });
  const unique = [...new Map(resolved.map((e) => [vocabKey(e), e])).values()];
  const now = new Date().toISOString();
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    await db
      .insert(vocabEntries)
      .values(
        unique.slice(i, i + BATCH_SIZE).map((e) => ({
          id: crypto.randomUUID(),
          language,
          lemma: e.lemma,
          partOfSpeech: e.partOfSpeech,
          kind: e.kind,
          gender: e.gender,
          pluralOnly: e.pluralOnly ?? false,
          homographKey: homographKey(e),
          status,
          source,
          translation: e.translation,
          translationLanguage,
          exampleSentence: e.exampleSentence ?? null,
          exportedAt,
          createdAt: now,
          updatedAt: now,
        }))
      )
      .onConflictDoUpdate({
        target: [vocabEntries.language, vocabEntries.lemma, vocabEntries.homographKey],
        set: exportedAt ? { status, exportedAt, updatedAt: now } : { status, updatedAt: now },
      });
  }
}
