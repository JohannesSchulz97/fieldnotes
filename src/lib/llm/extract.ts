import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { ExtractionResult } from "../types";
import { getClient, LEMMA_RULES, model, reasoningEffort, TARGET_LANGUAGE, trackUsage } from "./client";

const Extraction = z.object({
  sourceLanguage: z.string().describe("ISO 639-1 code of the text's language"),
  items: z.array(
    z.object({
      lemma: z.string(),
      partOfSpeech: z.string().nullable(),
      kind: z.enum(["word", "expression"]),
      translation: z.string(),
      sentence: z.number().int(),
      form: z.string(),
    })
  ),
});

const INSTRUCTIONS = `You extract vocabulary from a text for a language learner.

${LEMMA_RULES}

Procedure:
1. Split the text into words. Separate elided and contracted forms into their component words: "qu'elle" → "que" + "elle", "l'arbre" → "le" + "arbre", "du" → "de" + "le", "au" → "à" + "le", "jusqu'à" → "jusque" + "à".
2. Drop every token that is not vocabulary, and words not in the text's main language. A capitalized word mid-sentence is almost always a proper noun.
3. Identify expressions. List the words of non-expression combinations individually.
4. Every remaining word is its own item, including function words (articles, pronouns, prepositions, conjunctions). Words that are part of an expression are also listed individually if they appear outside that expression elsewhere in the text.

Each lemma exactly once. Additional fields:
- translation: fitting the meaning used in the text.
- sentence: the number of the sentence where the item first appears. The input text is given as numbered sentences "[n] ...".
- form: the item exactly as it appears in that sentence, copied character for character (e.g. "assise" for "s'asseoir", "s'est rendu compte" for "se rendre compte").`;

function splitSentences(text: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
  return [...segmenter.segment(text)].map((s) => s.segment.trim()).filter(Boolean);
}

export async function llmExtract(text: string): Promise<Omit<ExtractionResult, "totalCostUsd">> {
  const sentences = splitSentences(text);
  const response = await getClient().responses.parse({
    model,
    reasoning: { effort: reasoningEffort },
    instructions: INSTRUCTIONS,
    input: sentences.map((s, i) => `[${i}] ${s}`).join("\n"),
    text: { format: zodTextFormat(Extraction, "extraction") },
  });

  const costUsd = await trackUsage("extraction", response.usage);
  const parsed = response.output_parsed;
  if (!parsed) throw new Error("LLM returned no parseable extraction");

  // The model occasionally repeats a lemma; keep the first occurrence so lemmas stay unique.
  const seen = new Set<string>();
  const unique = parsed.items.filter((i) => !seen.has(i.lemma) && seen.add(i.lemma));
  const items = unique.map(({ sentence, ...item }) => ({
    ...item,
    exampleSentence: sentences[sentence] ?? "",
  }));

  return {
    sourceLanguage: parsed.sourceLanguage.toLowerCase(),
    targetLanguage: TARGET_LANGUAGE,
    items,
    knownItems: [],
    costUsd,
    stats: {
      totalLemmas: items.length,
      knownCount: 0,
      unknownCount: items.length,
    },
  };
}
