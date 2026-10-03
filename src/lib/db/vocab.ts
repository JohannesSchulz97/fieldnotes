import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { ExtractedItem, LanguageCode, VocabEntry, WordStatus } from "../types";
import { db } from ".";
import { vocabEntries } from "./schema";

export async function listVocab(): Promise<VocabEntry[]> {
  return db.select().from(vocabEntries).orderBy(desc(vocabEntries.createdAt));
}

/** Returns which of the given lemmas are already stored (known or ignored). */
export async function getStoredLemmas(
  language: LanguageCode,
  lemmas: string[]
): Promise<Set<string>> {
  if (lemmas.length === 0) return new Set();
  const rows = await db
    .select({ lemma: vocabEntries.lemma })
    .from(vocabEntries)
    .where(and(eq(vocabEntries.language, language), inArray(vocabEntries.lemma, lemmas)));
  return new Set(rows.map((r) => r.lemma));
}

/** Inserts the item with the given status, or updates the status if (language, lemma) exists. */
export async function saveWithStatus(
  item: ExtractedItem,
  language: LanguageCode,
  translationLanguage: LanguageCode,
  status: WordStatus
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(vocabEntries)
    .values({
      id: crypto.randomUUID(),
      language,
      lemma: item.lemma,
      partOfSpeech: item.partOfSpeech,
      kind: item.kind,
      status,
      translation: item.translation,
      translationLanguage,
      exampleSentence: item.exampleSentence,
      exportedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [vocabEntries.language, vocabEntries.lemma],
      set: { status, updatedAt: now },
    });
}
