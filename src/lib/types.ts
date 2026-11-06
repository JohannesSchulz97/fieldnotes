import type { CEFR_LEVELS, GRAMMAR_CATEGORY_VALUES } from "./grammar";
import type { PARTS_OF_SPEECH } from "./lemma";
import type { Gloss } from "./tokens";

/** ISO 639-1 language code, e.g. "fr", "en". */
export type LanguageCode = string;

/** known = real vocabulary you know; ignored = not vocabulary (names, places, numbers, typos). */
export type WordStatus = "known" | "ignored";

/** Where an entry came from. Informational only; all sources count the same for matching. */
export type WordSource = "extraction" | "manual" | "anki" | "basic";

/** "expression" = multi-word unit, e.g. French "se rendre compte". */
export type WordKind = "word" | "expression";

/** Grammatical gender of a noun. Null for non-nouns and languages without gender. */
export type Gender = "m" | "f";

/** Closed set, see PARTS_OF_SPEECH. */
export type PartOfSpeech = (typeof PARTS_OF_SPEECH)[number];

/** A stored vocabulary entry. Identity: (language, lemma, and for words class of part of speech and gender), see vocabKey. */
export interface VocabEntry {
  id: string;
  language: LanguageCode;
  lemma: string;
  /** Part of identity for words. Null only for expressions, which may also have one. */
  partOfSpeech: PartOfSpeech | null;
  kind: WordKind;
  /** Part of identity for words. Nouns only: the lemma is bare ("quai"); gender and plural-only drive how it is displayed. */
  gender: Gender | null;
  pluralOnly: boolean;
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
  /** Items saved before the set was closed may hold other text; read them through normalizePartOfSpeech. */
  partOfSpeech: PartOfSpeech | null;
  kind: WordKind;
  /** Nouns only; see VocabEntry. Absent on items extracted before gender was stored. */
  gender?: Gender | null;
  pluralOnly?: boolean;
  /** Common translation(s) in general use, separated by ", ". This is what goes on flashcards. */
  translation: string;
  /** The sense used in the text, if the translation does not cover it. Shown in the UI only, never exported. */
  contextNote?: string | null;
  exampleSentence: string;
  /** The item exactly as it appears in exampleSentence, e.g. "assise" for "s'asseoir". */
  form: string;
}

/** A known entry that shares its lemma with a new item but is another word, e.g. "son" the noun and the determiner. */
export interface KnownHomograph {
  lemma: string;
  partOfSpeech: PartOfSpeech | null;
  kind: WordKind;
  gender: Gender | null;
  translation: string | null;
}

/** An item that was new when the text was extracted and has since been exported to Anki. */
export interface LearnedItem extends ExtractedItem {
  exportedAt: string;
}

/** text = a pasted text; exercises = the per-language collection of words picked up in exercises. */
export type SourceKind = "text" | "exercises";

