import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { matchStored, normalizeLemma, normalizePartOfSpeech, vocabKey } from "../lemma";
import type { LlmExtraction } from "../llm/extract";
import { splitParagraphs, splitSentences } from "../sentences";
import type { SourceDetails } from "../source";
import type {
  ExtractedItem,
  ExtractionResult,
  ExtractionSummary,
  KnownHomograph,
  LanguageCode,
} from "../types";
import { db } from ".";
import { extractions } from "./schema";
import { getLemmaSiblings, getStoredEntries } from "./vocab";

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

/** Saved items read through normalizePartOfSpeech, as those saved before the set was closed hold free text. */
function readItems(items: ExtractedItem[]): ExtractedItem[] {
  return items.map((i) => ({ ...i, partOfSpeech: normalizePartOfSpeech(i.partOfSpeech) }));
}

/** Loads an extraction and splits its items against the current vocabulary. */
export async function loadExtraction(id: string): Promise<ExtractionResult | null> {
  const [row] = await db.select().from(extractions).where(eq(extractions.id, id));
  if (!row) return null;
  const all = readItems(row.items);
  const sameLemma = await getLemmaSiblings(
    row.sourceLanguage,
    all.map((i) => i.lemma)
  );
  const stored = new Map([...sameLemma.values()].flat().map((e) => [vocabKey(e), e]));
  const storedOf = (item: ExtractedItem) => matchStored(stored, item);
  const known = all.filter((i) => storedOf(i)?.status === "known");
  // Learned here = added after the extraction and exported to Anki. Words marked known count as
  // already known: marking means the word was known all along.
  const isLearned = (item: ExtractedItem) => {
    const entry = storedOf(item)!;
    return entry.exportedAt !== null && entry.createdAt >= row.createdAt;
  };
  const items = all.filter((i) => !storedOf(i));
  // A new item may share its lemma with a known entry that is another word: "son" the noun vs. the determiner.
  const homographs: Record<string, KnownHomograph[]> = {};
  for (const item of items) {
    const siblings = (sameLemma.get(normalizeLemma(item.lemma)) ?? []).filter(
      (e) => e.status === "known"
    );
    if (siblings.length > 0) {
      homographs[vocabKey(item)] = siblings.map(({ lemma, partOfSpeech, kind, gender, translation }) => ({
        lemma,
        partOfSpeech,
        kind,
        gender,
        translation,
      }));
    }
  }
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
    items,
    homographs,
    learnedItems: known
      .filter(isLearned)
      .map((i) => ({ ...i, exportedAt: storedOf(i)!.exportedAt! })),
    knownItems: known.filter((i) => !isLearned(i)),
    costUsd: row.costUsd,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The sources of one language, newest first. */
export async function listExtractions(language: LanguageCode): Promise<ExtractionSummary[]> {
  const rows = await db
    .select()
    .from(extractions)
    .where(eq(extractions.sourceLanguage, language))
    .orderBy(desc(extractions.createdAt));
  return Promise.all(
    rows.map(async (row) => {
      const stored = await getStoredEntries(row.sourceLanguage, row.items);
      return {
        id: row.id,
        title: row.title,
        sourceUrl: row.sourceUrl,
        preview:
          row.text.length > PREVIEW_LENGTH ? `${row.text.slice(0, PREVIEW_LENGTH)}…` : row.text,
        newCount: row.items.filter((i) => !matchStored(stored, i)).length,
        totalCount: row.items.length,
        createdAt: row.createdAt,
      };
    })
  );
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

/** Id and items of a language's exercises source, or null if it does not exist yet. */
export async function getExercisesSource(
  language: LanguageCode
): Promise<{ id: string; items: ExtractedItem[] } | null> {
  const row = await findExercisesSource(language);
  return row ? { id: row.id, items: readItems(row.items) } : null;
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
  const items = row.items.some((i) => vocabKey(i) === vocabKey(item)) ? row.items : [...row.items, item];
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
