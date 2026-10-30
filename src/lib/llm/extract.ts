import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getNativeLanguage } from "../languages";
import { normalizeLemma, PARTS_OF_SPEECH, vocabKey } from "../lemma";
import { splitSentences } from "../sentences";
import type { ExtractedItem, LanguageCode } from "../types";
import { getClient, model, reasoningEffort, trackUsage } from "./client";
import { extractInstructions } from "./prompts";

const Extraction = z.object({
  sourceLanguage: z.string().describe("ISO 639-1 code of the language the text is actually written in"),
  items: z.array(
    z.object({
      lemma: z.string(),
      partOfSpeech: z.enum(PARTS_OF_SPEECH).nullable(),
      kind: z.enum(["word", "expression"]),
      gender: z.enum(["m", "f"]).nullable(),
      pluralOnly: z.boolean(),
      translation: z.string(),
      contextNote: z.string().nullable(),
      sentence: z.number().int(),
      form: z.string(),
    })
  ),
});

export interface LlmExtraction {
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  /** The language the model recognized the text as; differs from sourceLanguage on a mismatch. */
  detectedLanguage: LanguageCode;
  /** Every item in the text, known or not. */
  items: ExtractedItem[];
  costUsd: number | null;
}

/**
 * Extracts the vocabulary of a text in the given language. detectedLanguage is what the model
 * recognized the text to be, so callers can warn when it differs.
 */
export async function llmExtract(text: string, language: LanguageCode): Promise<LlmExtraction> {
  const sentences = splitSentences(text);
  const response = await getClient().responses.parse({
    model,
    reasoning: { effort: reasoningEffort },
    instructions: extractInstructions(language),
    input: sentences.map((s, i) => `[${i}] ${s}`).join("\n"),
    text: { format: zodTextFormat(Extraction, "extraction") },
  });

  const costUsd = await trackUsage("extraction", response.usage);
  const parsed = response.output_parsed;
  if (!parsed) throw new Error("LLM returned no parseable extraction");

  // The model occasionally repeats an item; keep the first occurrence so keys stay unique. Words that
  // only share a lemma ("son" the determiner and "son" the noun) are different items.
  const seen = new Set<string>();
  const unique = parsed.items
    .map((i) => ({ ...i, lemma: normalizeLemma(i.lemma) }))
    .filter((i) => !seen.has(vocabKey(i)) && seen.add(vocabKey(i)));
  const items = unique.map(({ sentence, ...item }) => ({
    ...item,
    exampleSentence: sentences[sentence] ?? "",
  }));

  return {
    sourceLanguage: language,
    targetLanguage: getNativeLanguage(),
    detectedLanguage: parsed.sourceLanguage.toLowerCase(),
    items,
    costUsd,
  };
}
