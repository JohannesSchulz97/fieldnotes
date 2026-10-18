import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { GrammarAnalysis, LanguageCode } from "../types";
import { getClient, model, reasoningEffort, TARGET_LANGUAGE, trackUsage } from "./client";

const Analysis = z.object({
  name: z.string(),
  explanation: z.string(),
  note: z.string(),
  examples: z.array(z.object({ sentence: z.string(), form: z.string(), translation: z.string() })),
});

/** Validates an analysis the client sends back for saving. */
export const GrammarAnalysisSchema = z.object({
  name: z.string().trim().min(1).max(200),
  explanation: z.string().min(1).max(4000),
  note: z.string().max(4000),
  examples: z
    .array(
      z.object({
        sentence: z.string().min(1).max(500),
        form: z.string().max(500),
        translation: z.string().max(500),
      })
    )
    .max(10),
});

function instructions(language: LanguageCode, knownNames: string[]): string {
  return `You help a learner understand the grammar of a text in the language with ISO 639-1 code "${language}". The learner selected a part of one sentence. Identify the main grammatical construct in the selection (the one a learner is most likely asking about) and explain it. Write all explanations and translations in ${TARGET_LANGUAGE}.

- name: short canonical name of the construct as a grammar reference would title it, using the usual term in the text's language with its pattern, e.g. "gérondif (en + participe présent)" or "subjonctif après « bien que »". Name the general construct, not this instance, so the same construct gets the same name in every text.${
    knownNames.length > 0
      ? ` If the construct is one of these already saved names, return that name exactly: ${knownNames.map((n) => `"${n}"`).join(", ")}.`
      : ""
  }
- explanation: the construct in general, independent of this text: how it is formed and what it expresses, in 2-4 sentences.
- note: how the construct works in the selected words and what they mean here, in 1-2 sentences. Mention briefly any other notable construct in the selection.
- examples: 3 short, everyday sentences in the text's language that use the construct, each with the construct as the clear focus and no other difficult grammar or rare words. form: the part of the sentence that shows the construct, copied character for character. translation: natural ${TARGET_LANGUAGE}.`;
}

/** Explains the main grammatical construct in a span of a sentence, with short examples. */
export async function llmAnalyzeGrammar({
  language,
  span,
  sentence,
  context,
  knownNames,
}: {
  language: LanguageCode;
  span: string;
  sentence: string;
  /** The surrounding sentences, for meaning only. */
  context: string;
  knownNames: string[];
}): Promise<GrammarAnalysis> {
  const response = await getClient().responses.parse({
    model,
    reasoning: { effort: reasoningEffort },
    instructions: instructions(language, knownNames),
    input: `Context: ${context}\n\nSentence: ${sentence}\n\nSelection: ${span}`,
    text: { format: zodTextFormat(Analysis, "grammar_analysis") },
  });
  await trackUsage("grammar", response.usage);
  const parsed = response.output_parsed;
  if (!parsed) throw new Error("LLM returned no parseable analysis");
  return parsed;
}
