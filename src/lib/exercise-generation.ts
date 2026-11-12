import "server-only";
import { createExerciseSet } from "./db/exercises";
import { createGrammarItem, listGrammarItems, listGrammarNames } from "./db/grammar";
import { listKnownLemmas } from "./db/vocab";
import {
  EXERCISE_TYPES,
  type ExerciseType,
  MAX_EXERCISE_BRIEF_LENGTH,
  MAX_EXERCISE_COUNT,
} from "./exercises";
import { grammarNameKey } from "./grammar";
import { cardExplanation, getConstruct } from "./grammar-catalog";
import type { CatalogConstruct } from "./grammar-catalog/schema";
import { getNativeLanguage } from "./languages";
import { llmGenerateExercises } from "./llm/exercises";
import { llmExplainGrammar } from "./llm/grammar";
import type { CefrLevel, GrammarCategory, LanguageCode } from "./types";

/**
 * What a set practises: a saved grammar item, a construct of the language's catalogue, or a
 * construct described by name (for a language without a catalogue, or one the catalogue lacks).
 */
export type GrammarTarget =
  | { kind: "item"; itemId: string }
  | { kind: "construct"; constructId: string }
  | { kind: "new"; name: string; description: string; category: GrammarCategory; level: CefrLevel };

/** A request for a set of exercises, from the grammar list's button or from the chat. */
export interface ExerciseRequest {
  language: LanguageCode;
  /** The constructs the set practises. Exactly one for now: a set of several needs its own table. */
  targets: GrammarTarget[];
  count: number;
  /** The level to write for; defaults to the construct's level. */
  level?: CefrLevel | null;
  /** The learner's wishes: a theme, a situation, words to use. */
  brief?: string | null;
  /** Kinds of exercise to mix; defaults to all. Only fill-in-the-blank exists so far. */
  types?: ExerciseType[];
}

/** A target as a saved grammar item; `added` when it was saved for this request. */
export interface ResolvedTarget {
  itemId: string;
  name: string;
  added: boolean;
}

export interface CreatedExerciseSet {
  setId: string;
  count: number;
  level: CefrLevel;
  items: ResolvedTarget[];
}

/**
 * Saves a catalogue construct to the grammar list, with its card's explanation and examples.
 * Returns the item's id, an existing one if the construct is already tracked.
 */
export async function saveCatalogConstruct(language: LanguageCode, entry: CatalogConstruct): Promise<string> {
  const native = getNativeLanguage();
  return createGrammarItem(
    language,
    native,
    {
      constructId: entry.id,
      name: entry.name,
      category: entry.category,
      level: entry.level,
      explanation: cardExplanation(language, entry, native) ?? entry.description,
    },
    (entry.card?.examples ?? []).map(({ sentence, form, translation }) => ({
      origin: "generated" as const,
      sentence,
      form,
      translation,
      extractionId: null,
      sentenceIndex: null,
    }))
  );
}

/**
 * The saved grammar item of a target. A catalogue construct or a described construct that is not
 * saved yet is added to the grammar list ("to work on"), so its theory can be reviewed.
 */
export async function resolveGrammarTarget(
  language: LanguageCode,
  target: GrammarTarget
): Promise<ResolvedTarget> {
  if (target.kind === "item") {
    const [item] = await listGrammarItems({ ids: [target.itemId] });
    if (!item || item.language !== language) throw new Error("Grammar item not found");
    return { itemId: item.id, name: item.name, added: false };
  }

  const saved = await listGrammarNames(language);
  if (target.kind === "construct") {
    const entry = getConstruct(language, target.constructId);
    if (!entry) throw new Error("Unknown catalogue construct");
    const existing = saved.find((i) => i.constructId === entry.id);
    if (existing) return { itemId: existing.id, name: existing.name, added: false };
    return { itemId: await saveCatalogConstruct(language, entry), name: entry.name, added: true };
  }

  // A described construct is matched by name, where spelling details don't count.
  const existing = saved.find((i) => grammarNameKey(i.name) === grammarNameKey(target.name));
  if (existing) return { itemId: existing.id, name: existing.name, added: false };
  const explained = await llmExplainGrammar({ language, name: target.name, description: target.description });
  const itemId = await createGrammarItem(
    language,
    getNativeLanguage(),
    {
      constructId: null,
      name: target.name,
      category: target.category,
      level: target.level,
      explanation: explained.explanation,
    },
    explained.examples.map((e) => ({
      ...e,
      origin: "generated" as const,
      extractionId: null,
      sentenceIndex: null,
    }))
  );
  return { itemId, name: target.name, added: true };
}

function validate(request: ExerciseRequest): void {
  if (request.targets.length !== 1) throw new Error("A set practises exactly one construct for now");
  if (!Number.isInteger(request.count) || request.count < 1 || request.count > MAX_EXERCISE_COUNT) {
    throw new Error("Invalid number of exercises");
  }
  if (request.types?.some((t) => !EXERCISE_TYPES.includes(t))) throw new Error("Unknown exercise type");
  if ((request.brief?.length ?? 0) > MAX_EXERCISE_BRIEF_LENGTH) throw new Error("Wishes too long");
}

/** Generates and saves a set of exercises; the constructs it needs are saved first if they are new. */
export async function generateExerciseSet(request: ExerciseRequest): Promise<CreatedExerciseSet> {
  validate(request);
  const { language } = request;
  const resolved = await resolveGrammarTarget(language, request.targets[0]);
  const [item] = await listGrammarItems({ ids: [resolved.itemId] });
  if (!item) throw new Error("Grammar item not found");
  const level = request.level ?? item.level;
  const knownLemmas = await listKnownLemmas(language);
  const { exercises, costUsd } = await llmGenerateExercises({
    item,
    level,
    count: request.count,
    knownLemmas,
    brief: request.brief?.trim() || null,
  });
  const setId = await createExerciseSet({ grammarItemId: item.id, language, level, costUsd }, exercises);
  return { setId, count: exercises.length, level, items: [resolved] };
}
