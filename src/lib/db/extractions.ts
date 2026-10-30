import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { LlmExtraction } from "../llm/extract";
import { splitParagraphs, splitSentences } from "../sentences";
import type { SourceDetails } from "../source";
import type { ExtractedItem, ExtractionResult, ExtractionSummary, LanguageCode } from "../types";
import { db } from ".";
import { extractions } from "./schema";
import { getStoredEntries, getStoredStatuses } from "./vocab";

const PREVIEW_LENGTH = 80;

export function hashText(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

export async function findExtractionByHash(
  textHash: string
): Promise<{ id: string; sourceLanguage: LanguageCode } | null> {
  const [row] = await db
    .select({ id: extractions.id, sourceLanguage: extractions.sourceLanguage })
    .from(extractions)
    .where(eq(extractions.textHash, textHash));
  return row ?? null;
}

export async function getExtractionText(
  id: string
): Promise<{ text: string; sourceLanguage: LanguageCode } | null> {
  const [row] = await db
    .select({ text: extractions.text, sourceLanguage: extractions.sourceLanguage })
    .from(extractions)
    .where(eq(extractions.id, id));
  return row ?? null;
}

/** The text's sentences (numbered as in the reading view) with their translations, if any. */
export async function getExtractionSentences(id: string): Promise<{
  sentences: string[];
  translations: string[] | null;
  sourceLanguage: string;
} | null> {
  const [row] = await db
    .select({
      text: extractions.text,
      translations: extractions.translations,
      sourceLanguage: extractions.sourceLanguage,
    })
    .from(extractions)
    .where(eq(extractions.id, id));
  if (!row) return null;
  return {
    sentences: splitSentences(row.text),
    translations: row.translations,
    sourceLanguage: row.sourceLanguage,
  };
}

export async function insertExtraction(
  text: string,
  result: LlmExtraction,
  details: SourceDetails
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(extractions).values({
    id,
    textHash: hashText(text),
    text,
    title: details.title,
    sourceUrl: details.sourceUrl,
    sourceLanguage: result.sourceLanguage,
    targetLanguage: result.targetLanguage,
    items: result.items,
    costUsd: result.costUsd,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function saveTranslations(id: string, translations: string[]): Promise<void> {
  await db
    .update(extractions)
    .set({ translations, updatedAt: new Date().toISOString() })
    .where(eq(extractions.id, id));
}

/** Sets the title and link of a saved source; null clears them. Does not touch updatedAt, which keys the page state. */
export async function updateSourceDetails(id: string, details: SourceDetails): Promise<void> {
  await db
    .update(extractions)
    .set({ title: details.title, sourceUrl: details.sourceUrl })
    .where(eq(extractions.id, id));
}

/** Replaces the stored items with a fresh LLM run. */
export async function updateExtraction(id: string, result: LlmExtraction): Promise<void> {
  await db
    .update(extractions)
    .set({
      sourceLanguage: result.sourceLanguage,
      targetLanguage: result.targetLanguage,
      items: result.items,
      costUsd: result.costUsd,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(extractions.id, id));
}

/** Loads an extraction and splits its items against the current vocabulary. */
export async function loadExtraction(id: string): Promise<ExtractionResult | null> {
  const [row] = await db.select().from(extractions).where(eq(extractions.id, id));
  if (!row) return null;
  const stored = await getStoredEntries(
    row.sourceLanguage,
    row.items.map((i) => i.lemma)
  );
  const known = row.items.filter((i) => stored.get(i.lemma)?.status === "known");
  // Learned here = added after the extraction and exported to Anki. Words marked known count as
  // already known: marking means the word was known all along.
  const isLearned = (lemma: string) => {
    const entry = stored.get(lemma)!;
    return entry.exportedAt !== null && entry.createdAt >= row.createdAt;
  };
  return {
    id: row.id,
    kind: row.kind,
    text: row.text,
    title: row.title,
    sourceUrl: row.sourceUrl,
    paragraphs: splitParagraphs(row.text),
    translations: row.translations,
    sourceLanguage: row.sourceLanguage,
    targetLanguage: row.targetLanguage,
    items: row.items.filter((i) => !stored.has(i.lemma)),
    learnedItems: known
      .filter((i) => isLearned(i.lemma))
      .map((i) => ({ ...i, exportedAt: stored.get(i.lemma)!.exportedAt! })),
    knownItems: known.filter((i) => !isLearned(i.lemma)),
    costUsd: row.costUsd,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The sources of one language, newest first. */
export async function listExtractions(language: LanguageCode): Promise<ExtractionSummary[]> {
  const rows = await db
    .select({
      id: extractions.id,
      title: extractions.title,
      sourceUrl: extractions.sourceUrl,
      // One character more than the preview, to tell whether the text was cut.
      head: sql<string>`substr(${extractions.text}, 1, ${PREVIEW_LENGTH + 1})`,
      items: extractions.items,
      createdAt: extractions.createdAt,
    })
    .from(extractions)
    .where(eq(extractions.sourceLanguage, language))
    .orderBy(desc(extractions.createdAt));
  // One lookup for the items of all sources, instead of one per source.
  const stored = await getStoredStatuses(
    language,
    rows.flatMap((r) => r.items.map((i) => i.lemma))
  );
  return rows.map(({ head, items, ...row }) => ({
    ...row,
    preview: head.length > PREVIEW_LENGTH ? `${head.slice(0, PREVIEW_LENGTH)}…` : head,
    newCount: items.filter((i) => !stored.has(i.lemma)).length,
    totalCount: items.length,
  }));
}

const EXERCISES_SOURCE_TITLE = "Exercises";

/** Fixed text hash of a language's exercises source, so it never matches a pasted text. */
function exercisesSourceHash(language: LanguageCode): string {
  return hashText(`exercises:${language}`);
}

async function findExercisesSource(language: LanguageCode) {
  const [row] = await db
    .select()
    .from(extractions)
    .where(and(eq(extractions.kind, "exercises"), eq(extractions.sourceLanguage, language)));
  return row ?? null;
}

/** Id and item lemmas of a language's exercises source, or null if it does not exist yet. */
export async function getExercisesSource(
  language: LanguageCode
): Promise<{ id: string; lemmas: Set<string> } | null> {
  const row = await findExercisesSource(language);
  return row ? { id: row.id, lemmas: new Set(row.items.map((i) => i.lemma)) } : null;
}

/**
 * Adds a word to the language's exercises source, creating the source on first use. The item's
 * example sentence is added to the source's text (once), with its translation. Returns the
 * source's id.
 */
export async function addToExercisesSource(
  language: LanguageCode,
  targetLanguage: LanguageCode,
  item: ExtractedItem,
  sentenceTranslation: string
): Promise<string> {
  const now = new Date().toISOString();
  const row = await findExercisesSource(language);
  // A sentence may split into several; the translation goes with the first part.
  const translationsFor = (sentence: string) =>
    splitSentences(sentence).map((_, i) => (i === 0 ? sentenceTranslation : ""));

  if (!row) {
    const id = crypto.randomUUID();
    await db.insert(extractions).values({
      id,
      kind: "exercises",
      textHash: exercisesSourceHash(language),
      text: item.exampleSentence,
      title: EXERCISES_SOURCE_TITLE,
      sourceUrl: null,
      sourceLanguage: language,
      targetLanguage,
      items: [item],
      translations: translationsFor(item.exampleSentence),
      costUsd: null,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  const sentences = splitSentences(row.text);
  const hasSentence = splitSentences(item.exampleSentence).every((s) => sentences.includes(s));
  const items = row.items.some((i) => i.lemma === item.lemma) ? row.items : [...row.items, item];
  await db
    .update(extractions)
    .set({
      items,
      ...(!hasSentence && {
        text: `${row.text}\n\n${item.exampleSentence}`,
        translations: [
          ...sentences.map((_, i) => row.translations?.[i] ?? ""),
          ...translationsFor(item.exampleSentence),
        ],
      }),
      updatedAt: now,
    })
    .where(eq(extractions.id, row.id));
  return row.id;
}
