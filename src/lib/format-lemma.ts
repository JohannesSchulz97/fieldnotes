import type { Gender, LanguageCode, WordKind } from "./types";

/** The parts of an item that decide how its lemma is shown. */
export interface LemmaDisplay {
  lemma: string;
  kind: WordKind;
  partOfSpeech: string | null;
  gender?: Gender | null;
  pluralOnly?: boolean;
}

type Formatter = (item: LemmaDisplay) => string;

/** Common French words with an aspirated h, which block elision ("le héros", not "l'héros"). */
const ASPIRATED_H = new Set([
  "hache", "haie", "haine", "hall", "hamac", "hamster", "hanche", "handicap", "hangar", "haricot",
  "harcèlement", "hasard", "hâte", "hauteur", "havre", "héros", "hibou", "hockey", "homard", "honte",
  "hublot", "huit", "hurlement", "hérisson",
]);

function frenchFormatter({ lemma, partOfSpeech, gender, pluralOnly }: LemmaDisplay): string {
  if (partOfSpeech !== "noun") return lemma;
  if (pluralOnly) return `les ${lemma}`;
  if (!gender) return lemma;
  const startsWithVowel = /^[aeiouyàâäéèêëîïôöùûüœæ]/i.test(lemma);
  const mutedH = /^h/i.test(lemma) && !ASPIRATED_H.has(lemma.toLowerCase());
  const article = startsWithVowel || mutedH ? "l'" : gender === "m" ? "le " : "la ";
  return `${article}${lemma} (${gender})`;
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
  return (FORMATTERS[language] ?? ((i) => i.lemma))(item);
}
