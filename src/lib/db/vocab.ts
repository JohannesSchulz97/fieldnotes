import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { LanguageCode, VocabEntry, WordKind, WordStatus } from "../types";
import { db } from ".";
import { vocabEntries } from "./schema";

export async function listVocab(): Promise<VocabEntry[]> {
  return db.select().from(vocabEntries).orderBy(desc(vocabEntries.createdAt));
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

export interface EntryInput {
  lemma: string;
  partOfSpeech: string | null;
  kind: WordKind;
  translation: string | null;
  exampleSentence?: string | null;
}

/** SQLite caps bound parameters per statement; 12 columns × 500 rows stays well below it. */
const BATCH_SIZE = 500;

/**
 * Inserts entries with the given status. Existing (language, lemma) rows keep their data
 * but get the new status (and exportedAt, if given).
 */
export async function upsertEntries(
  entries: EntryInput[],
  language: LanguageCode,
  translationLanguage: LanguageCode,
  status: WordStatus,
  exportedAt: string | null = null
): Promise<void> {
  const unique = [...new Map(entries.map((e) => [e.lemma, e])).values()];
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
          status,
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
