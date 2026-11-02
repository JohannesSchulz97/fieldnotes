import type { Gender, PartOfSpeech, WordKind } from "./types";

/** Canonical lemma spelling: typographic apostrophes (’ ‘ ʼ) become ', so "l’an" matches "l'an". */
export function normalizeLemma(lemma: string): string {
  return lemma.replace(/[’‘ʼ]/g, "'").trim();
}

/**
 * The parts of speech a vocabulary entry can have. Closed, because its class (see keyClass) is part
 * of an entry's identity. A word always has one; expressions may lack it.
 */
export const PARTS_OF_SPEECH = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "determiner",
  "preposition",
  "conjunction",
  "interjection",
  "numeral",
] as const;

/** Free-text values stored before the set was closed. Keep in sync with the vocab_entries migration. */
const LEGACY_PARTS_OF_SPEECH: Record<string, PartOfSpeech> = {
  "preposition+determiner": "determiner",
};

const warned = new Set<string>();

/** Maps a stored or model-given part of speech onto the closed set. Unknown values become null and are logged. */
export function normalizePartOfSpeech(raw: string | null | undefined): PartOfSpeech | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  if ((PARTS_OF_SPEECH as readonly string[]).includes(value)) return value as PartOfSpeech;
  if (Object.hasOwn(LEGACY_PARTS_OF_SPEECH, value)) return LEGACY_PARTS_OF_SPEECH[value];
  if (!warned.has(value)) {
    warned.add(value);
    console.warn(`Unknown part of speech "${value}", treated as none`);
  }
  return null;
}

/** What identifies a vocabulary entry besides its language. Absent fields are treated as null. */
export interface KeyedItem {
  lemma: string;
  partOfSpeech?: string | null;
  /** Nouns only. Undefined (not null) means gender was not recorded for this item at all. */
  gender?: Gender | null;
  /** Undefined means kind was not recorded (old exercise words); treated as a word. */
  kind?: WordKind;
}

/**
 * The class of a part of speech that counts for identity: "noun", "verb" or "other". Part of
 * speech belongs to a word in a sentence, not to the lemma ("non" is an adverb in "je pense que non",
 * an interjection in "Non !"), so the model's label varies between texts. The boundaries between
 * the other classes (adjective/adverb, preposition/adverb, determiner/pronoun, ...) flip all the
 * time without being different words; the noun and verb boundaries rarely do, and the real
 * homographs split by part of speech mostly lie across them ("son" determiner vs. noun, "pas").
 * See #50.
 */
function keyClass(pos: PartOfSpeech | null): string {
  if (pos === null) return "-";
  return pos === "noun" || pos === "verb" ? pos : "other";
}

/**
 * The part of an entry's key that tells homographs apart, e.g. "noun|f". Stored as
 * vocab_entries.homograph_key. Only words have one: an expression's part of speech is the model's
 * guess at its role, not deterministic, and its words already set it apart. Built from the class of
 * the part of speech (keyClass), plus gender for nouns.
 */
export function homographKey(item: Pick<KeyedItem, "partOfSpeech" | "gender" | "kind">): string {
  if (item.kind === "expression") return "-|-";
  const pos = normalizePartOfSpeech(item.partOfSpeech);
  return `${keyClass(pos)}|${(pos === "noun" && item.gender) || "-"}`;
}

/** Whether an item is a word used as an interjection, which is a use of a word, not a word class ("Attention !"). */
function isInterjection(item: KeyedItem): boolean {
  return item.kind !== "expression" && normalizePartOfSpeech(item.partOfSpeech) === "interjection";
}

/**
 * The identity of a vocabulary entry within a language: lemma, plus class of part of speech and
 * gender for words. Every lookup and comparison of entries goes through this; no other code builds keys.
 */
export function vocabKey(item: KeyedItem): string {
  return `${normalizeLemma(item.lemma)}|${homographKey(item)}`;
}

/**
 * Whether an item lacks a part of speech or gender it should have, as items extracted before
 * gender was stored or exercise words do. Such items cannot be matched by key, only by lemma.
 */
function lacksKeyParts(item: KeyedItem): boolean {
  if (item.kind === "expression") return false;
  const pos = normalizePartOfSpeech(item.partOfSpeech);
  if (pos === null) return true;
  return pos === "noun" && item.gender === undefined;
}

/**
 * Whether a stored entry lacks a part of speech or gender, so items of its lemma can only be
 * matched to it by lemma: a word stored without part of speech, or a noun without gender (plural-only
 * nouns, nouns stored before gender was). The stored null cannot tell "unknown" from "none", so
 * this also covers nouns of languages without gender; there an item matches by key first anyway.
 */
function storedLacksKeyParts(entry: KeyedItem): boolean {
  if (entry.kind === "expression") return false;
  const pos = normalizePartOfSpeech(entry.partOfSpeech);
  return pos === null || (pos === "noun" && !entry.gender);
}

/**
 * Finds the stored entry an item stands for, among entries keyed by vocabKey:
 * 1. an exact key match;
 * 2. for an item that lacks part of speech or gender, an entry with the same lemma;
 *    for an item of a stored entry that lacks them, that entry if the class of part of speech
 *    agrees; for a word used as an interjection, or of a stored interjection, any word entry
 *    with the same lemma ("attention" the noun) (a known entry first in all cases);
 * 3. otherwise none: the item is new.
 */
export function matchStored<T extends KeyedItem & { status?: string }>(
  stored: ReadonlyMap<string, T>,
  item: KeyedItem
): T | undefined {
  const exact = stored.get(vocabKey(item));
  if (exact) return exact;
  const itemLacks = lacksKeyParts(item);
  const itemClass = keyClass(normalizePartOfSpeech(item.partOfSpeech));
  const fits = (entry: T) =>
    itemLacks ||
    (item.kind !== "expression" &&
      entry.kind !== "expression" &&
      (isInterjection(item) || isInterjection(entry))) ||
    (item.kind !== "expression" &&
      storedLacksKeyParts(entry) &&
      (entry.partOfSpeech == null ||
        keyClass(normalizePartOfSpeech(entry.partOfSpeech)) === itemClass));
  const lemma = normalizeLemma(item.lemma);
  let found: T | undefined;
  for (const entry of stored.values()) {
    if (normalizeLemma(entry.lemma) !== lemma || !fits(entry)) continue;
    if (entry.status === "known") return entry;
    found ??= entry;
  }
  return found;
}

/** Items by their vocabKey; of items with the same key, the first one counts. */
export function keyItems<T extends KeyedItem>(items: T[]): Map<string, T> {
  const keyed = new Map<string, T>();
  for (const item of items) {
    const key = vocabKey(item);
    if (!keyed.has(key)) keyed.set(key, item);
  }
  return keyed;
}
