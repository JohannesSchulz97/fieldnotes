import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { tokenizeSentence, validGlosses, type Gloss } from "../tokens";
import type { LanguageCode } from "../types";
import { getClient, model, reasoningEffort, trackUsage } from "./client";
import { glossInstructions, translateInstructions } from "./prompts";

const Groups = z.array(z.object({ from: z.number().int(), to: z.number().int(), gloss: z.string() }));

const Translation = z.object({
  sentences: z.array(
    z.object({ sentence: z.number().int(), translation: z.string(), groups: Groups })
  ),
});

const TranslationOnly = z.object({
  sentences: z.array(z.object({ sentence: z.number().int(), translation: z.string() })),
});

const GlossOnly = z.object({
  sentences: z.array(z.object({ sentence: z.number().int(), groups: Groups })),
});

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

function align(sentences: string[], parsed: { sentence: number; translation: string }[]): string[] {
  const translations = sentences.map(() => "");
  for (const { sentence, translation } of parsed) {
    if (sentence >= 0 && sentence < translations.length) translations[sentence] = translation;
  }
  return translations;
}

/**
 * Translates sentences one by one, with a gloss per group of words from the same call. Both
 * results are aligned with the input; missing translations are "" and unglossed sentences [].
 * The groups make the output grow with the number of words; if that call fails (e.g. a very long
 * text runs out of output), the text is translated without glosses, which are then null.
 */
export async function llmTranslate(
  sentences: string[],
  source: LanguageCode
): Promise<{ translations: string[]; glosses: Gloss[][] | null }> {
  try {
    const response = await getClient().responses.parse({
      model,
      reasoning: { effort: reasoningEffort },
      instructions: translateInstructions(source, true),
      input: sentences.map((s, i) => `[${i}] ${describe(s)}`).join("\n"),
      text: { format: zodTextFormat(Translation, "translation") },
    });
    await trackUsage("translation", response.usage);
    const parsed = response.output_parsed;
    if (!parsed) throw new Error("LLM returned no parseable translation with glosses");
    return {
      translations: align(sentences, parsed.sentences),
      glosses: collect(sentences, parsed.sentences),
    };
  } catch (e) {
    console.warn("Translation with glosses failed, translating without:", e);
  }

  const response = await getClient().responses.parse({
    model,
    reasoning: { effort: reasoningEffort },
    instructions: translateInstructions(source, false),
    input: sentences.map((s, i) => `[${i}] ${s}`).join("\n"),
    text: { format: zodTextFormat(TranslationOnly, "translation") },
  });
  await trackUsage("translation", response.usage);
  const parsed = response.output_parsed;
  if (!parsed) throw new Error("LLM returned no parseable translation");
  return { translations: align(sentences, parsed.sentences), glosses: null };
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
    instructions: glossInstructions(source),
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
