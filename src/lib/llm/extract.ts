import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { ExtractionResult } from "../types";

const TARGET_LANGUAGE = "en";

let client: OpenAI | null = null;
const model = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";

const Extraction = z.object({
  sourceLanguage: z.string().describe("ISO 639-1 code of the text's language"),
  items: z.array(
    z.object({
      lemma: z.string(),
      surfaceForms: z.array(z.string()),
      partOfSpeech: z.string().nullable(),
      kind: z.enum(["word", "expression"]),
      translation: z.string(),
      exampleSentence: z.string(),
      occurrences: z.number().int(),
    })
  ),
});

const INSTRUCTIONS = `You extract vocabulary from a text for a language learner.

Guiding principle: an item belongs in the output only if it would have its own headword entry in a general-language dictionary of the text's language (not an encyclopedia or gazetteer). Apply this test to every candidate.

Procedure:
1. Split the text into words. Separate elided and contracted forms into their component words: "qu'elle" → "que" + "elle", "l'arbre" → "le" + "arbre", "du" → "de" + "le", "au" → "à" + "le", "jusqu'à" → "jusque" + "à".
2. Drop every token that fails the dictionary test: proper nouns of any kind (people, places, cities, countries, organizations, brands, titles), numbers, typos, and words not in the text's main language. A capitalized word mid-sentence is almost always a proper noun.
3. Identify expressions: a multi-word unit is an expression only if it is idiomatic or lexicalized — its meaning is not simply the sum of its parts, or it is a fixed phrase dictionaries list as a sub-entry (e.g. "se rendre compte", "avoir besoin de", "tout à fait", "au fur et à mesure"). Ordinary combinations like "le dernier train", "jusqu'à minuit", "hier soir" are NOT expressions; list their words individually.
4. Every remaining word is its own item, including function words (articles, pronouns, prepositions, conjunctions). Words that are part of an expression are also listed individually if they appear outside that expression elsewhere in the text.

Fields for each item (each lemma exactly once):
- lemma: dictionary form, lowercase. Infinitive for verbs (reflexive verbs with "se"); masculine singular for adjectives; nouns with their definite article (e.g. "le quai", "l'arbre"); expressions in their citation form.
- kind: "expression" for items from step 3, otherwise "word".
- surfaceForms: the distinct forms exactly as they appear in the text.
- partOfSpeech: e.g. "noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "determiner"; null for expressions if unclear.
- translation: concise ${TARGET_LANGUAGE} translation fitting the meaning used in the text.
- exampleSentence: the sentence from the text where the item first appears, verbatim.
- occurrences: how often the item appears in the text.`;

export async function llmExtract(text: string): Promise<ExtractionResult> {
  client ??= new OpenAI();
  const response = await client.responses.parse({
    model,
    instructions: INSTRUCTIONS,
    input: text,
    text: { format: zodTextFormat(Extraction, "extraction") },
  });

  const parsed = response.output_parsed;
  if (!parsed) throw new Error("LLM returned no parseable extraction");

  return {
    sourceLanguage: parsed.sourceLanguage.toLowerCase(),
    targetLanguage: TARGET_LANGUAGE,
    items: parsed.items,
    stats: {
      totalLemmas: parsed.items.length,
      knownCount: 0,
      unknownCount: parsed.items.length,
    },
  };
}
