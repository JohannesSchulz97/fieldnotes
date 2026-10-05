"use server";

import { revalidatePath } from "next/cache";
import {
  findExtractionIdByHash,
  getExtractionText,
  hashText,
  insertExtraction,
  saveTranslations,
  updateExtraction,
} from "@/lib/db/extractions";
import { getTotalCost } from "@/lib/db/usage";
import { deleteEntry, getStoredStatuses, upsertEntries } from "@/lib/db/vocab";
import { TARGET_LANGUAGE } from "@/lib/llm/client";
import { llmExtract } from "@/lib/llm/extract";
import { llmNormalize, type NormalizedItem } from "@/lib/llm/normalize";
import { llmTranslate } from "@/lib/llm/translate";
import { splitSentences } from "@/lib/sentences";
import type { ExtractedItem, LanguageCode, WordStatus } from "@/lib/types";

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
