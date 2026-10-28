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
import type { CatalogConstruct } from "../grammar-catalog/schema";
import { getNativeLanguage } from "../languages";
import { getClient, model, reasoningEffort, trackUsage } from "./client";
import { namingProtocol } from "./prompts";

/** Value of `match` for a construct that is not one of the saved names. */
export const NEW_CONSTRUCT = "new";

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

export function identifyInstructions(language: LanguageCode, savedNames: string[]): string {
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
- gist: what the construct does here, in at most 12 words of ${getNativeLanguage()}.

${namingProtocol(language)}`;
}

/** Value of `constructId` for a construct the catalogue lacks. */
export const NOT_IN_CATALOG = "none";

function catalogIdentifySchema(ids: string[]) {
  return z.object({
    constructs: z.array(
      z.object({
        constructId: z.enum([NOT_IN_CATALOG, ...ids]),
        name: z.string(),
        category: z.enum(GRAMMAR_CATEGORY_VALUES),
        level: z.enum(CEFR_LEVELS),
        form: z.string(),
        gist: z.string(),
      })
    ),
  });
}

/**
 * Identification against the language's grammar catalogue. Depends only on the language and its
 * catalogue, so it is a stable, cacheable prefix.
 */
export function catalogIdentifyInstructions(language: LanguageCode, catalog: CatalogConstruct[]): string {
  const entries = catalog
    .map((c) => {
      const aliases = c.aliases.length > 0 ? ` (also: ${c.aliases.join("; ")})` : "";
      return `${c.id} | ${c.name}${aliases} | ${c.description}`;
    })
    .join("\n");
  return `You help a learner understand the grammar of a text in the language with ISO 639-1 code "${language}". The learner selected part of one sentence. List the grammatical constructs in the selection that are worth learning, most relevant first, at most 4. Skip trivial ones (plain articles, regular agreement, basic word order) unless nothing else is there. Plain vocabulary, idioms and fixed expressions are not grammatical constructs.

Classify each construct against the grammar catalogue below: one entry per line, "id | name (also: other names) | description".
- constructId: the id of the catalogue entry that is this construct: the same form with the same use. When the catalogue has an entry for a construct's form and separate entries for its uses, pick the use entry that fits this sentence; pick the form entry only if the selection is mainly about building the form. Use "${NOT_IN_CATALOG}" only if no entry fits; never stretch an entry to a different construct.
- name, category, level: only for "${NOT_IN_CATALOG}": the construct's name following the naming protocol, its grammar area (${CATEGORY_GUIDE}) and the CEFR level (A1-C2) at which learners usually study it. For catalogue entries, copy the entry's name; category and level are ignored.
- form: the words of the selection that show the construct, copied character for character.
- gist: what the construct does here, in at most 12 words of ${getNativeLanguage()}.

${namingProtocol(language)}

Catalogue:
${entries}`;
}

export interface LlmConstruct {
  /** For catalogue identification: a catalogue id, or null. */
  constructId: string | null;
  /** For free identification: a saved name, or NEW_CONSTRUCT. */
  match: string;
  name: string;
  category: GrammarCategory;
  level: CefrLevel;
  form: string;
  gist: string;
}

/**
 * Lists the grammatical constructs in a span of a sentence: classified against the catalogue if
 * the language has one, otherwise named freely and matched against saved names.
 */
export async function llmIdentifyGrammar({
  language,
  span,
  sentence,
  context,
  catalog,
  savedNames,
}: {
  language: LanguageCode;
  span: string;
  sentence: string;
  /** The surrounding sentences, for meaning only. */
  context: string;
  catalog: CatalogConstruct[] | null;
  /** Only used without a catalogue. */
  savedNames: string[];
}): Promise<LlmConstruct[]> {
  const input = `Context: ${context}\n\nSentence: ${sentence}\n\nSelection: ${span}`;
  if (catalog) {
    const response = await getClient().responses.parse({
      model,
      reasoning: { effort: reasoningEffort },
      instructions: catalogIdentifyInstructions(language, catalog),
      input,
      text: {
        format: zodTextFormat(catalogIdentifySchema(catalog.map((c) => c.id)), "grammar_constructs"),
      },
    });
    await trackUsage("grammar", response.usage);
    const parsed = response.output_parsed;
    if (!parsed) throw new Error("LLM returned no parseable constructs");
    return parsed.constructs.map((c) => ({
      ...c,
      constructId: c.constructId === NOT_IN_CATALOG ? null : c.constructId,
      match: NEW_CONSTRUCT,
    }));
  }
  const response = await getClient().responses.parse({
    model,
    reasoning: { effort: reasoningEffort },
    instructions: identifyInstructions(language, savedNames),
    input,
    text: { format: zodTextFormat(identifySchema(savedNames), "grammar_constructs") },
  });
  await trackUsage("grammar", response.usage);
  const parsed = response.output_parsed;
  if (!parsed) throw new Error("LLM returned no parseable constructs");
  return parsed.constructs.map((c) => ({ ...c, constructId: null }));
}

/**
 * Finds the catalogue entry for a construct saved before the catalogue existed, from its name,
 * explanation and examples. Null if no entry fits.
 */
export async function llmClassifySavedConstruct({
  language,
  catalog,
  item,
}: {
  language: LanguageCode;
  catalog: CatalogConstruct[];
  item: { name: string; explanation: string; examples: { sentence: string; form: string }[] };
}): Promise<string | null> {
  const schema = z.object({ constructId: z.enum([NOT_IN_CATALOG, ...catalog.map((c) => c.id)]) });
  const examples = item.examples.map((e) => `- ${e.sentence} (shows: ${e.form})`).join("\n");
  const response = await getClient().responses.parse({
    model,
    reasoning: { effort: reasoningEffort },
    instructions: `${catalogIdentifyInstructions(language, catalog)}

Task: the learner saved a construct earlier, possibly under a poor name (e.g. named after one example word). Give the constructId of the catalogue entry that is the same construct, judged by what the examples show. Use "${NOT_IN_CATALOG}" only if no entry fits.`,
    input: `Saved name: ${item.name}\nExplanation: ${item.explanation}\nExamples:\n${examples}`,
    text: { format: zodTextFormat(schema, "catalog_match") },
  });
  await trackUsage("grammar", response.usage);
  const id = response.output_parsed?.constructId;
  return id && id !== NOT_IN_CATALOG ? id : null;
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

export function explainInstructions(language: LanguageCode): string {
  return `You explain a grammatical construct of the language with ISO 639-1 code "${language}" to a learner, in ${getNativeLanguage()}.
- explanation: how the construct is formed and what it expresses, in 1-2 short sentences. General, not about the given sentence.
- examples: 2 short, everyday sentences (at most 10 words) in the text's language, each using the construct as its clear focus, with no other difficult grammar or rare words. form: the part that shows the construct, copied character for character. translation: natural ${getNativeLanguage()}.`;
}

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
    instructions: explainInstructions(language),
    input: `Construct: ${name}\n\nSeen as "${form}" in: ${sentence}`,
    text: { format: zodTextFormat(Explanation, "grammar_explanation") },
  });
  await trackUsage("grammar", response.usage);
  const parsed = response.output_parsed;
  if (!parsed) throw new Error("LLM returned no parseable explanation");
  return parsed;
}
