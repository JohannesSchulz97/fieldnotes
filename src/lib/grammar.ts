import type { CefrLevel, GrammarCategory } from "./types";

/** Language-independent grammar areas; every construct belongs to one. */
export const GRAMMAR_CATEGORY_VALUES = [
  "tense_aspect",
  "mood",
  "non_finite",
  "voice",
  "pronouns",
  "determiners",
  "agreement",
  "prepositions",
  "negation",
  "questions",
  "clauses",
  "comparison",
  "word_order",
  "other",
] as const;

/** CEFR levels, the same scale for every language. */
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

/** Labels per category; a Record so adding a category without a label fails to compile. */
const CATEGORY_LABELS: Record<GrammarCategory, string> = {
  tense_aspect: "Tense & aspect",
  mood: "Mood",
  non_finite: "Non-finite verb forms",
  voice: "Voice",
  pronouns: "Pronouns",
  determiners: "Articles & determiners",
  agreement: "Agreement",
  prepositions: "Prepositions",
  negation: "Negation",
  questions: "Questions",
  clauses: "Clauses & linking",
  comparison: "Comparison",
  word_order: "Word order",
  other: "Other",
};

export const GRAMMAR_CATEGORIES = GRAMMAR_CATEGORY_VALUES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));

export function categoryLabel(category: GrammarCategory): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function isCefrLevel(value: unknown): value is CefrLevel {
  return CEFR_LEVELS.includes(value as CefrLevel);
}

/** Canonical spelling of a construct name: typographic apostrophes become ', whitespace collapses. */
export function normalizeGrammarName(name: string): string {
  return name.replace(/[’‘ʼ]/g, "'").replace(/\s+/g, " ").trim();
}

/** Comparison key for construct names: also ignores case. */
export function grammarNameKey(name: string): string {
  return normalizeGrammarName(name).toLowerCase();
}

/** Where the theory of a saved grammar item is shown: its entry in the unfiltered grammar list. */
export function grammarItemHref(id: string): string {
  return `/grammar#item-${id}`;
}
