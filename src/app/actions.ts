"use server";

import { revalidatePath } from "next/cache";
import { deleteEntry, getStoredStatuses, upsertEntries } from "@/lib/db/vocab";
import { TARGET_LANGUAGE } from "@/lib/llm/client";
import { llmExtract } from "@/lib/llm/extract";
import { llmNormalize, type NormalizedItem } from "@/lib/llm/normalize";
import type { ExtractedItem, ExtractionResult, LanguageCode, WordStatus } from "@/lib/types";

export async function extract(text: string): Promise<ExtractionResult> {
  if (!text.trim()) throw new Error("Empty text");
  const result = await llmExtract(text);
  const stored = await getStoredStatuses(
    result.sourceLanguage,
    result.items.map((i) => i.lemma)
  );
  const items = result.items.filter((i) => !stored.has(i.lemma));
  const knownItems = result.items.filter((i) => stored.get(i.lemma) === "known");
  return {
    ...result,
    items,
    knownItems,
    stats: {
      totalLemmas: result.stats.totalLemmas,
      knownCount: knownItems.length,
      unknownCount: items.length,
    },
  };
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
}

const MAX_LINES = 5000;

export interface AddKnownResult {
  added: number;
  alreadyStored: number;
  skippedLines: number;
}

/** Normalizes pasted entries (one per line) to lemmas via the LLM and stores them as known. */
export async function addKnownWords(text: string): Promise<AddKnownResult> {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error("Nothing to add");
  if (lines.length > MAX_LINES) throw new Error(`Too many lines (max ${MAX_LINES})`);

  const items = await llmNormalize(lines);
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
  return { added, alreadyStored, skippedLines: Math.max(0, lines.length - items.length) };
}

/** Removes a stored word so it shows up as new again. */
export async function unmarkItem(language: LanguageCode, lemma: string): Promise<void> {
  if (!language?.trim() || !lemma?.trim()) throw new Error("Missing language or lemma");
  await deleteEntry(language, lemma);
  revalidatePath("/vocab");
}
