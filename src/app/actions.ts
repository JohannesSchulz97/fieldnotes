"use server";

import { revalidatePath } from "next/cache";
import { getStoredLemmas, saveWithStatus } from "@/lib/db/vocab";
import { llmExtract } from "@/lib/llm/extract";
import type { ExtractedItem, ExtractionResult, LanguageCode, WordStatus } from "@/lib/types";

export async function extract(text: string): Promise<ExtractionResult> {
  if (!text.trim()) throw new Error("Empty text");
  const result = await llmExtract(text);
  const stored = await getStoredLemmas(
    result.sourceLanguage,
    result.items.map((i) => i.lemma)
  );
  const items = result.items.filter((i) => !stored.has(i.lemma));
  return {
    ...result,
    items,
    stats: {
      totalLemmas: result.stats.totalLemmas,
      knownCount: result.stats.totalLemmas - items.length,
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
  await saveWithStatus(item, language, translationLanguage, status);
  revalidatePath("/vocab");
}
