import "server-only";
import OpenAI from "openai";

export const TARGET_LANGUAGE = "en";

export const model = process.env.OPENAI_MODEL ?? "gpt-5.5";
export const reasoningEffort = (process.env.OPENAI_REASONING_EFFORT ?? "low") as OpenAI.ReasoningEffort;

let client: OpenAI | null = null;

export function getClient(): OpenAI {
  client ??= new OpenAI();
  return client;
}

/** Shared by extraction and normalization so stored lemmas always match extracted ones. */
export const LEMMA_RULES = `Guiding principle: an item is vocabulary only if it would have its own headword entry in a general-language dictionary of its language (not an encyclopedia or gazetteer). Proper nouns of any kind (people, places, cities, countries, organizations, brands, titles), numbers and typos are not vocabulary.

Expressions: a multi-word unit is an expression only if it is idiomatic or lexicalized — its meaning is not simply the sum of its parts, or it is a fixed phrase dictionaries list as a sub-entry (e.g. "se rendre compte", "avoir besoin de", "tout à fait", "au fur et à mesure"). Ordinary combinations like "le dernier train", "jusqu'à minuit", "hier soir" are NOT expressions.

Lemma format: dictionary form, lowercase. Infinitive for verbs (reflexive verbs with "se", elided before a vowel: "s'asseoir"); masculine singular for adjectives; nouns with their definite article (e.g. "le quai", "l'arbre"); expressions in their citation form.
- kind: "expression" for expressions, otherwise "word".
- partOfSpeech: e.g. "noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "determiner"; null for expressions if unclear.
- translation: concise ${TARGET_LANGUAGE} translation.`;
