import "server-only";
import { and, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { Gender, LanguageCode, VocabEntry, WordKind, WordSource, WordStatus } from "../types";
import { normalizeLemma } from "../lemma";
import { db } from ".";
import { vocabEntries } from "./schema";

export interface VocabPage {
  entries: VocabEntry[];
  /** Number of entries matching the filters, across all pages. */
  total: number;
}

/** One page of entries, newest first, optionally filtered by source and a search in lemma/translation. */
export async function listVocab({
  source,
  query,
  page,
  pageSize,
}: {
  source?: WordSource;
  query?: string;
  page: number;
  pageSize: number;
}): Promise<VocabPage> {
  const pattern = query ? `%${query.replace(/[\\%_]/g, "\\$&")}%` : null;
  const where = and(
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

export async function countBySource(): Promise<Record<WordSource, number>> {
  const rows = await db
    .select({ source: vocabEntries.source, n: count() })
    .from(vocabEntries)
    .groupBy(vocabEntries.source);
  const counts: Record<WordSource, number> = { extraction: 0, manual: 0, anki: 0, basic: 0 };
  for (const r of rows) counts[r.source] = r.n;
  return counts;
}

/** Removes an entry, so the word counts as new again. */
export async function deleteEntry(language: LanguageCode, lemma: string): Promise<void> {
  await db
    .delete(vocabEntries)
    .where(and(eq(vocabEntries.language, language), eq(vocabEntries.lemma, lemma)));
}

/** Returns the status of each given lemma that is already stored. */
export async function getStoredStatuses(
  language: LanguageCode,
  lemmas: string[]
): Promise<Map<string, WordStatus>> {
  if (lemmas.length === 0) return new Map();
  const rows = await db
    .select({ lemma: vocabEntries.lemma, status: vocabEntries.status })
    .from(vocabEntries)
    .where(and(eq(vocabEntries.language, language), inArray(vocabEntries.lemma, lemmas)));
  return new Map(rows.map((r) => [r.lemma, r.status]));
}

export interface StoredEntry {
  status: WordStatus;
  createdAt: string;
  exportedAt: string | null;
}

/** Returns status and dates of each given lemma that is already stored. */
export async function getStoredEntries(
  language: LanguageCode,
  lemmas: string[]
): Promise<Map<string, StoredEntry>> {
  if (lemmas.length === 0) return new Map();
  const rows = await db
    .select({
      lemma: vocabEntries.lemma,
      status: vocabEntries.status,
      createdAt: vocabEntries.createdAt,
      exportedAt: vocabEntries.exportedAt,
    })
    .from(vocabEntries)
    .where(and(eq(vocabEntries.language, language), inArray(vocabEntries.lemma, lemmas)));
  return new Map(rows.map(({ lemma, ...entry }) => [lemma, entry]));
}

export interface EntryInput {
  lemma: string;
  partOfSpeech: string | null;
  kind: WordKind;
  gender?: Gender | null;
  pluralOnly?: boolean;
  translation: string | null;
  exampleSentence?: string | null;
}

/** SQLite caps bound parameters per statement; 14 columns × 500 rows stays well below it. */
const BATCH_SIZE = 500;

/**
 * Inserts entries with the given status and source. Existing (language, lemma) rows keep
 * their data and source but get the new status (and exportedAt, if given).
 */
export async function upsertEntries(
  entries: EntryInput[],
  language: LanguageCode,
  translationLanguage: LanguageCode,
  status: WordStatus,
  source: WordSource,
  exportedAt: string | null = null
): Promise<void> {
  const normalized = entries.map((e) => ({ ...e, lemma: normalizeLemma(e.lemma) }));
  const unique = [...new Map(normalized.map((e) => [e.lemma, e])).values()];
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
          gender: e.gender ?? null,
          pluralOnly: e.pluralOnly ?? false,
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
        target: [vocabEntries.language, vocabEntries.lemma],
        set: exportedAt ? { status, exportedAt, updatedAt: now } : { status, updatedAt: now },
      });
  }
}
