import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getNativeLanguage } from "../languages";
import { getClient, model, reasoningEffort, trackUsage } from "./client";

const Translation = z.object({
  sentences: z.array(z.object({ sentence: z.number().int(), translation: z.string() })),
});

const INSTRUCTIONS = () => `Translate each numbered sentence into natural, faithful ${getNativeLanguage()}. The input is given as "[n] sentence". Return one translation per input sentence with its number, using the surrounding sentences as context.`;

/** Translates sentences one by one; the result is aligned with the input (missing ones are ""). */
export async function llmTranslate(sentences: string[]): Promise<string[]> {
  const response = await getClient().responses.parse({
    model,
    reasoning: { effort: reasoningEffort },
    instructions: INSTRUCTIONS(),
    input: sentences.map((s, i) => `[${i}] ${s}`).join("\n"),
    text: { format: zodTextFormat(Translation, "translation") },
  });
  await trackUsage("translation", response.usage);
  const parsed = response.output_parsed;
  if (!parsed) throw new Error("LLM returned no parseable translation");

  const result = sentences.map(() => "");
  for (const { sentence, translation } of parsed.sentences) {
    if (sentence >= 0 && sentence < result.length) result[sentence] = translation;
  }
  return result;
}
