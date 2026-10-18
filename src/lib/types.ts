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
  /** Common translation(s) in general use, separated by ", ". This is what goes on flashcards. */
  translation: string;
  /** The sense used in the text, if the translation does not cover it. Shown in the UI only, never exported. */
  contextNote?: string | null;
  exampleSentence: string;
  /** The item exactly as it appears in exampleSentence, e.g. "assise" for "s'asseoir". */
  form: string;
}

/** An item that was new when the text was extracted and has since been exported to Anki. */
export interface LearnedItem extends ExtractedItem {
  exportedAt: string;
}

/** A saved extraction, with its items split against the current vocabulary. */
export interface ExtractionResult {
  id: string;
  text: string;
  /** The text split into paragraphs of sentences; sentence numbers count across paragraphs. */
  paragraphs: string[][];
  /** English translation per sentence (same numbering); null until translated. */
  translations: string[] | null;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  /** Items not yet in the vocabulary DB. Ignored items appear in no list. */
  items: ExtractedItem[];
  /** Items exported to Anki from this text (added to the vocabulary after the extraction). */
  learnedItems: LearnedItem[];
  /** Items known before the extraction, or marked known since. */
  knownItems: ExtractedItem[];
  /** Cost of the latest LLM run for this text in USD; null if the model has no known price. */
  costUsd: number | null;
  createdAt: string;
  updatedAt: string;
}

/** One row in the list of past extractions. */
export interface ExtractionSummary {
  id: string;
  /** Start of the text, for display. */
  preview: string;
  newCount: number;
  totalCount: number;
  createdAt: string;
}

/** to_work_on = still practicing; learned = no longer needs attention. */
export type GrammarStatus = "to_work_on" | "learned";

/** source = the sentence it was selected in; generated = a short example written by the LLM. */
export type GrammarExampleOrigin = "source" | "generated";

/** A short example of a construct; form is the part that shows it, copied exactly from sentence. */
export interface GrammarExampleInput {
  sentence: string;
  form: string;
  translation: string;
}

/** The LLM's analysis of a selected span. Not stored until the user saves it. */
export interface GrammarAnalysis {
  /** Canonical name of the main construct, reused across texts so items merge. */
  name: string;
  /** General explanation of the construct, independent of the selected text. */
  explanation: string;
  /** How the construct works in the selected span. */
  note: string;
  examples: GrammarExampleInput[];
}

export interface GrammarExample {
  id: string;
  origin: GrammarExampleOrigin;
  sentence: string;
  form: string;
  translation: string | null;
  note: string | null;
  extractionId: string | null;
}

/** A saved grammar item with its examples (source examples first). Identity: (language, name). */
export interface GrammarItem {
  id: string;
  language: LanguageCode;
  name: string;
  explanation: string;
  status: GrammarStatus;
  examples: GrammarExample[];
  createdAt: string;
  updatedAt: string;
}

/** How the Anki export builds cards. */
export interface AnkiSettings {
  /** fr-en: French on the front; en-fr: English on the front; both: one note, two cards. */
  direction: "fr-en" | "en-fr" | "both";
  /** Which card field gets the example sentence ("front" = the French field when direction is "both"). */
  example: "off" | "front" | "back";
  /** Add the English sentence under the example, if the text was translated. */
  sentenceTranslation: boolean;
  /** Show the part of speech on the back of the card. */
  partOfSpeech: boolean;
}