/** A saved extraction, with its items split against the current vocabulary. */
export interface ExtractionResult {
  id: string;
  kind: SourceKind;
  text: string;
  title: string | null;
  sourceUrl: string | null;
  /** The text split into paragraphs of sentences; sentence numbers count across paragraphs. */
  paragraphs: string[][];
  /** Translation into the target language per sentence (same numbering); null until translated. */
  translations: string[] | null;
  /** Word glosses per sentence (same numbering); null until the text is glossed. */
  glosses: Gloss[][] | null;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  /** Items not yet in the vocabulary DB. Ignored items appear in no list. */
  items: ExtractedItem[];
  /** For new items whose lemma is known under another key: the known entries, by vocabKey of the item. */
  homographs: Record<string, KnownHomograph[]>;
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
  title: string | null;
  sourceUrl: string | null;
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

/** Language-independent grammar area, see GRAMMAR_CATEGORIES. */
export type GrammarCategory = (typeof GRAMMAR_CATEGORY_VALUES)[number];

/** CEFR level, A1 to C2. For grammar items it is the LLM's estimate. */
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** A short example of a construct; form is the part that shows it, copied exactly from sentence. */
export interface GrammarExampleInput {
  sentence: string;
  form: string;
  translation: string;
}

/** A construct found in a selection. item is set when it matches a saved grammar item. */
export interface IdentifiedConstruct {
  /** The catalogue construct; null if named freely (no catalogue, or not in it). */
  constructId: string | null;
  name: string;
  category: GrammarCategory;
  level: CefrLevel;
  /** The words of the selection that show the construct. */
  form: string;
  /** One line on what the construct does here. */
  gist: string;
  item: GrammarItem | null;
}

/** The constructs in a selection, plus all saved items of its language (to attach to manually). */
export interface GrammarIdentification {
  /** Whether the language has a grammar catalogue; constructs without a constructId are then not in it. */
  hasCatalog: boolean;
  constructs: IdentifiedConstruct[];
  savedItems: { id: string; name: string }[];
}

/** The LLM's explanation of a new construct. Not stored until the user saves it. */
export interface GrammarExplanation {
  explanation: string;
  /** Short generated examples; the selected sentence is added as another example on save. */
  examples: GrammarExampleInput[];
}

export interface GrammarExample {
  id: string;
  origin: GrammarExampleOrigin;
  sentence: string;
  form: string;
  translation: string | null;
  /** For source examples: where the sentence was selected. */
  extractionId: string | null;
  sentenceIndex: number | null;
}

/** A saved grammar item with its examples (source examples first). Identity: (language, name). */
export interface GrammarItem {
  id: string;
  language: LanguageCode;
  /** The catalogue construct; name, category, level and explanation then come from the catalogue. */
  constructId: string | null;
  name: string;
  category: GrammarCategory;
  /** From the catalogue's sources, or estimated by the LLM; sources differ by a level at the boundaries. */
  level: CefrLevel;
  explanation: string;
  /** Typical mistakes, from the catalogue card. */
  pitfalls: string[];
  /** Related constructs it is easily confused with, from the catalogue card. */
  contrasts: { name: string; note: string }[];
  status: GrammarStatus;
  examples: GrammarExample[];
  createdAt: string;
  updatedAt: string;
}

/** A content word of an exercise sentence. */
export interface ExerciseWord {
  /** The word exactly as it appears in the sentence. */
  form: string;
  lemma: string;
  /** Absent on words generated before these were stored; such words match the vocabulary by lemma alone. */
  partOfSpeech?: PartOfSpeech | null;
  gender?: Gender | null;
  kind?: WordKind;
  translation: string;
}

/**
 * known = in the vocabulary (known or ignored); studying = in the Exercises source, to be exported;
 * unknown = neither.
 */
export type WordStudyStatus = "known" | "studying" | "unknown";

/** A fill-in-the-blank exercise: before + answer + after is the full sentence. */
export interface Exercise {
  id: string;
  before: string;
  answer: string;
  after: string;
  /** Other answers that are also correct. */
  alternatives: string[];
  /** Hint shown next to the blank, usually the base form. */
  cue: string;
  translation: string;
  /** Why this form is needed here. */
  reason: string;
  words: ExerciseWord[];
  /** The latest answer, if the exercise was answered. */
  lastAttempt: { answer: string; correct: boolean } | null;
}

/** One row in the list of exercise sets. */
export interface ExerciseSetSummary {
  id: string;
  grammarItemId: string;
  grammarItemName: string;
  level: CefrLevel;
  total: number;
  /** Exercises with an attempt, and of those, the ones whose latest attempt is correct. */
  answered: number;
  correct: number;
  createdAt: string;
}

/** An exercise set with its exercises in order and the construct it practises. */
export interface ExerciseSet {
  id: string;
  language: LanguageCode;
  level: CefrLevel;
  item: { id: string; name: string; explanation: string; status: GrammarStatus };
  exercises: Exercise[];
  /** Status of every word of the exercises, by vocabKey. */
  wordStatus: Record<string, WordStudyStatus>;
  /** The language's exercises source, once a word was added to it. */
  exercisesSourceId: string | null;
  createdAt: string;
}

/** How the Anki export builds cards. */
export interface AnkiSettings {
  /** learning-native: the learned language on the front; native-learning: the native language on the front; both: one note, two cards. */
  direction: "learning-native" | "native-learning" | "both";
  /** Which card field gets the example sentence ("front" = the learned-language field when direction is "both"). */
  example: "off" | "front" | "back";
  /** Add the translated sentence under the example, if the text was translated. */
  sentenceTranslation: boolean;
  /** Show the part of speech on the back of the card. */
  partOfSpeech: boolean;
}
