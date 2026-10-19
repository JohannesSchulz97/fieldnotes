import "server-only";
import OpenAI from "openai";
import type { ResponseUsage } from "openai/resources/responses/responses";
import { recordUsage, type UsageRecord } from "../db/usage";

export const TARGET_LANGUAGE = "en";

export const model = process.env.OPENAI_MODEL ?? "gpt-5.5";
export const reasoningEffort = (process.env.OPENAI_REASONING_EFFORT ?? "low") as OpenAI.ReasoningEffort;

/** USD per 1M tokens. Update when OpenAI changes prices or a new model is used. */
const PRICES: Record<string, { input: number; cachedInput: number; output: number }> = {
  "gpt-5.5": { input: 5, cachedInput: 0.5, output: 30 },
};

let client: OpenAI | null = null;

export function getClient(): OpenAI {
  client ??= new OpenAI();
  return client;
}

/** Records the token usage of one call and returns its cost in USD (null if the model has no known price). */
export async function trackUsage(
  kind: UsageRecord["kind"],
  usage: ResponseUsage | undefined
): Promise<number | null> {
  if (!usage) return null;
  const cachedInputTokens = usage.input_tokens_details?.cached_tokens ?? 0;
  const price = PRICES[model];
  const costUsd = price
    ? ((usage.input_tokens - cachedInputTokens) * price.input +
        cachedInputTokens * price.cachedInput +
        usage.output_tokens * price.output) /
      1_000_000
    : null;
  await recordUsage({
    kind,
    model,
    inputTokens: usage.input_tokens,
    cachedInputTokens,
    outputTokens: usage.output_tokens,
    costUsd,
  });
  return costUsd;
}

/** Shared by extraction and normalization so stored lemmas always match extracted ones. */
export const LEMMA_RULES = `Guiding principle: an item is vocabulary only if it would have its own headword entry in a general-language dictionary of its language (not an encyclopedia or gazetteer). Proper nouns of any kind (people, places, cities, countries, organizations, brands, titles), numbers and typos are not vocabulary.

Expressions: a multi-word unit is an expression only if it is idiomatic or lexicalized — its meaning is not simply the sum of its parts, or it is a fixed phrase dictionaries list as a sub-entry (e.g. "se rendre compte", "avoir besoin de", "tout à fait", "au fur et à mesure"). Ordinary combinations like "le dernier train", "jusqu'à minuit", "hier soir" are NOT expressions.

Lemma format: dictionary form, lowercase. Infinitive for verbs (reflexive verbs with "se", elided before a vowel: "s'asseoir"); masculine singular for adjectives; nouns in the singular without any article (e.g. "quai", "arbre", "envie"; plural-only nouns in the plural, e.g. "gens"); expressions in their citation form, without a leading article.
- kind: "expression" for expressions, otherwise "word".
- gender: for nouns (also noun expressions), "m" or "f"; null for everything else.
- pluralOnly: true only for nouns that exist only in the plural (e.g. "gens"); otherwise false.
- partOfSpeech: e.g. "noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "determiner"; null for expressions if unclear.
- translation: the most common ${TARGET_LANGUAGE} translation of the lemma in general use, independent of any particular text. One translation is usually enough; add more only when the lemma has truly different common meanings, never synonyms of the same meaning. Separate several with ", " (at most three).`;
