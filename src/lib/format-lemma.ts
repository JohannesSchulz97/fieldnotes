import type { Gender, LanguageCode, PartOfSpeech, WordKind } from "./types";

/** The parts of an item that decide how its lemma is shown. */
export interface LemmaDisplay {
  lemma: string;
  kind: WordKind;
  partOfSpeech: string | null;
  gender?: Gender | null;
  pluralOnly?: boolean;
  /** Irregular principal forms written after the headword, e.g. "-aux"; shown with the lemma when given. */
  forms?: string | null;
}

type Formatter = (item: LemmaDisplay) => string;

/** Common French words with an aspirated h, which block elision ("le héros", not "l'héros"). */
const ASPIRATED_H = new Set([
  "hâbleur", "hache", "hachis", "hagard", "haie", "haillon", "haine", "halage", "hall",
  "halle", "halo", "halte", "haltère", "hamac", "hamburger", "hameau", "hamster", "hanche",
  "handball", "handicap", "hangar", "hanneton", "hardes", "harem",
  "hareng", "hargne", "haricot", "harnais", "harpe", "harpon", "hasard", "hâte", "hausse", "haut",
  "hauteur", "havre", "hayon", "hérisson", "héron", "héros", "hêtre", "hibou",
  "hic", "hockey", "hollandais", "homard", "honte", "hoquet", "horde", "hors-d'œuvre",
  "hotte", "houle", "houppe", "housse", "houx", "hublot", "huche", "huée", "huit",
  "hutte", "hyène"
]);

/** The lemma with its forms behind it: "cheval, -aux". */
const withForms = (lemma: string, forms: string | null | undefined) =>
  forms ? `${lemma}, ${forms}` : lemma;

function frenchFormatter({ lemma, partOfSpeech, gender, pluralOnly, forms }: LemmaDisplay): string {
  if (partOfSpeech !== "noun") return withForms(lemma, forms);
  if (pluralOnly) return `les ${withForms(lemma, forms)}`;
  if (!gender) return withForms(lemma, forms);
  const startsWithVowel = /^[aeiouyàâäéèêëîïôöùûüœæ]/i.test(lemma);
  const mutedH = /^h/i.test(lemma) && !ASPIRATED_H.has(lemma.toLowerCase());
  const article = startsWithVowel || mutedH ? "l'" : gender === "m" ? "le " : "la ";
  return `${article}${withForms(lemma, forms)} (${gender})`;
}

/** Per-language display rules. Languages without an entry show the bare lemma. */
const FORMATTERS: Record<LanguageCode, Formatter> = {
  fr: frenchFormatter,
};

/**
 * How a lemma is shown to the user and on flashcards. The stored lemma is bare ("quai");
 * articles and gender markers are display rules that belong to the language.
 */
export function formatLemma(language: LanguageCode, item: LemmaDisplay): string {
  return (FORMATTERS[language] ?? ((i) => withForms(i.lemma, i.forms)))(item);
}

/** Part of speech and gender in short, e.g. "noun, f": what tells apart words that share a lemma. */
export function formatPartOfSpeech(item: Pick<LemmaDisplay, "partOfSpeech" | "gender">): string {
  return [item.partOfSpeech, item.gender].filter(Boolean).join(", ");
}

/** Short part-of-speech labels per native language. A language without an entry shows the raw value. */
const PART_OF_SPEECH_LABELS: Record<LanguageCode, Record<PartOfSpeech, string>> = {
  en: {
    noun: "n.",
    verb: "v.",
    adjective: "adj.",
    adverb: "adv.",
    pronoun: "pron.",
    determiner: "det.",
    preposition: "prep.",
    conjunction: "conj.",
    interjection: "interj.",
    numeral: "num.",
  },
};

/** The part of speech as a short label in the native language, e.g. "adj." */
export function partOfSpeechLabel(native: LanguageCode, partOfSpeech: PartOfSpeech): string {
  return PART_OF_SPEECH_LABELS[native]?.[partOfSpeech] ?? partOfSpeech;
}
