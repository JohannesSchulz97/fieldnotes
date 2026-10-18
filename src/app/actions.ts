"use server";

import { revalidatePath } from "next/cache";
import {
  findExtractionIdByHash,
  getExtractionSentences,
  getExtractionText,
  hashText,
  insertExtraction,
  saveTranslations,
  updateExtraction,
} from "@/lib/db/extractions";
import {
  deleteGrammarItem as dbDeleteGrammarItem,
  listGrammarNames,
  saveGrammarItem,
  setGrammarStatus as dbSetGrammarStatus,
} from "@/lib/db/grammar";
import { AnkiSettingsSchema, saveAnkiSettings } from "@/lib/db/settings";
import { getTotalCost } from "@/lib/db/usage";
import { deleteEntry, getStoredStatuses, upsertEntries } from "@/lib/db/vocab";
import { TARGET_LANGUAGE } from "@/lib/llm/client";
import { llmExtract } from "@/lib/llm/extract";
import { GrammarAnalysisSchema, llmAnalyzeGrammar } from "@/lib/llm/grammar";
import { llmNormalize, type NormalizedItem } from "@/lib/llm/normalize";
import { llmTranslate } from "@/lib/llm/translate";
import { splitSentences } from "@/lib/sentences";
import type {
  AnkiSettings,
  ExtractedItem,
  GrammarAnalysis,
  GrammarStatus,
  LanguageCode,
  WordStatus,
} from "@/lib/types";

/**
 * Extracts vocabulary from a text and saves the result. A text that was extracted before
 * is not sent to the LLM again; its saved extraction is returned instead.
 */
export async function extract(text: string): Promise<{ id: string; reused: boolean }> {
  if (!text.trim()) throw new Error("Empty text");
  const existing = await findExtractionIdByHash(hashText(text));
  if (existing) return { id: existing, reused: true };
  const id = await insertExtraction(text, await llmExtract(text));
  revalidatePath("/");
  return { id, reused: false };
}

/** Translates a saved extraction's text sentence by sentence and stores the result. */
export async function translateExtraction(id: string): Promise<void> {
  const text = await getExtractionText(id);
  if (text === null) throw new Error("Extraction not found");
  await saveTranslations(id, await llmTranslate(splitSentences(text)));
  revalidatePath(`/extractions/${id}`);
}

/** Runs the LLM again on a saved extraction's text and replaces its items. */
export async function reextract(id: string): Promise<void> {
  const text = await getExtractionText(id);
  if (text === null) throw new Error("Extraction not found");
  await updateExtraction(id, await llmExtract(text));
  revalidatePath("/");
  revalidatePath(`/extractions/${id}`);
}

export async function markItem(
  item: ExtractedItem,
  language: LanguageCode,
  translationLanguage: LanguageCode,
  status: WordStatus
): Promise<void> {
  if (status !== "known" && status !== "ignored") throw new Error("Invalid status");
  if (!item?.lemma?.trim()) throw new Error("Missing lemma");
  await upsertEntries([item], language, translationLanguage, status, "extraction");
  revalidatePath("/vocab");
  revalidatePath("/");
}

/** Marks exported items as known and records the export time. The file itself is built client-side. */
export async function markExported(
  items: ExtractedItem[],
  language: LanguageCode,
  translationLanguage: LanguageCode
): Promise<void> {
  if (items.length === 0 || items.some((i) => !i?.lemma?.trim())) throw new Error("Invalid items");
  await upsertEntries(items, language, translationLanguage, "known", "extraction", new Date().toISOString());
  revalidatePath("/vocab");
  revalidatePath("/");
}

const MAX_LINES = 5000;

export interface AddKnownResult {
  added: number;
  alreadyStored: number;
  skippedLines: number;
  costUsd: number | null;
  totalCostUsd: number;
}

