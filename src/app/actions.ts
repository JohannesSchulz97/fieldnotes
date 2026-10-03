"use server";

import { revalidatePath } from "next/cache";
import { getStoredLemmas, saveWithStatus } from "@/lib/db/vocab";
import { mockExtract } from "@/lib/mock-data";
import type { ExtractedItem, ExtractionResult, LanguageCode, WordStatus } from "@/lib/types";

export async function extract(text: string): Promise<ExtractionResult> {
  const result = await mockExtract(text);
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
