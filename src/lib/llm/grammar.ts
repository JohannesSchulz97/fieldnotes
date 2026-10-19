import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { CEFR_LEVELS, GRAMMAR_CATEGORY_VALUES } from "../grammar";
import type {
  CefrLevel,
  GrammarCategory,
  GrammarExplanation,
  LanguageCode,
} from "../types";
import { getClient, model, reasoningEffort, TARGET_LANGUAGE, trackUsage } from "./client";

/** Value of `match` for a construct that is not one of the saved names. */
export const NEW_CONSTRUCT = "new";

const NAMING_PROTOCOL = `Naming protocol for constructs:
- Format: "<usual grammatical term in the text's language> (<pattern>)", in lowercase except where the language requires capitals, e.g. "gérondif (en + participe présent)", "subjonctif (après conjonction de concession)", "ne … que (restriction)".
- Scope: one form with its meaning, at the level of a section in a grammar book. Generalize trigger words to their class ("bien que" → conjonction de concession) unless the construct only exists with that word.
- The pattern uses grammatical categories (infinitif, participe passé, que + subjonctif), never words that only occur in this text.
- Name the general construct, never this instance, so the same construct gets the same name in every text.`;

const CATEGORY_GUIDE = `Categories: tense_aspect (tenses, aspect), mood (subjunctive, conditional, imperative), non_finite (infinitive, participles, gerund), voice (passive, causative, reflexive voice), pronouns (personal, relative, adverbial, demonstrative), determiners (articles, partitives, possessives, quantifiers), agreement (gender, number, participle agreement), prepositions, negation, questions, clauses (subordination, conjunctions, conditionals, reported speech), comparison (comparatives, superlatives), word_order (inversion, emphasis, clefts, placement), other.`;

function identifySchema(savedNames: string[]) {
  return z.object({
    constructs: z.array(
      z.object({
        match: z.enum([NEW_CONSTRUCT, ...savedNames]),
        name: z.string(),
        category: z.enum(GRAMMAR_CATEGORY_VALUES),
        level: z.enum(CEFR_LEVELS),
        form: z.string(),
        gist: z.string(),
      })
    ),
  });
}

function identifyInstructions(language: LanguageCode, savedNames: string[]): string {
  return `You help a learner understand the grammar of a text in the language with ISO 639-1 code "${language}". The learner selected part of one sentence. List the grammatical constructs in the selection that are worth learning, most relevant first, at most 4. Skip trivial ones (plain articles, regular agreement, basic word order) unless nothing else is there. Plain vocabulary, idioms and fixed expressions are not grammatical constructs.

For each construct:
- match: ${
    savedNames.length > 0
      ? `if it is the same construct as one of the learner's saved constructs, that saved name exactly; otherwise "${NEW_CONSTRUCT}". Same construct means same form and meaning, even with different words.`
      : `"${NEW_CONSTRUCT}".`
  }
- name: the construct's name following the naming protocol (the saved name if it matches).
- category: the grammar area. ${CATEGORY_GUIDE}
- level: the CEFR level (A1-C2) at which learners of this language usually study the construct.
- form: the words of the selection that show the construct, copied character for character.
- gist: what the construct does here, in at most 12 words of ${TARGET_LANGUAGE}.

${NAMING_PROTOCOL}`;
}

export interface LlmConstruct {
  /** A saved name, or NEW_CONSTRUCT. */
  match: string;
  name: string;
  category: GrammarCategory;
  level: CefrLevel;
  form: string;
  gist: string;
}

/** Lists the grammatical constructs in a span of a sentence, matched against saved names. */
export async function llmIdentifyGrammar({
  language,
  span,
  sentence,
  context,
  savedNames,
}: {
  language: LanguageCode;
  span: string;
  sentence: string;
  /** The surrounding sentences, for meaning only. */
  context: string;
  savedNames: string[];
}): Promise<LlmConstruct[]> {
  const response = await getClient().responses.parse({
    model,
    reasoning: { effort: reasoningEffort },
    instructions: identifyInstructions(language, savedNames),
    input: `Context: ${context}\n\nSentence: ${sentence}\n\nSelection: ${span}`,
    text: { format: zodTextFormat(identifySchema(savedNames), "grammar_constructs") },
  });
  await trackUsage("grammar", response.usage);
  const parsed = response.output_parsed;
  if (!parsed) throw new Error("LLM returned no parseable constructs");
  return parsed.constructs;
}

const Explanation = z.object({
  explanation: z.string(),
  examples: z.array(z.object({ sentence: z.string(), form: z.string(), translation: z.string() })),
});

/** Validates an explanation the client sends back for saving. */
export const GrammarExplanationSchema = z.object({
  explanation: z.string().min(1).max(2000),
  examples: z
    .array(
      z.object({
        sentence: z.string().min(1).max(500),
        form: z.string().max(500),
        translation: z.string().max(500),
      })
    )
    .max(5),
});

/** Explains a construct in general terms, with two short examples. */
export async function llmExplainGrammar({
  language,
  name,
  form,
  sentence,
}: {
  language: LanguageCode;
  name: string;
  form: string;
  sentence: string;
}): Promise<GrammarExplanation> {
  const response = await getClient().responses.parse({
    model,
    reasoning: { effort: reasoningEffort },
    instructions: `You explain a grammatical construct of the language with ISO 639-1 code "${language}" to a learner, in ${TARGET_LANGUAGE}.
- explanation: how the construct is formed and what it expresses, in 1-2 short sentences. General, not about the given sentence.
- examples: 2 short, everyday sentences (at most 10 words) in the text's language, each using the construct as its clear focus, with no other difficult grammar or rare words. form: the part that shows the construct, copied character for character. translation: natural ${TARGET_LANGUAGE}.`,
    input: `Construct: ${name}\n\nSeen as "${form}" in: ${sentence}`,
    text: { format: zodTextFormat(Explanation, "grammar_explanation") },
  });
  await trackUsage("grammar", response.usage);
  const parsed = response.output_parsed;
  if (!parsed) throw new Error("LLM returned no parseable explanation");
  return parsed;
}