/** Normalizes pasted entries (one per line) to lemmas via the LLM and stores them as known. */
export async function addKnownWords(text: string): Promise<AddKnownResult> {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error("Nothing to add");
  if (lines.length > MAX_LINES) throw new Error(`Too many lines (max ${MAX_LINES})`);

  const { items, costUsd } = await llmNormalize(lines);
  const byLanguage = Map.groupBy(items, (i: NormalizedItem) => i.language);

  let added = 0;
  let alreadyStored = 0;
  for (const [language, group] of byLanguage) {
    const lemmas = [...new Set(group.map((i) => i.lemma))];
    const stored = await getStoredStatuses(language, lemmas);
    alreadyStored += stored.size;
    added += lemmas.length - stored.size;
    await upsertEntries(group, language, TARGET_LANGUAGE, "known", "manual");
  }
  revalidatePath("/vocab");
  revalidatePath("/");
  return {
    added,
    alreadyStored,
    skippedLines: Math.max(0, lines.length - items.length),
    costUsd,
    totalCostUsd: await getTotalCost(),
  };
}

/** Removes a stored word so it shows up as new again. */
export async function unmarkItem(language: LanguageCode, lemma: string): Promise<void> {
  if (!language?.trim() || !lemma?.trim()) throw new Error("Missing language or lemma");
  await deleteEntry(language, lemma);
  revalidatePath("/vocab");
  revalidatePath("/");
}

export async function updateAnkiSettings(value: AnkiSettings): Promise<void> {
  await saveAnkiSettings(AnkiSettingsSchema.parse(value));
}

const MAX_SPAN_LENGTH = 300;
/** Sentences before and after the selected one that the LLM sees for meaning. */
const CONTEXT_SENTENCES = 2;

/** Loads the selected sentence from the DB, so the client only sends a reference and the span. */
async function loadSelection(extractionId: string, sentence: number, span: string) {
  const trimmed = span?.trim().replace(/\s+/g, " ") ?? "";
  if (!trimmed || trimmed.length > MAX_SPAN_LENGTH) throw new Error("Invalid selection");
  const data = await getExtractionSentences(extractionId);
  if (!data) throw new Error("Extraction not found");
  const text = data.sentences[sentence];
  if (!Number.isInteger(sentence) || text === undefined) throw new Error("Sentence not found");
  if (!text.replace(/\s+/g, " ").includes(trimmed)) throw new Error("Selection not in sentence");
  return { ...data, span: trimmed, text };
}

/** Explains the grammar of a span selected in one sentence. Nothing is stored until it is saved. */
export async function analyzeGrammar(
  extractionId: string,
  sentence: number,
  span: string
): Promise<GrammarAnalysis> {
  const s = await loadSelection(extractionId, sentence, span);
  return llmAnalyzeGrammar({
    language: s.sourceLanguage,
    span: s.span,
    sentence: s.text,
    context: s.sentences
      .slice(Math.max(0, sentence - CONTEXT_SENTENCES), sentence + CONTEXT_SENTENCES + 1)
      .join(" "),
    knownNames: await listGrammarNames(s.sourceLanguage),
  });
}

/** Saves an analysis to the grammar list, with the selected sentence as its first example. */
export async function saveGrammarAnalysis(
  extractionId: string,
  sentence: number,
  span: string,
  analysis: GrammarAnalysis
): Promise<void> {
  const s = await loadSelection(extractionId, sentence, span);
  await saveGrammarItem(s.sourceLanguage, TARGET_LANGUAGE, GrammarAnalysisSchema.parse(analysis), {
    sentence: s.text,
    form: s.span,
    translation: s.translations?.[sentence] || null,
    extractionId,
  });
  revalidatePath("/grammar");
}

export async function setGrammarStatus(id: string, status: GrammarStatus): Promise<void> {
  if (status !== "to_work_on" && status !== "learned") throw new Error("Invalid status");
  await dbSetGrammarStatus(id, status);
  revalidatePath("/grammar");
}

export async function deleteGrammarItem(id: string): Promise<void> {
  if (!id?.trim()) throw new Error("Missing id");
  await dbDeleteGrammarItem(id);
  revalidatePath("/grammar");
}
