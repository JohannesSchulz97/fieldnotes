/** A word of a sentence: its text and where it sits in the sentence string. */
export interface Token {
  text: string;
  start: number;
  end: number;
}

/**
 * A group of consecutive words that translate as one unit, with its meaning in this sentence.
 * from/to are inclusive indices into tokenizeSentence of the sentence.
 */
export interface Gloss {
  from: number;
  to: number;
  gloss: string;
}

/** The most words one gloss may cover. Longer groups are dropped as the model's overreach. */
export const MAX_GLOSS_TOKENS = 4;

// Letter runs, with hyphens between letters kept inside ("peut-être"). Apostrophes split, so an
// elided "l'homme" is the two words "l" and "homme". Digits and punctuation are not words.
const WORD = /\p{L}[\p{L}\p{M}]*(?:-\p{L}[\p{L}\p{M}]*)*/gu;

/**
 * Splits a sentence into words. Shared by the translation step (which glosses by index) and the
 * reading view (which renders by index), so it must be deterministic and not depend on the language.
 */
export function tokenizeSentence(sentence: string): Token[] {
  return [...sentence.matchAll(WORD)].map((m) => ({
    text: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));
}

/**
 * Keeps the usable groups of a model's answer: in bounds, not too long, with a gloss, and not
 * overlapping an earlier group. Sorted by position. Anything else is dropped, never repaired.
 */
export function validGlosses(candidates: Gloss[], tokenCount: number): Gloss[] {
  const sorted = candidates
    .filter(
      (g) =>
        Number.isInteger(g.from) &&
        Number.isInteger(g.to) &&
        g.from >= 0 &&
        g.to >= g.from &&
        g.to < tokenCount &&
        g.to - g.from < MAX_GLOSS_TOKENS &&
        g.gloss.trim() !== ""
    )
    .sort((a, b) => a.from - b.from || b.to - a.to);
  const kept: Gloss[] = [];
  for (const g of sorted) {
    if (kept.length === 0 || g.from > kept[kept.length - 1].to) {
      kept.push({ from: g.from, to: g.to, gloss: g.gloss.trim() });
    }
  }
  return kept;
}
