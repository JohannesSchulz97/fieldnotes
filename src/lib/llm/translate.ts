import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getNativeLanguage, languageName } from "../languages";
import { tokenizeSentence, validGlosses, MAX_GLOSS_TOKENS, type Gloss } from "../tokens";
import type { LanguageCode } from "../types";
import { getClient, model, reasoningEffort, trackUsage } from "./client";

const Groups = z.array(z.object({ from: z.number().int(), to: z.number().int(), gloss: z.string() }));

const Translation = z.object({
  sentences: z.array(
    z.object({ sentence: z.number().int(), translation: z.string(), groups: Groups })
  ),
});

const GlossOnly = z.object({
  sentences: z.array(z.object({ sentence: z.number().int(), groups: Groups })),
});

const GLOSS_RULES = (source: LanguageCode) => `Each sentence is also given as its numbered words ("words: 0=il 1=s 2=agit ..."). Besides the sentence, return groups that gloss the words: each group is a range of consecutive word numbers (from, to, both inclusive) and the meaning of that range in this sentence, in ${languageName(getNativeLanguage())}, as short as possible (one to three words where you can; no explanations).
- Cover every word, in order, with no overlaps and no gaps.
- A group is a single word, unless several words only mean something together in this sentence: a fixed expression, a verb with its separated particle, a negation pair. Never group a word with an article or an elided particle just because they sit together. A group has at most ${MAX_GLOSS_TOKENS} words.
- Gloss a word as it is used here (its inflected form and sense in this sentence), not as a dictionary entry.
- The words are ${languageName(source)}. Leave proper names as they are.`;

const TRANSLATE = (source: LanguageCode) => `Translate each numbered sentence into natural, faithful ${languageName(getNativeLanguage())}. The input is given as "[n] sentence". Return one translation per input sentence with its number, using the surrounding sentences as context. The translation is a natural sentence of its own: do not build it from the groups.

${GLOSS_RULES(source)}`;

const GLOSS = (source: LanguageCode) => `Each numbered sentence comes with its existing ${languageName(getNativeLanguage())} translation. Do not return the translation; return only the groups, consistent with it.

${GLOSS_RULES(source)}`;

function describe(sentence: string): string {
  const words = tokenizeSentence(sentence).map((t, i) => `${i}=${t.text}`).join(" ");
  return `${sentence}\nwords: ${words}`;
}

function collect(sentences: string[], parsed: { sentence: number; groups: Gloss[] }[]): Gloss[][] {
  const result: Gloss[][] = sentences.map(() => []);
  for (const { sentence, groups } of parsed) {
    if (sentence < 0 || sentence >= result.length) continue;
    result[sentence] = validGlosses(groups, tokenizeSentence(sentences[sentence]).length);
  }
  return result;
}

/**
 * Translates sentences one by one, with a gloss per group of words from the same call. Both
 * results are aligned with the input; missing translations are "" and unglossed sentences [].
 */
export async function llmTranslate(
  sentences: string[],
  source: LanguageCode
): Promise<{ translations: string[]; glosses: Gloss[][] }> {
  const response = await getClient().responses.parse({
    model,
    reasoning: { effort: reasoningEffort },
    instructions: TRANSLATE(source),
    input: sentences.map((s, i) => `[${i}] ${describe(s)}`).join("\n"),
    text: { format: zodTextFormat(Translation, "translation") },
  });
  await trackUsage("translation", response.usage);
  const parsed = response.output_parsed;
  if (!parsed) throw new Error("LLM returned no parseable translation");

  const translations = sentences.map(() => "");
  for (const { sentence, translation } of parsed.sentences) {
    if (sentence >= 0 && sentence < translations.length) translations[sentence] = translation;
  }
  return { translations, glosses: collect(sentences, parsed.sentences) };
}

/** Glosses sentences that already have a translation, which stays as it is. */
export async function llmGloss(
  sentences: string[],
  translations: string[],
  source: LanguageCode
): Promise<Gloss[][]> {
  const response = await getClient().responses.parse({
    model,
    reasoning: { effort: reasoningEffort },
    instructions: GLOSS(source),
    input: sentences
      .map((s, i) => `[${i}] ${describe(s)}\ntranslation: ${translations[i] ?? ""}`)
      .join("\n"),
    text: { format: zodTextFormat(GlossOnly, "glosses") },
  });
  await trackUsage("translation", response.usage);
  const parsed = response.output_parsed;
  if (!parsed) throw new Error("LLM returned no parseable glosses");
  return collect(sentences, parsed.sentences);
}
