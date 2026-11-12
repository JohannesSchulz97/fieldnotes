import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { ExerciseRecord } from "../db/exercises";
import { answerKey } from "../exercises";
import { getNativeLanguage } from "../languages";
import { normalizeLemma, PARTS_OF_SPEECH } from "../lemma";
import type { CefrLevel, GrammarItem, LanguageCode } from "../types";
import { getClient, model, reasoningEffort, trackUsage } from "./client";

const Exercises = z.object({
  exercises: z.array(
    z.object({
      before: z.string(),
      answer: z.string(),
      after: z.string(),
      cue: z.string(),
      alternatives: z.array(z.string()),
      translation: z.string(),
      reason: z.string(),
      words: z.array(
        z.object({
          form: z.string(),
          lemma: z.string(),
          partOfSpeech: z.enum(PARTS_OF_SPEECH).nullable(),
          kind: z.enum(["word", "expression"]),
          gender: z.enum(["m", "f"]).nullable(),
          translation: z.string(),
        })
      ),
    })
  ),
});

/**
 * Depends only on the language and the vocabulary, so consecutive sets share a cacheable prefix;
 * the construct and the count go in the input.
 */
export function exerciseInstructions(language: LanguageCode, knownLemmas: string[]): string {
  const native = getNativeLanguage();
  return `You write fill-in-the-blank exercises for a learner of the language with ISO 639-1 code "${language}", to practise one grammatical construct. The goal is to get comfortable with the construct, not to learn new words.

Each exercise is one short, natural, everyday sentence (at most 15 words) with one blank. The learner reads the sentence and the cue and types what belongs in the blank.
- About three in four exercises need the construct in the blank. The others are contrast cases: the same kind of cue, but the meaning or context of the sentence requires a different, related form (for example the indicative where the construct is a subjunctive). In every exercise the context must decide the form, so the learner has to think about meaning instead of filling in a pattern. Put the contrast cases at random positions.
- before, answer, after: the sentence split around the blank, so before + answer + after is the full sentence, spaces and punctuation included. answer is the shortest part that shows the construct or the contrasting form, usually 1-3 words.
- cue: what the learner gets to produce the answer, usually the base form of the word(s) in the blank (the infinitive for a verb form). Never the answer itself. If the construct is about choosing a word (a pronoun, a preposition), a short description in ${native} of what is needed.
- alternatives: other answers that are equally correct in this sentence; usually none.
- translation: natural ${native} translation of the full sentence.
- reason: why this form is needed here, in at most 15 words of ${native}.
- words: every content word of the full sentence (nouns, verbs, adjectives, adverbs, expressions), including those in the answer. form: the word exactly as it appears in the sentence, copied character for character. lemma: its dictionary form, spelled as in the vocabulary list when it is there. partOfSpeech: exactly one of ${PARTS_OF_SPEECH.map((p) => `"${p}"`).join(", ")}; null for an expression where none fits. kind: "expression" for expressions, otherwise "word". gender: "m" or "f" for a noun of a language with masculine and feminine nouns, otherwise null. translation: its common ${native} translation.

Vocabulary: build the sentences only from the learner's known vocabulary below, plus function words (articles, pronouns, prepositions, conjunctions, auxiliaries). Use another word only if a natural sentence is impossible without it, and then a very common one. Vary subjects, situations and words across the exercises. Use no grammar above the given level besides the construct.

Known vocabulary: ${knownLemmas.join(", ")}`;
}

function exerciseInput(item: GrammarItem, level: CefrLevel, count: number, brief: string | null): string {
  const examples = item.examples.map((e) => `- ${e.sentence}`).join("\n");
  // From the catalogue card: the forms learners confuse make the best contrast cases.
  const pitfalls = item.pitfalls.length > 0 ? `\nTypical mistakes:\n${item.pitfalls.map((p) => `- ${p}`).join("\n")}` : "";
  const contrasts =
    item.contrasts.length > 0
      ? `\nEasily confused with (use these for the contrast cases):\n${item.contrasts.map((c) => `- ${c.name}: ${c.note}`).join("\n")}`
      : "";
  return `Construct: ${item.name}
Explanation: ${item.explanation}
Level: ${level}
Examples:
${examples}${pitfalls}${contrasts}${wishes(brief)}

Write ${count} exercises.`;
}

/**
 * The learner's own wishes for a set (theme, situation, words), in the input so the instructions
 * stay a shared, cacheable prefix. They shape the content, never the format.
 */
function wishes(brief: string | null): string {
  if (!brief) return "";
  return `

Learner's wishes for this set (a theme, a situation or words to use): ${brief}
Follow them where they fit the rules above. Words the wishes ask for may be used even if they are not in the known vocabulary. They do not change the format of the exercises.`;
}

/**
 * Generates fill-in-the-blank exercises for a construct. Exercises whose parts don't fit together
 * are dropped, and so are words whose form is not in the sentence.
 */
export async function llmGenerateExercises({
  item,
  level,
  count,
  knownLemmas,
  brief = null,
}: {
  item: GrammarItem;
  level: CefrLevel;
  count: number;
  knownLemmas: string[];
  /** The learner's free-text wishes for the set, if any. */
  brief?: string | null;
}): Promise<{ exercises: ExerciseRecord[]; costUsd: number | null }> {
  const response = await getClient().responses.parse({
    model,
    reasoning: { effort: reasoningEffort },
    instructions: exerciseInstructions(item.language, knownLemmas),
    input: exerciseInput(item, level, count, brief),
    text: { format: zodTextFormat(Exercises, "grammar_exercises") },
  });
  const costUsd = await trackUsage("exercises", response.usage);
  const parsed = response.output_parsed;
  if (!parsed) throw new Error("LLM returned no parseable exercises");

  // Lemmas are match keys against the vocabulary; use the stored spelling when only case differs.
  const knownByKey = new Map(knownLemmas.map((l) => [normalizeLemma(l).toLowerCase(), l]));
  const lemmaOf = (lemma: string) =>
    knownByKey.get(normalizeLemma(lemma).toLowerCase()) ?? normalizeLemma(lemma);
  const exercises = parsed.exercises
    .filter((e) => answerKey(e.answer) && answerKey(e.cue) !== answerKey(e.answer))
    .slice(0, count)
    .map((e): ExerciseRecord => {
      const sentence = e.before + e.answer + e.after;
      return {
        before: e.before.trimStart(),
        answer: e.answer.trim(),
        after: e.after.trimEnd(),
        alternatives: e.alternatives.map((a) => a.trim()).filter(Boolean),
        cue: e.cue.trim(),
        translation: e.translation.trim(),
        reason: e.reason.trim(),
        words: e.words
          .map((w) => ({
            form: w.form.trim(),
            lemma: lemmaOf(w.lemma),
            partOfSpeech: w.partOfSpeech,
            kind: w.kind,
            gender: w.partOfSpeech === "noun" ? w.gender : null,
            translation: w.translation.trim(),
          }))
          .filter((w) => w.form && w.lemma && sentence.includes(w.form)),
      };
    });
  if (exercises.length === 0) throw new Error("LLM returned no usable exercises");
  return { exercises, costUsd };
}
