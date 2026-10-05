/** ISO 639-1 language code, e.g. "fr", "en". */
export type LanguageCode = string;

/** known = real vocabulary you know; ignored = not vocabulary (names, places, numbers, typos). */
export type WordStatus = "known" | "ignored";

/** Where an entry came from. Informational only; all sources count the same for matching. */
export type WordSource = "extraction" | "manual" | "anki" | "basic";

/** "expression" = multi-word unit, e.g. "se rendre compte". */
export type WordKind = "word" | "expression";

/** A stored vocabulary entry. Identity: (language, lemma). */
export interface VocabEntry {
  id: string;
  language: LanguageCode;
  lemma: string;
  /** Informational only, not part of identity. */
  partOfSpeech: string | null;
  kind: WordKind;
  status: WordStatus;
  source: WordSource;
  translation: string | null;
  translationLanguage: LanguageCode;
  exampleSentence: string | null;
  /** Set when exported to Anki (export also marks the entry known). */
  exportedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** An unknown word/expression found in a pasted text. */
export interface ExtractedItem {
  lemma: string;
  partOfSpeech: string | null;
  kind: WordKind;
  /** Context-aware translation. */
  translation: string;
  exampleSentence: string;
  /** The item exactly as it appears in exampleSentence, e.g. "assise" for "s'asseoir". */
  form: string;
}

export interface ExtractionResult {
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  /** Items not yet in the vocabulary DB. */
  items: ExtractedItem[];
  /** Items already stored with status "known". Ignored items appear in neither list. */
  knownItems: ExtractedItem[];
  stats: {
    totalLemmas: number;
    knownCount: number;
    unknownCount: number;
  };
}
