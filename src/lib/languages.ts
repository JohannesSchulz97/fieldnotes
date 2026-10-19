import type { LanguageCode } from "./types";

/**
 * The language translations and explanations are written in. Fixed for now; a per-user setting
 * would replace this function.
 */
export function getNativeLanguage(): LanguageCode {
  return "en";
}

/** Languages that can be added as a learning language. Others would need dedicated work (scripts, direction). */
export const LEARNABLE_LANGUAGES: LanguageCode[] = ["fr", "de", "es", "it", "pt", "nl", "sv", "pl"];

/** The learning language of a fresh install; also the one all data predating language selection belongs to. */
export const DEFAULT_LANGUAGE: LanguageCode = "fr";

export function isLearnable(code: string): boolean {
  return LEARNABLE_LANGUAGES.includes(code);
}

/** Human-readable name of a language in the native language, e.g. "French". Falls back to the code. */
export function languageName(code: LanguageCode): string {
  try {
    return new Intl.DisplayNames([getNativeLanguage()], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Language-specific hints for the prompts. Every field is optional: the prompts are written for
 * any language, and a field only adds examples or rules that the model would otherwise have to
 * guess. A language without a profile works with the generic prompts.
 */
export interface LanguageProfile {
  /** Rule for splitting elided, contracted or clitic forms into words (extraction step 1). */
  splitting?: string;
  /** Idiomatic expressions in citation form. */
  expressionExamples?: string[];
  /** Ordinary combinations that are not expressions. */
  ordinaryCombinationExamples?: string[];
  /** Lemma convention for verbs beyond "infinitive", e.g. reflexive verbs. */
  verbLemmaNote?: string;
  /** Bare noun lemmas. */
  nounExamples?: string[];
  pluralOnlyExample?: string;
  /** "mf": nouns are masculine or feminine; "none": no noun gender. Unset: the model decides. */
  gender?: "mf" | "none";
  /** A context note example for the extraction prompt. */
  contextNoteExample?: string;
  /** Examples of a form in a sentence next to its lemma. */
  formExamples?: string;
  /** Examples of inflected input forms next to their lemma. */
  inflectedExamples?: string;
  grammarNaming?: {
    /** Example construct names. */
    examples: string;
    /** Example of generalizing a trigger word to its class. */
    triggerWord: string;
    /** Example patterns made of grammatical categories. */
    patterns: string;
  };
}

const PROFILES: Record<LanguageCode, LanguageProfile> = {
  fr: {
    splitting: `Separate elided and contracted forms into their component words: "qu'elle" → "que" + "elle", "l'arbre" → "le" + "arbre", "du" → "de" + "le", "au" → "à" + "le", "jusqu'à" → "jusque" + "à".`,
    expressionExamples: ["se rendre compte", "avoir besoin de", "tout à fait", "au fur et à mesure"],
    ordinaryCombinationExamples: ["le dernier train", "jusqu'à minuit", "hier soir"],
    verbLemmaNote: `reflexive verbs with "se", elided before a vowel: "s'asseoir"`,
    nounExamples: ["quai", "arbre", "envie"],
    pluralOnlyExample: "gens",
    gender: "mf",
    contextNoteExample: `"to go" for the reflexive "se rendre à"`,
    formExamples: `"assise" for "s'asseoir", "s'est rendu compte" for "se rendre compte"`,
    inflectedExamples: `"assise" → "s'asseoir", "chevaux" → "cheval"`,
    grammarNaming: {
      examples: `"gérondif (en + participe présent)", "subjonctif (après conjonction de concession)", "ne … que (restriction)"`,
      triggerWord: `"bien que" → conjonction de concession`,
      patterns: "infinitif, participe passé, que + subjonctif",
    },
  },
};

export function getProfile(language: LanguageCode): LanguageProfile {
  return PROFILES[language] ?? {};
}
